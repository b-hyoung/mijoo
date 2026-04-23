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

    # Group rows by ticker. Evaluate EVERY prediction in the 28-day window.
    # Three-tier status:
    #   miss    — direction wrong
    #   hit     — direction right, magnitude within predicted range
    #   exceed  — direction right AND |actual %| > |predicted week1 %|
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

        # week1 price target for magnitude threshold (fallback to 0 → any correct
        # direction becomes 'exceed' since there's no expected-move reference)
        w1 = (data.get("prediction") or {}).get("week1") or {}
        predicted_target = w1.get("price_target")

        by_ticker.setdefault(row["ticker"], []).append({
            "predicted_at": row["predicted_at"],
            "predicted_direction": predicted,
            "price_at_prediction": float(price_at),
            "predicted_target": float(predicted_target) if predicted_target is not None else None,
        })

    overall_total = 0
    overall_hit = 0     # hit or exceed
    overall_exceed = 0  # exceed only (strong win)
    tickers_out: list[dict] = []

    for ticker, preds in sorted(by_ticker.items()):
        cur = _latest_close(ticker)
        n_hit = 0
        n_exceed = 0
        recent_entries: list[dict] = []

        for p in preds:
            if cur is None:
                continue
            price_at = p["price_at_prediction"]
            actual_pct = (cur - price_at) / price_at
            actual_dir = "UP" if cur > price_at else "DOWN"
            predicted_dir = p["predicted_direction"]
            direction_correct = (actual_dir == predicted_dir)

            # Expected move % from week1 target (can be None)
            tgt = p["predicted_target"]
            expected_pct = ((tgt - price_at) / price_at) if tgt is not None else None

            if not direction_correct:
                status = "miss"
            elif expected_pct is not None and abs(actual_pct) > abs(expected_pct):
                status = "exceed"
                n_exceed += 1
                n_hit += 1
            else:
                status = "hit"
                n_hit += 1

            recent_entries.append({
                "date": p["predicted_at"][:10],
                "predicted_direction": predicted_dir,
                "actual_direction": actual_dir,
                "price_at_prediction": price_at,
                "current_price": cur,
                "actual_pct": round(actual_pct * 100, 2),
                "expected_pct": round(expected_pct * 100, 2) if expected_pct is not None else None,
                "status": status,  # "miss" | "hit" | "exceed"
                "correct": direction_correct,  # back-compat
            })

        total = len(recent_entries)
        overall_total += total
        overall_hit += n_hit
        overall_exceed += n_exceed

        tickers_out.append({
            "ticker": ticker,
            "total": total,
            "correct": n_hit,   # back-compat name (direction matches)
            "exceed": n_exceed,
            "hit_rate": (n_hit / total) if total else 0.0,
            "current_price": cur,
            "recent": recent_entries[:5],
        })

    return {
        "window_days": 28,
        "overall": {
            "total": overall_total,
            "correct": overall_hit,
            "exceed": overall_exceed,
            "hit_rate": (overall_hit / overall_total) if overall_total else 0.0,
        },
        "tickers": tickers_out,
    }
