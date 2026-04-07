from fastapi import APIRouter, HTTPException
from app.collectors.price_collector import fetch_price_history
import ta
import pandas as pd

router = APIRouter()

@router.get("/{ticker}")
def get_history(ticker: str, days: int = 30):
    ticker = ticker.upper()
    df = fetch_price_history(ticker, period="3mo")
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    df = df.tail(days).copy()
    df["obv"] = ta.volume.OnBalanceVolumeIndicator(
        df["close"], df["volume"].astype(float)
    ).on_balance_volume()

    vol_mean = df["volume"].rolling(5, min_periods=1).mean()
    df["buy_volume"] = (df["volume"] * (df["close"] >= df["close"].shift(1).fillna(df["close"])).astype(float)).astype(int)
    df["sell_volume"] = (df["volume"] - df["buy_volume"]).astype(int)
    df["is_accumulation"] = (df["buy_volume"] > df["sell_volume"] * 1.4)

    result = []
    for date, row in df.iterrows():
        result.append({
            "date": date,
            "close": round(float(row["close"]), 2),
            "volume": int(row["volume"]),
            "buy_volume": int(row["buy_volume"]),
            "sell_volume": int(row["sell_volume"]),
            "obv": round(float(row["obv"]), 0),
            "is_accumulation": bool(row["is_accumulation"])
        })

    return {"ticker": ticker, "history": result}
