import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from platform_training_state import (
    HEARTBEAT_DIAGNOSTICS_SQL,
    HEARTBEAT_SQL,
    WORKER_EVENT_SELECT_SQL,
    WORKER_EVENT_UPDATE_SQL,
    persist_worker_event,
    send_heartbeat,
)


class FakeCursor:
    def __init__(self, rowcount: int, row=None):
        self.rowcount = rowcount
        self.row = row
        self.executed = []
        self.closed = False

    def execute(self, query, params):
        self.executed.append((query, params))

    def fetchone(self):
        return self.row

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, rowcount: int, row=None):
        self.cursor_instance = FakeCursor(rowcount, row=row)
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def test_send_heartbeat_commits_when_run_is_still_running():
    connection = FakeConnection(rowcount=1)

    result = send_heartbeat(lambda _: connection, "database-url", "run-id")

    assert result is True
    assert connection.commits == 1
    assert connection.rollbacks == 0
    assert connection.cursor_instance.executed == [(HEARTBEAT_SQL, ("run-id",))]
    assert connection.closed is True
    assert connection.cursor_instance.closed is True


def test_send_heartbeat_reports_lost_lease_without_committing():
    connection = FakeConnection(rowcount=0)

    result = send_heartbeat(lambda _: connection, "database-url", "run-id")

    assert result is False
    assert connection.commits == 0
    assert connection.rollbacks == 1
    assert connection.closed is True
    assert connection.cursor_instance.closed is True


def test_send_heartbeat_persists_worker_diagnostics():
    connection = FakeConnection(rowcount=1)
    diagnostics = '{"phase":"training","step":38}'

    result = send_heartbeat(
        lambda _: connection,
        "database-url",
        "run-id",
        diagnostics_json=diagnostics,
    )

    assert result is True
    assert connection.cursor_instance.executed == [
        (HEARTBEAT_DIAGNOSTICS_SQL, (diagnostics, "run-id")),
    ]
    assert connection.commits == 1


def test_persist_worker_event_appends_and_bounds_history():
    connection = FakeConnection(1, row=('[{"event":"old"}]',))

    result = persist_worker_event(
        lambda _: connection,
        "database-url",
        "run-id",
        {"event": "new"},
        diagnostics_json='{"phase":"starting"}',
        max_events=2,
    )

    assert result is True
    assert connection.commits == 1
    assert connection.cursor_instance.executed[0] == (
        WORKER_EVENT_SELECT_SQL,
        ("run-id",),
    )
    update_query, update_params = connection.cursor_instance.executed[1]
    assert update_query == WORKER_EVENT_UPDATE_SQL
    assert update_params[0] == '[{"event":"old"},{"event":"new"}]'
    assert update_params[1] == '{"phase":"starting"}'


def test_persist_worker_event_recovers_from_malformed_history():
    connection = FakeConnection(1, row=("not-json",))

    assert persist_worker_event(
        lambda _: connection,
        "database-url",
        "run-id",
        {"event": "recovered"},
    ) is True
    assert connection.cursor_instance.executed[1][1][0] == '[{"event":"recovered"}]'


def test_persist_worker_event_reports_missing_run_without_commit():
    connection = FakeConnection(1, row=None)

    assert persist_worker_event(
        lambda _: connection,
        "database-url",
        "run-id",
        {"event": "missing"},
    ) is False
    assert connection.commits == 0
    assert connection.rollbacks == 1
