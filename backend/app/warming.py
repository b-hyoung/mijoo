# backend/app/warming.py
import threading
import logging
from datetime import datetime, timezone
from app.config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()

warming_status = {
    "warming": False,
    "cached_count": 0,
    "total": 0,
    "last_warmed_at": None
}

def _warm_ticker(ticker: str):
    """Compute and cache prediction for a single ticker.

    Step 1 — run miss-analysis first (no-op if no misses / cache fresh).
    Step 2 — fresh prediction. The build_debate_context call inside
             get_prediction auto-injects the miss analysis into every
             persona prompt, closing the weekly self-learning loop.
    """
    try:
        from app.stats_analysis import generate_miss_analysis
        try:
            generate_miss_analysis(ticker)  # cache-aware, safe to call every time
        except Exception as e:
            logger.warning(f"[warming] {ticker} miss-analysis skipped: {e}")

        from app.routers.predict import get_prediction
        get_prediction(ticker)
        with _lock:
            warming_status["cached_count"] += 1
        logger.info(f"[warming] {ticker} OK ({warming_status['cached_count']}/{warming_status['total']})")
    except Exception as e:
        logger.error(f"[warming] {ticker} FAILED: {e}", exc_info=True)

def warm_all_tickers():
    """Warm cache for all tickers. Runs in background thread."""
    tickers = settings.nasdaq100_tickers
    warming_status["warming"] = True
    warming_status["cached_count"] = 0
    warming_status["total"] = len(tickers)
    for ticker in tickers:
        _warm_ticker(ticker)
    warming_status["warming"] = False
    warming_status["last_warmed_at"] = datetime.now(timezone.utc).isoformat()

def start_warming_if_empty():
    """Start warming in background thread if no predictions this week."""
    from app.database import get_db
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    conn = get_db()
    recent = conn.execute(
        "SELECT COUNT(*) FROM predictions WHERE predicted_at > ?", (monday.isoformat(),)
    ).fetchone()[0]
    conn.close()
    if recent == 0:
        thread = threading.Thread(target=warm_all_tickers, daemon=True)
        thread.start()
