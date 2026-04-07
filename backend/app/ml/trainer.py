import os
import time
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path

FEATURE_COLS = [
    "ma5", "ma20", "ma60", "rsi", "macd", "macd_signal",
    "bb_upper", "bb_lower", "volume_ratio", "obv", "sentiment"
]
MODEL_DIR = Path(__file__).parent / "saved"
MODEL_DIR.mkdir(exist_ok=True)

def build_dataset(df: pd.DataFrame):
    df = df.dropna(subset=FEATURE_COLS + ["close"])
    X = df[FEATURE_COLS].values
    y2 = df["close"].shift(-14).values
    y4 = df["close"].shift(-28).values
    mask2 = ~np.isnan(y2)
    mask4 = ~np.isnan(y4)
    return X[mask2], y2[mask2], X[mask4], y4[mask4]

def train_model(df: pd.DataFrame):
    X2, y2, X4, y4 = build_dataset(df)
    model2 = xgb.XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42)
    model4 = xgb.XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42)
    model2.fit(X2, y2)
    model4.fit(X4, y4)
    return model2, model4

def save_models(ticker: str, model2, model4):
    model2.save_model(str(MODEL_DIR / f"{ticker}_week2.json"))
    model4.save_model(str(MODEL_DIR / f"{ticker}_week4.json"))

def load_models(ticker: str):
    m2 = xgb.XGBRegressor()
    m4 = xgb.XGBRegressor()
    m2.load_model(str(MODEL_DIR / f"{ticker}_week2.json"))
    m4.load_model(str(MODEL_DIR / f"{ticker}_week4.json"))
    return m2, m4

def get_or_train_model(ticker: str, df):
    """Load cached model if fresh (< 7 days), otherwise train and save."""
    model2_path = MODEL_DIR / f"{ticker}_week2.json"
    model4_path = MODEL_DIR / f"{ticker}_week4.json"

    seven_days = 7 * 24 * 3600
    now = time.time()

    if (model2_path.exists() and model4_path.exists() and
            (now - model2_path.stat().st_mtime) < seven_days):
        model2, model4 = load_models(ticker)
        return model2, model4

    model2, model4 = train_model(df)
    save_models(ticker, model2, model4)
    return model2, model4
