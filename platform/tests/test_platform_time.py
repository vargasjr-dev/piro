import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "modal"))
from platform_time import as_utc


def test_as_utc_attaches_utc_to_database_naive_timestamp():
    value = datetime(2026, 8, 23, 10, 0, 0)

    result = as_utc(value)

    assert result == value.replace(tzinfo=UTC)


def test_as_utc_converts_aware_timestamp_to_utc():
    value = datetime(2026, 8, 23, 6, 0, 0, tzinfo=timezone(timedelta(hours=-4)))

    result = as_utc(value)

    assert result.tzinfo is UTC
    assert result.hour == 10
