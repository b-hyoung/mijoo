"""Aggregate accuracy stats across all tickers.

Scope (per user decision):
- Match rule: direction match (predicted UP/DOWN vs sign(current_price - price_at_prediction))
- Window: last 28 days of predictions
- Benchmark: current price (simple — no maturity-date backtest)
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

router = APIRouter()


def _latest_close(ticker: str) -> float | None:
    try:
        from app.collectors.price_collector import fetch_price_history
        df = fetch_price_history(ticker, period="1mo")
        if df.empty:
            return None
        return float(df["close"].iloc[-1])
    except Exception:
        return None


@router.get("/accuracy")
def get_accuracy():
    """Per-ticker direction-match stats over the last 28 days.

    Response shape:
      {
        "window_days": 28,
        "overall": { "total": N, "correct": N, "hit_rate": 0.0-1.0 },
        "tickers": [
          {
            "ticker": "AAPL",
            "total": N, "correct": N, "hit_rate": 0.0-1.0,
            "current_price": float | null,
            "recent": [
              { "date": "YYYY-MM-DD", "predicted_direction": "UP"|"DOWN",
                "actual_direction": "UP"|"DOWN",
                "price_at_prediction": float, "current_price": float,
                "correct": bool }
            ]
          }
        ]
      }
    """
    from app.database import get_db

    cutoff = (datetime.now(timezone.utc) - timedelta(days=28)).isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT ticker, predicted_at, summary FROM predictions "
        "WHERE predicted_at >= ? ORDER BY ticker, predicted_at DESC",
        (cutoff,),
    ).fetchall()
    conn.close()

    # Group rows by ticker
    by_ticker: dict[str, list[dict]] = {}
    for row in rows:
        summary = row["summary"]
        if not summary or not summary.startswith("{"):
            continue
        try:
            data = json.loads(summary)
        except json.JSONDecodeError:
            continue

        price_at = data.get("current_price")
        debate = data.get("debate") or {}
        predicted = debate.get("direction")
        if predicted not in ("UP", "DOWN") or price_at is None:
            continue

        by_ticker.setdefault(row["ticker"], []).append({
            "predicted_at": row["predicted_at"],
            "predicted_direction": predicted,
            "price_at_prediction": float(price_at),
        })

    overall_total = 0
    overall_correct = 0
    tickers_out: list[dict] = []

    for ticker, preds in sorted(by_ticker.items()):
        cur = _latest_close(ticker)
        correct = 0
        recent_entries: list[dict] = []

        for p in preds:
            if cur is None:
                continue
            actual = "UP" if cur > p["price_at_prediction"] else "DOWN"
            is_correct = (actual == p["predicted_direction"])
            if is_correct:
                correct += 1
            recent_entries.append({
                "date": p["predicted_at"][:10],
                "predicted_direction": p["predicted_direction"],
                "actual_direction": actual,
                "price_at_prediction": p["price_at_prediction"],
                "current_price": cur,
                "correct": is_correct,
            })

        total = len(recent_entries)
        overall_total += total
        overall_correct += correct

        tickers_out.append({
            "ticker": ticker,
            "total": total,
            "correct": correct,
            "hit_rate": (correct / total) if total else 0.0,
            "current_price": cur,
            "recent": recent_entries[:5],  # most recent 5 for sparkline
        })

    return {
        "window_days": 28,
        "overall": {
            "total": overall_total,
            "correct": overall_correct,
            "hit_rate": (overall_correct / overall_total) if overall_total else 0.0,
        },
        "tickers": tickers_out,
    }
