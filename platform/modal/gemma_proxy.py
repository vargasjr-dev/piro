"""Supervise vLLM and retain redacted Gemma failure diagnostics."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import http.server
import json
import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from _common import R2_BUCKET, _r2_client

MAX_LOG_BYTES = 512 * 1024
MAX_RESPONSE_BYTES = 8 * 1024
DIAGNOSTICS_PREFIX = "diagnostics/gemma/"
CAPTURE_COOLDOWN_SECONDS = 5


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_tail(path: Path, limit: int = MAX_LOG_BYTES) -> str:
    try:
        with path.open("rb") as source:
            source.seek(0, os.SEEK_END)
            size = source.tell()
            source.seek(max(0, size - limit))
            return source.read(limit).decode("utf-8", errors="replace")
    except OSError as error:
        return f"Unable to read vLLM log: {error!r}"


def _gpu_metadata() -> dict[str, str]:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,compute_capability,driver_version,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return {
            "nvidiaSmiExitCode": str(result.returncode),
            "nvidiaSmi": result.stdout.strip() or result.stderr.strip(),
        }
    except Exception as error:
        return {"nvidiaSmiError": repr(error)}


def summarize_request(body: bytes) -> dict[str, object]:
    """Return request metadata without retaining prompt text."""
    summary: dict[str, object] = {
        "bodyBytes": len(body),
        "bodySha256": hashlib.sha256(body).hexdigest(),
    }
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return summary
    if not isinstance(payload, dict):
        return summary

    for field in ("model", "temperature", "top_p", "top_k", "max_tokens", "stream"):
        if field in payload and isinstance(payload[field], (str, int, float, bool)):
            summary[field] = payload[field]
    messages = payload.get("messages")
    if isinstance(messages, list):
        summary["messageCount"] = len(messages)
        summary["messageRoles"] = [
            message.get("role")
            for message in messages
            if isinstance(message, dict) and isinstance(message.get("role"), str)
        ]
        summary["messageContentBytes"] = sum(
            len(str(message.get("content", "")).encode("utf-8"))
            for message in messages
            if isinstance(message, dict)
        )
    return summary


class DiagnosticsStore:
    def __init__(
        self,
        log_path: Path,
        model: str,
        revision: str,
        process: subprocess.Popen[str],
        command: list[str],
        environment: dict[str, str],
    ):
        self.log_path = log_path
        self.model = model
        self.revision = revision
        self.process = process
        self.command = command
        self.environment = environment
        self._capture_lock = threading.Lock()
        self._last_capture_by_kind: dict[str, float] = {}

    def _upload(self, bundle: dict[str, object]) -> None:
        try:
            key = (
                f"{DIAGNOSTICS_PREFIX}{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')}"
                f"-{uuid.uuid4().hex}.json"
            )
            client = _r2_client(os)
            client.put_object(
                Bucket=R2_BUCKET,
                Key=key,
                Body=json.dumps(bundle, separators=(",", ":"), sort_keys=True).encode("utf-8"),
                ContentType="application/json",
            )
            print(f"[piro-gemma] uploaded diagnostics {R2_BUCKET}/{key}", flush=True)
        except Exception as error:
            print(f"[piro-gemma] diagnostics upload failed: {error!r}", flush=True)

    def capture(
        self,
        *,
        kind: str,
        request: dict[str, object] | None = None,
        response: bytes = b"",
        status: int | None = None,
        request_id: str | None = None,
        asynchronous: bool = True,
    ) -> None:
        with self._capture_lock:
            now = time.monotonic()
            last_capture_at = self._last_capture_by_kind.get(kind, 0.0)
            if now - last_capture_at < CAPTURE_COOLDOWN_SECONDS:
                return
            self._last_capture_by_kind[kind] = now

            bundle: dict[str, object] = {
                "schemaVersion": 1,
                "capturedAt": _utc_now(),
                "failureKind": kind,
                "model": self.model,
                "modelRevision": self.revision,
                "command": self.command,
                "proxyPid": os.getpid(),
                "vllmPid": self.process.pid,
                "vllmPoll": self.process.poll(),
                "cudaLaunchBlocking": self.environment.get("CUDA_LAUNCH_BLOCKING"),
                "torchShowCppStacktraces": self.environment.get("TORCH_SHOW_CPP_STACKTRACES"),
                "pythonFaulthandler": self.environment.get("PYTHONFAULTHANDLER"),
                "runtime": {
                    name: os.environ.get(name)
                    for name in (
                        "HOSTNAME",
                        "MODAL_TASK_ID",
                        "MODAL_FUNCTION_ID",
                        "MODAL_CONTAINER_ID",
                    )
                    if os.environ.get(name)
                },
                "gpu": _gpu_metadata(),
                "recentVllmLogs": _read_tail(self.log_path),
            }
            if request is not None:
                bundle["request"] = request
            if request_id:
                bundle["requestId"] = request_id
            if status is not None:
                bundle["upstreamStatus"] = status
            if response:
                bundle["response"] = {
                    "bytes": len(response),
                    "sha256": hashlib.sha256(response).hexdigest(),
                }
        if asynchronous:
            threading.Thread(target=self._upload, args=(bundle,), daemon=True).start()
        else:
            self._upload(bundle)


class VllmSupervisor:
    def __init__(self, command: list[str], log_path: Path, model: str, revision: str):
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        child_env = os.environ.copy()
        # These settings apply to the vLLM child only. They make future CUDA
        # failures identify the operation that launched the failing kernel.
        child_env.setdefault("CUDA_LAUNCH_BLOCKING", "1")
        child_env.setdefault("TORCH_SHOW_CPP_STACKTRACES", "1")
        child_env.setdefault("PYTHONFAULTHANDLER", "1")
        self.stopping = False
        self.process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=child_env,
        )
        self.diagnostics = DiagnosticsStore(
            self.log_path,
            model,
            revision,
            self.process,
            command,
            child_env,
        )
        self._log_thread = threading.Thread(target=self._read_logs, daemon=True)
        self._log_thread.start()
        self._watcher = threading.Thread(target=self._watch_process, daemon=True)
        self._watcher.start()

    def _append_log(self, line: str) -> None:
        with self.log_path.open("a", encoding="utf-8") as sink:
            sink.write(line)
            sink.flush()
        try:
            if self.log_path.stat().st_size > MAX_LOG_BYTES * 2:
                data = self.log_path.read_bytes()[-MAX_LOG_BYTES:]
                self.log_path.write_bytes(data)
        except OSError:
            pass

    def _read_logs(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            print(line.rstrip(), flush=True)
            self._append_log(line)

    def _watch_process(self) -> None:
        exit_code = self.process.wait()
        self._log_thread.join(timeout=2)
        print(f"[piro-gemma] vLLM exited with code {exit_code}", flush=True)
        if not self.stopping:
            self.diagnostics.capture(kind="vllm_process_exit", asynchronous=False)

    def stop(self) -> None:
        self.stopping = True
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()


def create_proxy_server(
    supervisor: VllmSupervisor,
    upstream_port: int,
    proxy_port: int,
) -> tuple[http.server.ThreadingHTTPServer, threading.Thread]:
    ProxyHandler.supervisor = supervisor
    ProxyHandler.upstream_port = upstream_port
    server = http.server.ThreadingHTTPServer(("0.0.0.0", proxy_port), ProxyHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    supervisor: VllmSupervisor
    upstream_port: int

    def log_message(self, format: str, *args: object) -> None:
        print(f"[piro-gemma-proxy] {self.address_string()} {format % args}", flush=True)

    def do_GET(self) -> None:
        self._forward()

    def do_POST(self) -> None:
        self._forward()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def _forward(self) -> None:
        request_body = b""
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > 0:
            request_body = self.rfile.read(content_length)
        target = f"http://127.0.0.1:{self.upstream_port}{self.path}"
        upstream_request = Request(target, data=request_body or None, method=self.command)
        for name, value in self.headers.items():
            if name.lower() not in {"host", "content-length", "connection"}:
                upstream_request.add_header(name, value)

        request_id = self.headers.get("X-Request-ID")
        status: int | None = None
        response_body = b""
        try:
            with urlopen(upstream_request, timeout=300) as upstream:
                status = upstream.status
                self.send_response(status)
                for name, value in upstream.headers.items():
                    if name.lower() not in {"connection", "transfer-encoding"}:
                        self.send_header(name, value)
                self.end_headers()
                while chunk := upstream.read(64 * 1024):
                    self.wfile.write(chunk)
                    if len(response_body) < MAX_RESPONSE_BYTES:
                        response_body += chunk[: MAX_RESPONSE_BYTES - len(response_body)]
        except HTTPError as error:
            status = error.code
            response_body = error.read(MAX_RESPONSE_BYTES)
            self.send_response(status)
            self.send_header("Content-Type", error.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
        except (URLError, TimeoutError, http.client.HTTPException, OSError) as error:
            status = 503
            response_body = json.dumps({"error": "Gemma upstream unavailable"}).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
            print(f"[piro-gemma-proxy] upstream failure: {error!r}", flush=True)

        if (
            self.command == "POST"
            and self.path.split("?", 1)[0] in {"/v1/chat/completions", "/v1/completions"}
            and status is not None
            and status >= 500
        ):
            self.supervisor.diagnostics.capture(
                kind="inference_http_error",
                request=summarize_request(request_body),
                response=response_body,
                status=status,
                request_id=request_id,
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--model-revision", required=True)
    parser.add_argument("--upstream-port", type=int, default=8001)
    parser.add_argument("--proxy-port", type=int, default=8000)
    parser.add_argument("--log-path", default="/tmp/piro-gemma/vllm.log")
    args = parser.parse_args()
    command = [
        "vllm",
        "serve",
        args.model_dir,
        "--served-model-name",
        args.model_name,
        "--host",
        "127.0.0.1",
        "--port",
        str(args.upstream_port),
        "--tensor-parallel-size",
        "1",
        "--max-model-len",
        "2048",
        "--chat-template",
        "/root/platform/modal/gemma-chat-template.jinja",
        "--enforce-eager",
        "--limit-mm-per-prompt",
        json.dumps({"image": 0, "video": 0, "audio": 0}),
    ]
    supervisor = VllmSupervisor(command, Path(args.log_path), args.model_name, args.model_revision)
    server, _ = create_proxy_server(supervisor, args.upstream_port, args.proxy_port)
    try:
        server.serve_forever()
    finally:
        server.shutdown()
        supervisor.stop()


if __name__ == "__main__":
    main()
