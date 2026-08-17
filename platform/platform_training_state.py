"""Periodic database heartbeats and durable worker lifecycle events."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

HEARTBEAT_SQL = (
    'UPDATE training_run SET "heartbeatAt" = NOW() '
    "WHERE id = %s AND status = 'running'"
)
HEARTBEAT_DIAGNOSTICS_SQL = (
    'UPDATE training_run SET "heartbeatAt" = NOW(), "workerDiagnosticsJson" = %s '
    "WHERE id = %s AND status = 'running'"
)
WORKER_EVENT_INSERT_SQL = """
    INSERT INTO training_run_event
        (id, "trainingRunId", event, "observedAt", step, "detailsJson")
    SELECT %s, id, %s, %s, %s, %s
    FROM training_run
    WHERE id = %s AND status IN ('queued', 'running')
    RETURNING id
"""
WORKER_EVENT_DIAGNOSTICS_SQL = (
    'UPDATE training_run SET "workerDiagnosticsJson" = '
    'COALESCE(%s, "workerDiagnosticsJson") '
    "WHERE id = %s AND status IN ('queued', 'running')"
)


def send_heartbeat(
    connect: Callable[[str], Any],
    database_url: str,
    run_id: str,
    diagnostics_json: str | None = None,
) -> bool:
    """Refresh a running worker lease and report whether it is still owned."""
    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            if diagnostics_json is None:
                cursor.execute(HEARTBEAT_SQL, (run_id,))
            else:
                cursor.execute(HEARTBEAT_DIAGNOSTICS_SQL, (diagnostics_json, run_id))
            if cursor.rowcount != 1:
                connection.rollback()
                return False
            connection.commit()
            return True
        finally:
            cursor.close()
    finally:
        connection.close()


def persist_worker_event(
    connect: Callable[[str], Any],
    database_url: str,
    run_id: str,
    event: dict[str, Any],
    diagnostics_json: str | None = None,
) -> bool:
    """Insert one durable event row without sharing the training transaction."""
    event_name = str(event.get("event") or "unknown")
    observed_at = event.get("observedAt")
    if not isinstance(observed_at, str):
        observed_at = datetime.now(UTC).isoformat()
    step = event.get("step")
    if not isinstance(step, int) or isinstance(step, bool):
        step = None

    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(
                WORKER_EVENT_INSERT_SQL,
                (
                    str(uuid4()),
                    event_name,
                    observed_at,
                    step,
                    json.dumps(event, separators=(",", ":")),
                    run_id,
                ),
            )
            if cursor.fetchone() is None:
                connection.rollback()
                return False

            cursor.execute(
                WORKER_EVENT_DIAGNOSTICS_SQL,
                (diagnostics_json, run_id),
            )
            if cursor.rowcount != 1:
                connection.rollback()
                return False
            connection.commit()
            return True
        finally:
            cursor.close()
    finally:
        connection.close()


def heartbeat_loop(
    stop_event: Any,
    lease_lost_event: Any,
    connect: Callable[[str], Any],
    database_url: str,
    run_id: str,
    interval_seconds: float,
    log: Callable[[str], None] = print,
    diagnostics: Callable[[], str] | None = None,
) -> None:
    """Refresh a worker lease until asked to stop."""
    while not stop_event.wait(interval_seconds):
        try:
            diagnostics_json = diagnostics() if diagnostics else None
            if not send_heartbeat(
                connect,
                database_url,
                run_id,
                diagnostics_json=diagnostics_json,
            ):
                lease_lost_event.set()
                log(f"[piro] run {run_id} lost its database lease")
                return
        except Exception as exc:  # noqa: BLE001 - keep training alive across transient DB errors
            log(f"[piro] heartbeat failed for {run_id}: {type(exc).__name__}: {exc}")
