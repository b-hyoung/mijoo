import json
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter()


@router.get("/{ticker}")
def get_prediction_history(ticker: str, limit: int = 10):
    """Return past predictions for a ticker, newest first."""
    from app.database import get_db
    ticker = ticker.upper()
    conn = get_db()
    rows = conn.execute("""
        SELECT id, ticker, predicted_at, summary
        FROM predictions
        WHERE ticker = ?
        ORDER BY predicted_at DESC
        LIMIT ?
    """, (ticker, limit)).fetchall()
    conn.close()

    history = []
    for row in rows:
        try:
            data = json.loads(row["summary"]) if row["summary"] and row["summary"].startswith("{") else None
            if not data:
                continue

            predicted_at = row["predicted_at"]
            # Calculate age
            try:
                dt = datetime.fromisoformat(predicted_at)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
            except Exception:
                age_hours = 0

            debate = data.get("debate", {})
            prediction = data.get("prediction", {})

            entry = {
                "id": row["id"],
                "predicted_at": predicted_at,
                "age_hours": round(age_hours, 1),
                "current_price_at_prediction": data.get("current_price"),
                "verdict": debate.get("verdict"),
                "direction": debate.get("direction"),
                "confidence": debate.get("confidence"),
                "summary": debate.get("summary"),
                "week1": prediction.get("week1"),
                "week2": prediction.get("week2"),
                "week3": prediction.get("week3"),
                "week4": prediction.get("week4"),
                "weekly_outlook": debate.get("weekly_outlook"),
            }
            history.append(entry)
        except Exception:
            continue

    return {"ticker": ticker, "history": history}
