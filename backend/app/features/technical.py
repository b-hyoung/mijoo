import pandas as pd
import numpy as np
import ta

def build_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result["ma5"] = df["close"].rolling(5).mean()
    result["ma20"] = df["close"].rolling(20).mean()
    result["ma60"] = df["close"].rolling(60).mean()
    result["rsi"] = ta.momentum.RSIIndicator(df["close"], window=14).rsi()
    macd = ta.trend.MACD(df["close"])
    result["macd"] = macd.macd()
    result["macd_signal"] = macd.macd_signal()
    bb = ta.volatility.BollingerBands(df["close"])
    result["bb_upper"] = bb.bollinger_hband()
    result["bb_lower"] = bb.bollinger_lband()
    result["volume_ratio"] = df["volume"] / df["volume"].rolling(5).mean()
    result["obv"] = ta.volume.OnBalanceVolumeIndicator(
        df["close"], df["volume"]
    ).on_balance_volume()
    return result


def add_macro_features(price_df: pd.DataFrame, macro_df: pd.DataFrame) -> pd.DataFrame:
    """Join macro data to price DataFrame and compute 20-day change rates."""
    result = price_df.copy()

    if macro_df.empty:
        for col in ["vix", "treasury_10y", "dxy"]:
            result[col] = np.nan
            result[f"{col}_20d_change"] = np.nan
        return result

    macro_df.index = pd.to_datetime(macro_df.index).tz_localize(None)
    result.index = pd.to_datetime(result.index).tz_localize(None)

    for col in ["vix", "treasury_10y", "dxy"]:
        if col in macro_df.columns:
            result[col] = macro_df[col].reindex(result.index).ffill()
            result[f"{col}_20d_change"] = result[col].pct_change(20) * 100
        else:
            result[col] = np.nan
            result[f"{col}_20d_change"] = np.nan

    return result
