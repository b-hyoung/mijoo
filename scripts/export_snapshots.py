#!/usr/bin/env python3
"""Export backend API responses to static JSON snapshots.

Usage:
    # make sure backend is running on localhost:8000 first
    python scripts/export_snapshots.py

Writes into frontend/public/data/. These files become the deployed
site's read-only data source (no live backend at runtime).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

API_BASE = "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "data"


def _get(path: str) -> dict | list | None:
    url = f"{API_BASE}{path}"
    try:
        with urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as e:
        print(f"  - {path} failed: {e}")
        return None


def _write(rel: str, data) -> None:
    dst = OUT / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    size_kb = dst.stat().st_size / 1024
    print(f"  OK {rel}  ({size_kb:.1f} KB)")


def main() -> int:
    print(f"Exporting from {API_BASE} -> {OUT}")
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. Stocks list (drives which tickers to export)
    print("\n[1/5] stocks/list")
    stocks = _get("/stocks/list")
    if not stocks:
        print("stocks list fetch failed — backend running?")
        return 1
    tickers: list[str] = stocks.get("tickers", [])
    _write("stocks.json", stocks)

    # 2. Overall accuracy
    print("\n[2/5] stats/accuracy")
    acc = _get("/stats/accuracy") or {}
    _write("accuracy.json", acc)

    # 3. Per-ticker predictions + history + price history
    print(f"\n[3/5] predictions/history for {len(tickers)} tickers")
    for t in tickers:
        pred = _get(f"/predict/{t}")
        if pred:
            _write(f"predict/{t}.json", pred)

        ph = _get(f"/prediction-history/{t}?limit=30")
        if ph:
            _write(f"prediction-history/{t}.json", ph)

        hist = _get(f"/history/{t}?days=30")
        if hist:
            _write(f"history/{t}.json", hist)

    # 4. Miss-analysis for tickers that have it
    print("\n[4/5] miss-analysis (miss tickers only)")
    tickers_with_miss = [t for t in acc.get("tickers", [])
                        if (t.get("total", 0) - t.get("correct", 0)) > 0]
    for t_info in tickers_with_miss:
        t = t_info["ticker"]
        ma = _get(f"/stats/miss-analysis/{t}")
        if ma:
            _write(f"miss-analysis/{t}.json", ma)

    # 5. Manifest (timestamp + snapshot summary for UI to display)
    print("\n[5/5] manifest")
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ticker_count": len(tickers),
        "miss_ticker_count": len(tickers_with_miss),
        "tickers": tickers,
    }
    _write("manifest.json", manifest)

    print(f"\nDone. Wrote to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
