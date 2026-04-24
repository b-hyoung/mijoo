"""Scrape openinsider.com for insider Form 4 purchases (last 30 days).

Detects "cluster buys" — 2+ distinct insiders buying within a 7-day window.
This is one of the strongest bullish insider signals (correlates with 3-6
month forward alpha in academic studies).

Usage: fetch_insider_cluster("AAPL") → dict with counts, total value, flag.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # graceful degrade


_BASE = "http://openinsider.com/screener"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
}


@dataclass
class InsiderTrade:
    filing_date: str
    trade_date: str
    insider: str
    title: str
    trade_type: str   # "P - Purchase" or "S - Sale"
    price: float
    qty: int
    value: float


def _fetch_html(ticker: str, days: int = 30) -> str | None:
    """Pull the openinsider screener HTML for a ticker's last N days of purchases."""
    params = {
        "s": ticker.upper(),
        "xp": "1",        # purchases only
        "fd": str(days),
        "sortcol": "0",   # by filing date desc
        "cnt": "50",
    }
    url = f"{_BASE}?{urlencode(params)}"
    try:
        req = Request(url, headers=_HEADERS)
        with urlopen(req, timeout=10) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (URLError, HTTPError, TimeoutError):
        return None


def _parse_trades(html: str) -> list[InsiderTrade]:
    if not BeautifulSoup:
        return []
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="tinytable")
    if not table:
        return []

    trades: list[InsiderTrade] = []
    rows = table.find("tbody").find_all("tr") if table.find("tbody") else []
    for tr in rows:
        cols = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cols) < 12:
            continue
        # openinsider columns (varies by screener): X, filing_date, trade_date, ticker,
        # insider_name, title, trade_type, price, qty, owned, delta_own, value
        try:
            price_raw = cols[7].replace("$", "").replace(",", "")
            qty_raw = cols[8].replace(",", "").replace("+", "")
            value_raw = cols[11].replace("$", "").replace(",", "").replace("+", "")
            trades.append(InsiderTrade(
                filing_date=cols[1][:10],
                trade_date=cols[2][:10],
                insider=cols[4],
                title=cols[5],
                trade_type=cols[6],
                price=float(price_raw) if price_raw else 0.0,
                qty=int(qty_raw) if qty_raw.lstrip("-").isdigit() else 0,
                value=float(value_raw) if value_raw else 0.0,
            ))
        except (ValueError, IndexError):
            continue
    return trades


def _detect_cluster(trades: list[InsiderTrade]) -> bool:
    """2+ distinct insiders buying within any 7-day window."""
    if len(trades) < 2:
        return False
    purchases = [t for t in trades if t.trade_type.startswith("P")]
    if len(purchases) < 2:
        return False
    # Group by trade_date, count distinct insiders in any 7-day sliding window
    by_date: dict[str, set[str]] = {}
    for t in purchases:
        by_date.setdefault(t.trade_date, set()).add(t.insider)

    dates = sorted(by_date.keys())
    for i, anchor in enumerate(dates):
        anchor_dt = datetime.fromisoformat(anchor)
        insiders: set[str] = set()
        for d in dates[i:]:
            d_dt = datetime.fromisoformat(d)
            if (d_dt - anchor_dt).days > 7:
                break
            insiders.update(by_date[d])
        if len(insiders) >= 2:
            return True
    return False


def fetch_insider_cluster(ticker: str) -> dict[str, Any]:
    """Return insider Form 4 cluster signal for a ticker.

    Shape:
      {
        "buyers_30d": int,              # distinct insiders who bought
        "trades_30d": int,              # total buy trades
        "total_value_30d": float,       # sum $
        "cluster_detected": bool,       # 2+ in 7-day window
        "c_level_buy": bool,            # CEO/CFO/President bought
        "last_buy_date": str | None,    # YYYY-MM-DD
        "recent": list[dict],           # last 5 trades for display
        "source": "openinsider",
      }
    """
    empty = {
        "buyers_30d": 0, "trades_30d": 0, "total_value_30d": 0.0,
        "cluster_detected": False, "c_level_buy": False,
        "last_buy_date": None, "recent": [], "source": "openinsider",
    }

    html = _fetch_html(ticker, days=30)
    if not html:
        return empty
    trades = _parse_trades(html)
    purchases = [t for t in trades if t.trade_type.startswith("P")]
    if not purchases:
        return empty

    buyers = {t.insider for t in purchases}
    total_value = sum(t.value for t in purchases)
    c_level = any(
        any(kw in t.title.upper() for kw in ["CEO", "CFO", "PRESIDENT", "CHAIRMAN", "COO"])
        for t in purchases
    )
    recent = [asdict(t) for t in sorted(purchases, key=lambda t: t.trade_date, reverse=True)[:5]]
    last_buy = recent[0]["trade_date"] if recent else None

    return {
        "buyers_30d": len(buyers),
        "trades_30d": len(purchases),
        "total_value_30d": round(total_value, 0),
        "cluster_detected": _detect_cluster(purchases),
        "c_level_buy": c_level,
        "last_buy_date": last_buy,
        "recent": recent,
        "source": "openinsider",
    }
