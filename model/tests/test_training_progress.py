from model.training_progress import PROGRESS_SQL, update_progress


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


def test_update_progress_commits_a_live_snapshot_for_running_run():
    connection = FakeConnection(rowcount=1)

    result = update_progress(
        lambda _: connection,
        "database-url",
        "run-id",
        {"phase": "train", "completed": 4, "total": 250},
    )

    assert result is True
    assert connection.commits == 1
    assert connection.rollbacks == 0
    query, params = connection.cursor_instance.executed
    assert query == PROGRESS_SQL
    assert '"phase":"train"' in params[0]
    assert params[0].startswith("{")
    assert params[1] == "run-id"
    assert connection.closed is True
    assert connection.cursor_instance.closed is True


def test_update_progress_reports_lost_run_without_committing():
    connection = FakeConnection(rowcount=0)

    result = update_progress(
        lambda _: connection,
        "database-url",
        "run-id",
        {"phase": "train", "completed": 4, "total": 250},
    )

    assert result is False
    assert connection.commits == 0
    assert connection.rollbacks == 1
    assert connection.closed is True
    assert connection.cursor_instance.closed is True
