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
