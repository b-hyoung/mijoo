import os
import time
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path

FEATURE_COLS = [
    "ma5", "ma20", "ma60", "rsi", "macd", "macd_signal",
    "bb_upper", "bb_lower", "volume_ratio", "obv", "sentiment",
    "vix", "vix_20d_change",
    "treasury_10y", "treasury_10y_20d_change",
    "dxy", "dxy_20d_change",
]
MODEL_DIR = Path("/app/data/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

WEEKS = [1, 2]  # 7, 14일 (week3/4는 구조 시그널로 대체)


def build_dataset(df: pd.DataFrame, days: int):
    df = df.dropna(subset=FEATURE_COLS + ["close"])
    X = df[FEATURE_COLS].values
    y = df["close"].shift(-days).values
    mask = ~np.isnan(y)
    return X[mask], y[mask], df.index[mask]


def _compute_sample_weights(dates: pd.DatetimeIndex) -> np.ndarray:
    """Recent 1 year gets 2x weight, older data gets 1x.
    Smooth transition over 3 months to avoid hard cutoff."""
    if len(dates) == 0:
        return np.array([])
    latest = dates.max()
    days_ago = (latest - dates).days
    weights = np.where(
        days_ago <= 365, 2.0,                          # last 1 year: 2x
        np.where(days_ago <= 455, 2.0 - (days_ago - 365) / 90,  # 3-month fade
                 1.0)                                   # older: 1x
    )
    return weights.astype(float)


def train_models(df: pd.DataFrame) -> dict:
    models = {}
    for w in WEEKS:
        X, y, dates = build_dataset(df, w * 7)
        sample_weights = _compute_sample_weights(dates)
        m = xgb.XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42)
        m.fit(X, y, sample_weight=sample_weights)
        models[w] = m
    return models


def save_models(ticker: str, models: dict):
    for w, m in models.items():
        m.save_model(str(MODEL_DIR / f"{ticker}_week{w}.json"))


def load_models(ticker: str) -> dict:
    models = {}
    for w in WEEKS:
        m = xgb.XGBRegressor()
        m.load_model(str(MODEL_DIR / f"{ticker}_week{w}.json"))
        models[w] = m
    return models


def get_or_train_model(ticker: str, df: pd.DataFrame) -> dict:
    paths = [MODEL_DIR / f"{ticker}_week{w}.json" for w in WEEKS]
    seven_days = 7 * 24 * 3600
    now = time.time()

    if all(p.exists() for p in paths) and (now - paths[0].stat().st_mtime) < seven_days:
        return load_models(ticker)

    models = train_models(df)
    save_models(ticker, models)
    return models
