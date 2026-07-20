"""
piro/client.py — HTTP client for the Piro platform API.

Wraps all platform endpoints with a thin httpx-based client.
API key is read from PIRO_API_KEY env var or ~/.piro/config.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

DEFAULT_BASE_URL = "https://trainpiro.app"

CONFIG_PATH = Path.home() / ".piro" / "config.json"


class PiroAPIError(Exception):
    """Raised when the Piro platform API returns an error."""

    def __init__(self, status: int, message: str, path: str) -> None:
        self.status = status
        self.path = path
        super().__init__(f"[{status}] {message} ({path})")


def _load_api_key() -> str | None:
    """Resolve API key from env var or config file."""
    key = os.environ.get("PIRO_API_KEY")
    if key:
        return key
    if CONFIG_PATH.exists():
        config = json.loads(CONFIG_PATH.read_text())
        return config.get("api_key")
    return None


def _load_base_url() -> str:
    return os.environ.get("PIRO_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


class PiroClient:
    """Thin client for the Piro platform API."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self.api_key = api_key or _load_api_key()
        if not self.api_key:
            raise RuntimeError(
                "No API key found. Set PIRO_API_KEY env var or run 'piro login'."
            )
        self.base_url = (base_url or _load_base_url()).rstrip("/")
        self._client = httpx.Client(
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=60.0,
        )

    def _request(
        self, method: str, path: str, **kwargs: Any
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        resp = self._client.request(method, url, **kwargs)
        if resp.status_code >= 400:
            try:
                err = resp.json()
                msg = err.get("error", resp.text)
            except Exception:
                msg = resp.text
            raise PiroAPIError(resp.status_code, msg, path)
        return resp

    def _get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._request("GET", path, **kwargs)
        return resp.json()

    def _post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._request("POST", path, **kwargs)
        return resp.json()

    def _put(self, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._request("PUT", path, **kwargs)
        return resp.json()

    def _patch(self, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._request("PATCH", path, **kwargs)
        return resp.json()

    # ── Repos ──────────────────────────────────────────────────────────────

    def list_repos(self) -> list[dict[str, Any]]:
        data = self._get("/api/repos")
        return data.get("repos", [])

    def get_repo(self, repo_id: str) -> dict[str, Any]:
        return self._get(f"/api/repos/{repo_id}")

    def create_repo(
        self,
        id: str,
        name: str,
        github_repository: str,
        description: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": id,
            "name": name,
            "githubRepository": github_repository,
        }
        if description:
            payload["description"] = description
        return self._post("/api/repos", json=payload)

    def link_repo(self, id: str, github_repository: str) -> dict[str, Any]:
        return self._patch(
            f"/api/repos/{id}",
            json={"githubRepository": github_repository},
        )

    # ── Model Classes ──────────────────────────────────────────────────────

    def list_classes(self) -> list[dict[str, Any]]:
        data = self._get("/api/classes")
        return data.get("classes", [])

    def pull_class_file(self, class_id: str, path: str = "model.py") -> str:
        data = self._get(f"/api/classes/{class_id}/file", params={"path": path})
        return data.get("content", "")

    def push_class_file(self, class_id: str, content: str, path: str = "model.py") -> dict[str, Any]:
        return self._put(
            f"/api/classes/{class_id}/file",
            json={"path": path, "content": content},
        )

    def serialize_class(self, class_id: str, bust: bool = False) -> dict[str, Any]:
        params = {"bust": "true"} if bust else {}
        return self._get(f"/api/classes/{class_id}/serialize", params=params)

    # ── Benchmarks ─────────────────────────────────────────────────────────

    def list_benchmarks(self) -> list[dict[str, Any]]:
        data = self._get("/api/benchmarks")
        return data.get("benchmarks", [])

    def pull_benchmark_script(self, benchmark_id: str) -> str:
        data = self._get(f"/api/benchmarks/{benchmark_id}/file", params={"path": "script.py"})
        return data.get("content", "")

    def push_benchmark_script(self, benchmark_id: str, content: str) -> dict[str, Any]:
        return self._put(
            f"/api/benchmarks/{benchmark_id}/file",
            json={"path": "script.py", "content": content},
        )

    def run_benchmark(self, benchmark_id: str, model_id: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if model_id:
            payload["modelId"] = model_id
        return self._post(f"/api/benchmarks/{benchmark_id}/run", json=payload)

    # ── Training Runs ──────────────────────────────────────────────────────

    def list_training_runs(self) -> list[dict[str, Any]]:
        data = self._get("/api/training-runs")
        return data.get("runs", [])

    def get_training_run(self, run_id: str) -> dict[str, Any]:
        return self._get(f"/api/training-runs/{run_id}")

    def create_training_run(
        self,
        architecture_path: str,
        dataset_id: str,
        epochs: int = 10,
        model_name: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "architecturePath": architecture_path,
            "datasetId": dataset_id,
            "epochs": epochs,
        }
        if model_name:
            payload["modelName"] = model_name
        return self._post("/api/training-runs", json=payload)

    # ── Models ─────────────────────────────────────────────────────────────

    def list_models(self) -> list[dict[str, Any]]:
        data = self._get("/api/models")
        return data.get("models", [])

    def infer(self, model_id: str, prompt: str) -> dict[str, Any]:
        return self._post(f"/api/models/{model_id}/infer", json={"prompt": prompt})

    def close(self) -> None:
        self._client.close()
