from model.training_heartbeat import HEARTBEAT_SQL, send_heartbeat


class FakeCursor:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount
        self.executed = None
        self.closed = False

    def execute(self, query, params):
        self.executed = (query, params)

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, rowcount: int):
        self.cursor_instance = FakeCursor(rowcount)
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
    assert connection.cursor_instance.executed == (HEARTBEAT_SQL, ("run-id",))
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
