"""Static macro-event calendar for forward-looking prediction context.

Hardcoded FOMC meeting dates, CPI release dates, and NFP release dates for 2026.
Each year requires a small manual update (end-of-year maintenance task).

Sources verified against:
- FOMC:  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- CPI:   https://www.bls.gov/schedule/news_release/cpi.htm
- NFP:   https://www.bls.gov/schedule/news_release/empsit.htm

Engineer: verify these dates against the official sources before merging;
placeholder dates are reasonable approximations but may shift by 1-2 days.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, TypedDict


class EventEntry(TypedDict):
    type: Literal["FOMC", "CPI", "NFP"]
    date: str
    days_until: int


# FOMC 정례회의 2026 (2-day meetings; use day-2 for "meeting date")
_FOMC_DATES: list[str] = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-10",
    "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
]

# CPI 발표일 (매월 둘째 주 수요일경)
_CPI_DATES: list[str] = [
    "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-15",
    "2026-05-13", "2026-06-10", "2026-07-15", "2026-08-12",
    "2026-09-09", "2026-10-14", "2026-11-12", "2026-12-10",
]

# NFP (Non-Farm Payrolls, 매월 첫 금요일)
_NFP_DATES: list[str] = [
    "2026-01-02", "2026-02-06", "2026-03-06", "2026-04-03",
    "2026-05-01", "2026-06-05", "2026-07-02", "2026-08-07",
    "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
]


def _now() -> datetime:
    """Indirection for testability — patch this in tests."""
    return datetime.now(timezone.utc)


def _to_utc_midnight(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def upcoming_events(days_ahead: int = 14) -> list[EventEntry]:
    """Return macro events occurring within `days_ahead` days from now, sorted by proximity.

    Days_until is calculated in whole days (UTC midnight boundaries).
    """
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)

    out: list[EventEntry] = []
    for kind, dates in (("FOMC", _FOMC_DATES), ("CPI", _CPI_DATES), ("NFP", _NFP_DATES)):
        for d in dates:
            evt_date = _to_utc_midnight(d)
            delta = (evt_date - today).days
            if 0 <= delta <= days_ahead:
                out.append({"type": kind, "date": d, "days_until": delta})

    out.sort(key=lambda e: e["days_until"])
    return out
