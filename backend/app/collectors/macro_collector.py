import yfinance as yf
import pandas as pd

MACRO_TICKERS = {
    "vix": "^VIX",
    "treasury_10y": "^TNX",
    "dxy": "DX-Y.NYB",
}


def fetch_macro_history(period: str = "5y") -> pd.DataFrame:
    """Fetch VIX, 10Y Treasury, DXY as daily DataFrame.
    Missing days (weekends/holidays) filled with previous value."""
    frames = {}
    for col, symbol in MACRO_TICKERS.items():
        try:
            df = yf.download(symbol, period=period, progress=False)
            if df is not None and not df.empty:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                close = df["Close"]
                # Ensure 1-dimensional
                if hasattr(close, "ndim") and close.ndim > 1:
                    close = close.iloc[:, 0]
                frames[col] = close
        except Exception:
            pass

    if not frames:
        return pd.DataFrame()

    result = pd.DataFrame(frames)
    result = result.ffill()
    result.index = pd.to_datetime(result.index).tz_localize(None)
    return result


def fetch_macro_latest() -> dict:
    """Return latest macro values + 20-day percentage change."""
    df = fetch_macro_history(period="2mo")
    if df.empty or len(df) < 21:
        return {
            "vix": None, "vix_20d_change": None,
            "treasury_10y": None, "treasury_10y_20d_change": None,
            "dxy": None, "dxy_20d_change": None,
        }

    latest = df.iloc[-1]
    prev_20d = df.iloc[-21]

    result = {}
    for col in MACRO_TICKERS:
        val = float(latest[col]) if pd.notna(latest[col]) else None
        prev = float(prev_20d[col]) if pd.notna(prev_20d[col]) else None
        change = round((val - prev) / prev * 100, 1) if val and prev and prev != 0 else None
        result[col] = round(val, 2) if val else None
        result[f"{col}_20d_change"] = change

    return result
