import yfinance as yf
import pandas as pd
from app.database import get_db

def fetch_price_history(ticker: str, period: str = "5y") -> pd.DataFrame:
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period=period)
        if df.empty:
            return pd.DataFrame()
        df = df.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume"
        })[["open", "high", "low", "close", "volume"]]
        df.index = df.index.strftime("%Y-%m-%d")
        return df
    except Exception:
        return pd.DataFrame()

def save_prices(ticker: str, df: pd.DataFrame, db_path=None):
    if df.empty:
        return
    conn = get_db(db_path)
    for date, row in df.iterrows():
        conn.execute("""
            INSERT OR IGNORE INTO prices (ticker, date, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (ticker, date, row.open, row.high, row.low, row.close, int(row.volume)))
    conn.commit()
    conn.close()

def collect_all(tickers: list[str], db_path=None):
    for ticker in tickers:
        df = fetch_price_history(ticker)
        save_prices(ticker, df, db_path)
