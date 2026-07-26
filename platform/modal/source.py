"""Piro Modal source-generation job and HTTP endpoint."""

from __future__ import annotations

from datetime import UTC

import modal
from _common import R2_BUCKET, _r2_client, app, image, piro_secrets


@app.function(image=image, secrets=[piro_secrets], timeout=3600)
def generate_source(body: dict) -> dict:
    """Execute a repository source and persist its JSONL dataset in R2."""
    import json
    import os
    import subprocess
    import sys
    import tempfile
    import urllib.request
    from datetime import datetime

    callback_url = str(body.get("callbackUrl", ""))
    callback_secret = str(body.get("secret", ""))
    r2_prefix = str(body.get("r2Prefix", "")).strip()
    source = body.get("source")
    entrypoint = str(body.get("entrypoint", "main.py"))

    if not callback_url or not r2_prefix or not isinstance(source, str) or not source.strip():
        raise ValueError("callbackUrl, r2Prefix, and source are required")
    if entrypoint not in {"main.py", "model.py", "script.py"}:
        raise ValueError("unsupported source entrypoint")

    def callback(payload: dict) -> None:
        request = urllib.request.Request(
            callback_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Piro-Secret": callback_secret,
            },
            method="PATCH",
        )
        with urllib.request.urlopen(request, timeout=30):
            pass

    callback({"status": "running"})
    try:
        with tempfile.TemporaryDirectory() as directory:
            source_file = os.path.join(directory, entrypoint)
            with open(source_file, "w", encoding="utf-8") as handle:
                handle.write(source)

            runtime_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            inherited_pythonpath = os.environ.get("PYTHONPATH", "")
            child_env = {
                key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL") if key in os.environ
            }
            child_env["PYTHONPATH"] = os.pathsep.join(
                path for path in (runtime_root, inherited_pythonpath) if path
            )
            result = subprocess.run(
                [sys.executable, source_file],
                cwd=directory,
                env=child_env,
                capture_output=True,
                text=True,
                timeout=3300,
                check=False,
            )
            if result.returncode != 0:
                detail = (
                    result.stderr.strip() or result.stdout.strip() or "source exited with an error"
                )
                raise RuntimeError(detail[-4000:])

            records = []
            for line_number, line in enumerate(result.stdout.splitlines(), start=1):
                if not line.strip():
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"source emitted invalid JSON on line {line_number}: {exc}"
                    ) from exc

            if not records:
                raise RuntimeError("source emitted no dataset records")

            train_jsonl = "".join(
                json.dumps(record, separators=(",", ":")) + "\n" for record in records
            )
            generated_at = datetime.now(UTC).isoformat()
            metadata = {
                "sourcePath": body.get("sourcePath"),
                "entrypoint": entrypoint,
                "sampleCount": len(records),
                "generatedAt": generated_at,
            }
            r2 = _r2_client(os)
            prefix = r2_prefix.rstrip("/")
            r2.put_object(
                Bucket=R2_BUCKET,
                Key=f"{prefix}/train.jsonl",
                Body=train_jsonl.encode("utf-8"),
                ContentType="application/x-ndjson",
            )
            r2.put_object(
                Bucket=R2_BUCKET,
                Key=f"{prefix}/metadata.json",
                Body=json.dumps(metadata, indent=2).encode("utf-8"),
                ContentType="application/json",
            )
            callback(
                {"status": "complete", "sampleCount": len(records), "generatedAt": generated_at}
            )
            return {"ok": True, "sampleCount": len(records)}
    except Exception as exc:
        try:
            callback({"status": "error", "error": str(exc)[-4000:]})
        except Exception:
            pass
        raise


@app.function(image=image, secrets=[piro_secrets])
@modal.fastapi_endpoint(method="POST")
def source(body: dict) -> dict:
    """Queue execution of a source-generation request."""
    import os

    from fastapi import HTTPException

    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if expected and body.get("secret") != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")
    for field in ("runId", "callbackUrl", "r2Prefix", "source"):
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"{field} required")

    generate_source.spawn(body)
    return {"ok": True, "runId": body["runId"]}
