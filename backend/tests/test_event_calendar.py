from datetime import datetime, timezone
from unittest.mock import patch

from app.collectors.event_calendar import upcoming_events


def _fixed_now():
    return datetime(2026, 4, 23, tzinfo=timezone.utc)


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_within_window(_):
    events = upcoming_events(days_ahead=14)
    # FOMC 2026-04-29 is 6 days away → included
    types = {e["type"] for e in events}
    assert "FOMC" in types
    for e in events:
        assert 0 <= e["days_until"] <= 14
        assert e["type"] in {"FOMC", "CPI", "NFP"}
        assert "date" in e


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_excludes_outside_window(_):
    events = upcoming_events(days_ahead=3)
    # FOMC is 6 days away → must NOT appear when window is 3
    types = {e["type"] for e in events}
    assert "FOMC" not in types


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_sorted_by_days_until(_):
    events = upcoming_events(days_ahead=30)
    days_seq = [e["days_until"] for e in events]
    assert days_seq == sorted(days_seq)


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_zero_ahead(_):
    events = upcoming_events(days_ahead=0)
    # No events are exactly today in fixture → empty list
    assert events == []
