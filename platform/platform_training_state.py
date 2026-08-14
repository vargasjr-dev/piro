"""Periodic database heartbeats and durable worker lifecycle events."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

HEARTBEAT_SQL = (
    'UPDATE training_run SET "heartbeatAt" = NOW() '
    "WHERE id = %s AND status = 'running'"
)
HEARTBEAT_DIAGNOSTICS_SQL = (
    'UPDATE training_run SET "heartbeatAt" = NOW(), "workerDiagnosticsJson" = %s '
    "WHERE id = %s AND status = 'running'"
)
WORKER_EVENT_MAX_COUNT = 64
WORKER_EVENT_SELECT_SQL = """
    SELECT "workerEventLogJson"
    FROM training_run
    WHERE id = %s AND status IN ('queued', 'running')
    FOR UPDATE
"""
WORKER_EVENT_UPDATE_SQL = (
    'UPDATE training_run SET "workerEventLogJson" = %s, '
    '"workerDiagnosticsJson" = COALESCE(%s, "workerDiagnosticsJson") '
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
    max_events: int = WORKER_EVENT_MAX_COUNT,
) -> bool:
    """Append a bounded worker event without sharing the training transaction."""
    if max_events < 1:
        raise ValueError("max_events must be positive")

    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(WORKER_EVENT_SELECT_SQL, (run_id,))
            row = cursor.fetchone()
            if row is None:
                connection.rollback()
                return False

            try:
                events = json.loads(row[0]) if row[0] else []
            except (TypeError, json.JSONDecodeError):
                events = []
            if not isinstance(events, list):
                events = []
            events.append(event)

            cursor.execute(
                WORKER_EVENT_UPDATE_SQL,
                (
                    json.dumps(events[-max_events:], separators=(",", ":")),
                    diagnostics_json,
                    run_id,
                ),
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
            log(f"[piro] run {run_id} heartbeat failed: {exc}")
