import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import patch
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "modal"))

import b2


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class B2UploadTest(TestCase):
    def test_upload_uses_fresh_target_and_required_raw_body_headers(self):
        calls = []
        upload_attempts = 0

        def fake_urlopen(request, timeout):
            nonlocal upload_attempts
            self.assertIn(request.full_url, {
                "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
                "https://api.example.test/b2api/v4/b2_get_upload_url",
                "https://upload-1.example.test/file",
                "https://upload-2.example.test/file",
            })
            if request.full_url.endswith("b2_authorize_account"):
                calls.append(("authorize", request))
                return FakeResponse(
                    {
                        "accountId": "account-id",
                        "authorizationToken": "account-token",
                        "apiInfo": {
                            "storageApi": {
                                "apiUrl": "https://api.example.test",
                                "allowed": {
                                    "buckets": [{"id": "bucket-id", "name": "piro-kb"}]
                                },
                            }
                        },
                    }
                )
            if request.full_url.endswith("b2_get_upload_url"):
                calls.append(("target", request))
                target_number = len([kind for kind, _ in calls if kind == "target"])
                return FakeResponse(
                    {
                        "uploadUrl": f"https://upload-{target_number}.example.test/file",
                        "authorizationToken": f"upload-token-{target_number}",
                    }
                )

            upload_attempts += 1
            calls.append(("upload", request))
            if upload_attempts == 1:
                raise URLError("simulated connection reset")
            return FakeResponse({"fileId": "file-id"})

        body = b"checkpoint bytes"
        environment = SimpleNamespace(
            environ={
                "BUCKET_KEY_ID": "key-id",
                "BUCKET_APPLICATION_SECRET": "application-secret",
            }
        )
        with patch.object(b2, "urlopen", side_effect=fake_urlopen), patch.object(
            b2.time, "sleep"
        ) as sleep:
            b2.put_object(
                environment,
                key="checkpoints/run-id/step-500.pt",
                body=body,
                content_type="application/octet-stream",
                attempts=2,
            )

        uploads = [request for kind, request in calls if kind == "upload"]
        self.assertEqual(len(uploads), 2)
        self.assertEqual(uploads[0].full_url, "https://upload-1.example.test/file")
        self.assertEqual(uploads[1].full_url, "https://upload-2.example.test/file")
        request = uploads[1]
        self.assertEqual(request.data, body)
        self.assertEqual(request.get_header("Content-length"), str(len(body)))
        self.assertEqual(
            request.get_header("X-bz-content-sha1"), hashlib.sha1(body).hexdigest()
        )
        self.assertEqual(
            request.get_header("X-bz-file-name"),
            "checkpoints%2Frun-id%2Fstep-500.pt",
        )
        self.assertEqual(request.get_header("Authorization"), "upload-token-2")
        sleep.assert_called_once_with(1)


if __name__ == "__main__":
    main()

class B2VersionDeletionTest(TestCase):
    def test_delete_file_versions_permanently_deletes_all_versions_for_a_name(self):
        calls = []

        def fake_urlopen(request, timeout):
            calls.append((request.full_url, json.loads(request.data.decode("utf-8"))))
            if request.full_url.endswith("b2_authorize_account"):
                return FakeResponse(
                    {
                        "accountId": "account-id",
                        "authorizationToken": "account-token",
                        "apiInfo": {
                            "storageApi": {
                                "apiUrl": "https://api.example.test",
                                "allowed": {
                                    "buckets": [{"id": "bucket-id", "name": "piro-kb"}]
                                },
                            }
                        },
                    }
                )
            if request.full_url.endswith("b2_list_file_versions"):
                return FakeResponse(
                    {
                        "files": [
                            {"fileName": "checkpoints/run/step-1.pt", "fileId": "upload-id"},
                            {"fileName": "checkpoints/run/step-1.pt", "fileId": "hide-id"},
                        ]
                    }
                )
            self.assertTrue(request.full_url.endswith("b2_delete_file_version"))
            return FakeResponse({"fileName": "checkpoints/run/step-1.pt"})

        environment = SimpleNamespace(
            environ={
                "BUCKET_KEY_ID": "key-id",
                "BUCKET_APPLICATION_SECRET": "application-secret",
            }
        )
        with patch.object(b2, "urlopen", side_effect=fake_urlopen):
            deleted = b2.delete_file_versions(
                environment,
                file_name="checkpoints/run/step-1.pt",
            )

        self.assertEqual(deleted, 2)
        self.assertEqual(
            [url.rsplit("/", 1)[-1] for url, _body in calls],
            [
                "b2_authorize_account",
                "b2_list_file_versions",
                "b2_authorize_account",
                "b2_delete_file_version",
                "b2_delete_file_version",
            ],
        )
        self.assertEqual(calls[-2][1]["fileId"], "upload-id")
        self.assertEqual(calls[-1][1]["fileId"], "hide-id")
