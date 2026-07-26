"""Periodic database heartbeats for long-running training workers."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

HEARTBEAT_SQL = (
    "UPDATE training_run SET \"heartbeatAt\" = NOW() WHERE id = %s AND status = 'running'"
)


def send_heartbeat(
    connect: Callable[[str], Any],
    database_url: str,
    run_id: str,
) -> bool:
    """Refresh a running worker lease and report whether it is still owned."""
    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(HEARTBEAT_SQL, (run_id,))
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
) -> None:
    """Refresh a worker lease until asked to stop.

    Each pulse opens a short-lived database connection so a long training
    operation cannot block or invalidate the worker's main transaction.
    Transient database errors are logged and retried on the next interval.
    """
    while not stop_event.wait(interval_seconds):
        try:
            if not send_heartbeat(connect, database_url, run_id):
                lease_lost_event.set()
                log(f"[piro] run {run_id} lost its database lease")
                return
        except Exception as exc:  # noqa: BLE001 - keep training alive across transient DB errors
            log(f"[piro] run {run_id} heartbeat failed: {exc}")
