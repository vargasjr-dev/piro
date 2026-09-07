"""Small Backblaze B2 native-upload client for Modal workers."""

from __future__ import annotations

import base64
import hashlib
import json
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

B2_API_URL = "https://api.backblazeb2.com/b2api/v4"
B2_BUCKET = "piro-kb"


def _json_request(
    url: str,
    *,
    method: str,
    headers: dict[str, str],
    body: bytes | None = None,
) -> dict:
    request = Request(
        url,
        data=body,
        headers={"User-Agent": "piro-modal/1.0", **headers},
        method=method,
    )
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(
            f"Backblaze B2 API request failed with HTTP {error.code}: {detail}"
        ) from error


def _authorize(os_module) -> tuple[str, str, str]:
    key_id = os_module.environ["BUCKET_KEY_ID"]
    application_key = os_module.environ["BUCKET_APPLICATION_SECRET"]
    credentials = base64.b64encode(f"{key_id}:{application_key}".encode()).decode()
    auth = _json_request(
        f"{B2_API_URL}/b2_authorize_account",
        method="GET",
        headers={"Authorization": f"Basic {credentials}"},
    )

    storage_api = auth.get("apiInfo", {}).get("storageApi", {})
    api_url = auth.get("apiUrl") or storage_api.get("apiUrl")
    if not api_url:
        raise RuntimeError("Backblaze authorization response did not include an API URL")

    allowed = auth.get("allowed") or storage_api.get("allowed") or {}
    bucket_id = allowed.get("bucketId")
    if not bucket_id:
        allowed_buckets = allowed.get("buckets") or []
        matching_bucket = next(
            (item for item in allowed_buckets if item.get("name") == B2_BUCKET),
            None,
        )
        if matching_bucket is None and len(allowed_buckets) == 1:
            matching_bucket = allowed_buckets[0]
        if matching_bucket:
            bucket_id = matching_bucket.get("id") or matching_bucket.get("bucketId")
    if not bucket_id:
        buckets = _json_request(
            f"{api_url}/b2api/v4/b2_list_buckets",
            method="POST",
            headers={
                "Authorization": auth["authorizationToken"],
                "Content-Type": "application/json",
            },
            body=json.dumps(
                {"accountId": auth["accountId"], "bucketName": B2_BUCKET}
            ).encode("utf-8"),
        )
        bucket = next(
            (
                item
                for item in buckets.get("buckets", [])
                if item.get("bucketName") == B2_BUCKET
            ),
            None,
        )
        if not bucket:
            raise RuntimeError(f"Backblaze bucket {B2_BUCKET!r} was not found")
        bucket_id = bucket.get("bucketId") or bucket.get("id")
    if not bucket_id:
        raise RuntimeError(f"Backblaze bucket {B2_BUCKET!r} has no ID")

    return api_url, auth["authorizationToken"], bucket_id


def _upload_target(os_module) -> tuple[str, str]:
    api_url, authorization, bucket_id = _authorize(os_module)
    upload = _json_request(
        f"{api_url}/b2api/v4/b2_get_upload_url",
        method="POST",
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json",
        },
        body=json.dumps({"bucketId": bucket_id}).encode("utf-8"),
    )
    return upload["uploadUrl"], upload["authorizationToken"]


def list_file_versions(os_module, *, prefix: str) -> list[dict]:
    """List every B2 file version whose name starts with ``prefix``."""
    api_url, authorization, bucket_id = _authorize(os_module)
    versions: list[dict] = []
    start_file_name = None
    start_file_id = None
    while True:
        body = {
            "bucketId": bucket_id,
            "prefix": prefix,
            "maxFileCount": 1000,
        }
        if start_file_name is not None:
            body["startFileName"] = start_file_name
            body["startFileId"] = start_file_id
        response = _json_request(
            f"{api_url}/b2api/v4/b2_list_file_versions",
            method="POST",
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
            },
            body=json.dumps(body).encode("utf-8"),
        )
        versions.extend(response.get("files", []))
        next_file_name = response.get("nextFileName")
        next_file_id = response.get("nextFileId")
        if not next_file_name or not next_file_id:
            break
        if (next_file_name, next_file_id) == (start_file_name, start_file_id):
            raise RuntimeError("Backblaze version listing did not advance")
        start_file_name = next_file_name
        start_file_id = next_file_id
    return versions


def _delete_file_version(
    api_url: str, authorization: str, *, file_name: str, file_id: str
) -> None:
    _json_request(
        f"{api_url}/b2api/v4/b2_delete_file_version",
        method="POST",
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json",
        },
        body=json.dumps({"fileName": file_name, "fileId": file_id}).encode("utf-8"),
    )


def delete_listed_file_versions(os_module, *, versions: list[dict]) -> int:
    """Permanently delete the supplied B2 file versions with one auth session."""
    api_url, authorization, _bucket_id = _authorize(os_module)
    deletable = [
        version
        for version in versions
        if version.get("fileName") and version.get("fileId")
    ]
    for version in deletable:
        _delete_file_version(
            api_url,
            authorization,
            file_name=version["fileName"],
            file_id=version["fileId"],
        )
    return len(deletable)


def delete_file_versions(os_module, *, file_name: str) -> int:
    """Permanently delete every stored version of one B2 file name.

    S3 DeleteObject only creates a hidden marker in B2. Training checkpoints
    use unique names, so retention must enumerate their file IDs and call the
    native delete-file-version endpoint to release the stored bytes.
    """
    versions = [
        version
        for version in list_file_versions(os_module, prefix=file_name)
        if version.get("fileName") == file_name
    ]
    return delete_listed_file_versions(os_module, versions=versions)


def put_object(
    os_module,
    *,
    key: str,
    body: bytes,
    content_type: str,
    attempts: int = 5,
) -> None:
    """Upload one object with a fresh native B2 target for each attempt."""
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            upload_url, authorization = _upload_target(os_module)
            request = Request(
                upload_url,
                data=body,
                headers={
                    "User-Agent": "piro-modal/1.0",
                    "Authorization": authorization,
                    "X-Bz-File-Name": quote(key, safe=""),
                    "Content-Type": content_type,
                    "Content-Length": str(len(body)),
                    "X-Bz-Content-Sha1": hashlib.sha1(body).hexdigest(),
                },
                method="POST",
            )
            with urlopen(request, timeout=120) as response:
                response.read()
            return
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:2000]
            last_error = RuntimeError(
                f"Backblaze B2 upload failed with HTTP {error.code}: {detail}"
            )
            if error.code < 500:
                raise last_error from error
        except Exception as error:
            last_error = error
        if attempt < attempts:
            time.sleep(attempt)

    raise RuntimeError(
        f"Backblaze B2 upload failed after {attempts} attempts: {last_error}"
    ) from last_error
