from fastapi import APIRouter
from app.database import get_db
from app.config import settings as cfg

router = APIRouter()

@router.get("/list")
def list_stocks():
    conn = get_db()
    custom = [row["ticker"] for row in conn.execute("SELECT ticker FROM custom_tickers").fetchall()]
    conn.close()
    return {"tickers": list(set(cfg.nasdaq100_tickers + custom))}

@router.post("/custom/{ticker}")
def add_custom(ticker: str):
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO custom_tickers (ticker) VALUES (?)", (ticker.upper(),))
    conn.commit()
    conn.close()
    return {"added": ticker.upper()}

@router.delete("/custom/{ticker}")
def remove_custom(ticker: str):
    conn = get_db()
    conn.execute("DELETE FROM custom_tickers WHERE ticker = ?", (ticker.upper(),))
    conn.commit()
    conn.close()
    return {"removed": ticker.upper()}
