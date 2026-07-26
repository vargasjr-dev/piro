"""Best-effort live progress updates for long-running training workers."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

PROGRESS_SQL = "UPDATE training_run SET \"progressJson\" = %s WHERE id = %s AND status = 'running'"


def update_progress(
    connect: Callable[[str], Any],
    database_url: str,
    run_id: str,
    progress: dict[str, Any],
) -> bool:
    """Persist one live progress snapshot while the run is still owned."""
    payload = dict(progress)
    payload.setdefault("updatedAt", datetime.now(UTC).isoformat())
    encoded = json.dumps(payload, separators=(",", ":"))
    connection = connect(database_url)
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(PROGRESS_SQL, (encoded, run_id))
            if cursor.rowcount != 1:
                connection.rollback()
                return False
            connection.commit()
            return True
        finally:
            cursor.close()
    finally:
        connection.close()
