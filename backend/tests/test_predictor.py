import numpy as np
import pandas as pd
from app.ml.trainer import build_dataset, train_model
from app.ml.predictor import predict

def make_df(n=300):
    dates = pd.date_range("2020-01-01", periods=n)
    return pd.DataFrame({
        "close": np.linspace(100, 200, n),
        "ma5": np.linspace(100, 200, n),
        "ma20": np.linspace(100, 200, n),
        "ma60": np.linspace(100, 200, n),
        "rsi": np.full(n, 50.0),
        "macd": np.zeros(n),
        "macd_signal": np.zeros(n),
        "bb_upper": np.full(n, 210.0),
        "bb_lower": np.full(n, 90.0),
        "volume_ratio": np.ones(n),
        "obv": np.linspace(0, 1e8, n),
        "sentiment": np.zeros(n),
    }, index=dates)

def test_build_dataset_has_targets():
    df = make_df(300)
    X2, y2, X4, y4 = build_dataset(df)
    assert len(X2) == len(y2)
    assert len(X4) == len(y4)
    assert len(X2) > 0

def test_train_and_predict():
    df = make_df(300)
    model2, model4 = train_model(df)
    result = predict(model2, model4, df.iloc[[-1]])
    assert "week2" in result
    assert "week4" in result
    assert "direction" in result["week2"]
    assert "price_low" in result["week2"]
    assert result["week2"]["direction"] in ["UP", "DOWN"]
    assert 0 <= result["week2"]["confidence"] <= 100
