"""Count ticker mentions in r/wallstreetbets and r/stocks new posts.

Reddit's public JSON endpoint (`.json?limit=100`) requires no auth for
read-only access. We fetch once, count $TICKER and plain ticker mentions
across the returned posts, and surface a simple ratio.

Simplification vs production sentiment tools:
  - One-shot count (not a 24h rolling window with historical baseline)
  - Titles + selftext (comments skipped for speed / anti-bot)
  - Heuristic $TICKER or standalone uppercase word match (false-positive
    risk for short tickers like "T" or "A"; we rely on the project list
    being NASDAQ-100 large caps where $TICKER is the dominant pattern)

Usage: fetch_reddit_mentions(["AAPL","NVDA",...]) → dict per ticker.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

_SUBS = ["wallstreetbets", "stocks", "investing"]
_HEADERS = {
    "User-Agent": "mijoo-stock-tracker/0.1 (personal project; contact: youqlrqod@gmail.com)",
}


def _fetch_sub(sub: str, limit: int = 100) -> list[dict]:
    url = f"https://www.reddit.com/r/{sub}/new.json?limit={limit}"
    try:
        req = Request(url, headers=_HEADERS)
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return [p["data"] for p in data.get("data", {}).get("children", [])]
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return []


def _count_mentions(posts: list[dict], tickers: list[str]) -> dict[str, dict]:
    """Case-sensitive ticker match on original text to reduce false positives
    (e.g., "Cost" should NOT match COST). $TICKER and plain TICKER (all caps)
    are both counted."""
    counts: dict[str, dict] = {
        t: {"total": 0, "dollar": 0, "latest_title": None, "latest_created": None}
        for t in tickers
    }
    for p in posts:
        title = p.get("title", "")
        body = p.get("selftext", "") or ""
        created = p.get("created_utc", 0)
        hay = f"{title}\n{body}"
        for t in tickers:
            # $TICKER — case-insensitive is fine
            dollar_hits = len(re.findall(rf"\${t}\b", hay, flags=re.IGNORECASE))
            # Plain TICKER — ONLY if it appears in all-caps in the original text
            # (this filters "Cost" from matching "COST")
            caps_hits = len(re.findall(rf"\b{t}\b", hay))
            total = dollar_hits + caps_hits
            if total > 0:
                counts[t]["total"] += total
                counts[t]["dollar"] += dollar_hits
                if counts[t]["latest_created"] is None or created > counts[t]["latest_created"]:
                    counts[t]["latest_created"] = created
                    counts[t]["latest_title"] = title[:100]
    return counts


def fetch_reddit_mentions(tickers: list[str]) -> dict[str, dict]:
    """One scrape across 3 subreddits (up to ~300 recent posts) counted per ticker.

    Returns:
      {
        "AAPL": {
          "mentions": 12,
          "dollar_mentions": 8,
          "scanned_posts": 287,
          "latest_title": "$AAPL breakout alert ...",
          "latest_at": "2026-04-24T13:40:00Z"
        },
        ...
      }
    """
    all_posts: list[dict] = []
    for sub in _SUBS:
        all_posts.extend(_fetch_sub(sub))

    counts = _count_mentions(all_posts, [t.upper() for t in tickers])

    out: dict[str, dict] = {}
    for t, c in counts.items():
        out[t] = {
            "mentions": c["total"],
            "dollar_mentions": c["dollar"],
            "scanned_posts": len(all_posts),
            "latest_title": c["latest_title"],
            "latest_at": (
                datetime.fromtimestamp(c["latest_created"], tz=timezone.utc).isoformat()
                if c["latest_created"] else None
            ),
        }
    return out
