import copy
import pandas as pd
from app.ml.trainer import FEATURE_COLS


def predict(models: dict, latest_row: pd.DataFrame) -> dict:
    X = latest_row[FEATURE_COLS].fillna(0).values
    current_price = float(latest_row["close"].iloc[0])

    std_by_week = {1: 0.02, 2: 0.03}

    result = {}
    for w, model in models.items():
        pred = float(model.predict(X)[0])
        std = current_price * std_by_week[w]
        direction = "UP" if pred > current_price else "DOWN"
        change_pct = abs((pred - current_price) / current_price * 100)
        confidence = round(min(95, 50 + change_pct * 3), 1)
        result[f"week{w}"] = {
            "direction": direction,
            "confidence": confidence,
            "price_low": round(pred - std, 2),
            "price_high": round(pred + std, 2),
            "price_target": round(pred, 2),
        }
    return result


def apply_fundamental_adjustment(
    ml_result: dict,
    current_price: float,
    analyst_data: dict | None,
    insider_data: dict | None,
    institutional_data: dict | None,
) -> dict:
    signal = 0.0
    total_weight = 0.0

    if analyst_data and analyst_data.get("upside_pct") is not None:
        upside = max(-0.5, min(0.5, analyst_data["upside_pct"] / 100))
        signal += upside * 0.5
        total_weight += 0.5

    if insider_data and insider_data.get("net_shares_90d") is not None:
        net = insider_data["net_shares_90d"]
        signal += max(-1.0, min(1.0, net / 500_000)) * 0.3
        total_weight += 0.3

    if institutional_data and institutional_data.get("total_pct") is not None:
        pct = institutional_data["total_pct"]
        signal += max(-1.0, min(1.0, (pct - 45) / 55)) * 0.2
        total_weight += 0.2

    if total_weight == 0:
        return ml_result

    fundamental_change = (signal / total_weight) * 0.15
    ALPHA = 0.20

    result = copy.deepcopy(ml_result)
    for key in result:
        p = result[key]
        ml_change = (p["price_target"] - current_price) / current_price
        blended = ml_change * (1 - ALPHA) + fundamental_change * ALPHA
        new_target = current_price * (1 + blended)
        spread = (p["price_high"] - p["price_low"]) / 2
        p["price_target"] = round(new_target, 2)
        p["price_low"] = round(new_target - spread, 2)
        p["price_high"] = round(new_target + spread, 2)
        p["direction"] = "UP" if new_target > current_price else "DOWN"
        p["confidence"] = round(min(95, 50 + abs(blended * 100) * 3), 1)

    return result
