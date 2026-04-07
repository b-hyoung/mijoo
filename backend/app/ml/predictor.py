import numpy as np
import pandas as pd
from app.ml.trainer import FEATURE_COLS

def predict(model2, model4, latest_row: pd.DataFrame) -> dict:
    X = latest_row[FEATURE_COLS].fillna(0).values
    current_price = float(latest_row["close"].iloc[0])
    pred2 = float(model2.predict(X)[0])
    pred4 = float(model4.predict(X)[0])
    std2 = current_price * 0.03
    std4 = current_price * 0.05

    def make_result(pred, std, current):
        direction = "UP" if pred > current else "DOWN"
        change_pct = abs((pred - current) / current * 100)
        confidence = min(95, 50 + change_pct * 3)
        return {
            "direction": direction,
            "confidence": round(confidence, 1),
            "price_low": round(pred - std, 2),
            "price_high": round(pred + std, 2),
            "price_target": round(pred, 2)
        }

    return {
        "week2": make_result(pred2, std2, current_price),
        "week4": make_result(pred4, std4, current_price)
    }
