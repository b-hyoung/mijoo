import pandas as pd
import numpy as np
from app.features.technical import build_technical_features

def test_build_technical_features_columns():
    dates = pd.date_range("2024-01-01", periods=100)
    df = pd.DataFrame({
        "close": np.random.uniform(100, 200, 100),
        "high": np.random.uniform(200, 210, 100),
        "low": np.random.uniform(90, 100, 100),
        "volume": np.random.randint(1000000, 5000000, 100).astype(float)
    }, index=dates)
    result = build_technical_features(df)
    expected_cols = ["ma5", "ma20", "ma60", "rsi", "macd", "macd_signal",
                     "bb_upper", "bb_lower", "volume_ratio", "obv"]
    for col in expected_cols:
        assert col in result.columns, f"Missing column: {col}"

def test_build_technical_features_no_nan_after_warmup():
    dates = pd.date_range("2024-01-01", periods=100)
    df = pd.DataFrame({
        "close": np.random.uniform(100, 200, 100),
        "high": np.random.uniform(200, 210, 100),
        "low": np.random.uniform(90, 100, 100),
        "volume": np.random.randint(1000000, 5000000, 100).astype(float)
    }, index=dates)
    result = build_technical_features(df).dropna()
    assert len(result) > 0

from unittest.mock import patch, MagicMock
from app.features.sentiment import score_articles

def test_score_articles_returns_float():
    mock_completion = MagicMock()
    mock_completion.choices[0].message.content = "0.65"
    with patch("app.features.sentiment.OpenAI") as MockClient:
        MockClient.return_value.chat.completions.create.return_value = mock_completion
        score = score_articles("AAPL", ["Apple reports record earnings", "iPhone sales surge"])
    assert isinstance(score, float)
    assert -1.0 <= score <= 1.0

def test_score_articles_empty_returns_zero():
    score = score_articles("AAPL", [])
    assert score == 0.0
