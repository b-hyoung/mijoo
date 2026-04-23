import numpy as np
import pandas as pd

from app.features.structural import (
    weekly_trend,
    range_position,
    mid_momentum,
    macro_regime,
    analyst_consensus_score,
    institutional_flow_score,
)


def _make_price_df(n: int = 400, trend: float = 0.0) -> pd.DataFrame:
    """Helper: n business-day rows with optional linear trend."""
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    base = 100 + np.arange(n) * trend
    return pd.DataFrame({"close": base}, index=dates)


def test_weekly_trend_positive_for_uptrend():
    df = _make_price_df(400, trend=0.5)
    score = weekly_trend(df)
    assert 0 < score <= 1.0


def test_weekly_trend_negative_for_downtrend():
    # keep prices positive throughout: start 300, end 100
    dates = pd.date_range("2024-01-01", periods=400, freq="B")
    base = np.linspace(300, 100, 400)
    df = pd.DataFrame({"close": base}, index=dates)
    score = weekly_trend(df)
    assert -1.0 <= score < 0


def test_range_position_at_highs():
    df = _make_price_df(300, trend=0.3)
    score = range_position(df)
    assert score > 0.5


def test_range_position_at_lows():
    df = _make_price_df(300, trend=-0.3)
    score = range_position(df)
    assert score < -0.5


def test_mid_momentum_zero_for_flat():
    df = _make_price_df(300, trend=0.0)
    score = mid_momentum(df)
    assert abs(score) < 0.1


def test_macro_regime_risk_on_low_vix():
    # clearly risk-on: low VIX, falling yields, weakening dollar
    score = macro_regime({"vix": 12.0, "treasury_10y_20d_change": -3.0, "dxy_20d_change": -2.0})
    assert score > 0.3


def test_macro_regime_risk_off_high_vix():
    score = macro_regime({"vix": 35.0, "treasury_10y_20d_change": 5.0, "dxy_20d_change": 3.0})
    assert score < -0.3


def test_analyst_consensus_positive_upside():
    score = analyst_consensus_score({"upside_pct": 15.0})
    assert 0 < score <= 1.0


def test_analyst_consensus_missing_data_neutral():
    score = analyst_consensus_score({"upside_pct": None})
    assert score == 0.0


def test_institutional_flow_positive():
    score = institutional_flow_score(
        {"total_pct": 70.0}, {"net_shares_90d": 500_000}
    )
    assert score > 0


def test_institutional_flow_missing_neutral():
    score = institutional_flow_score({"total_pct": None}, {"net_shares_90d": None})
    assert score == 0.0


from app.features.structural import (
    compute_structural_prediction,
    compute_confluence,
)


def test_structural_prediction_week3_range_pct():
    signals = {
        "weekly_trend": 0.5,
        "range_position": 0.0,
        "mid_momentum": 0.5,
        "macro_regime": 0.5,
        "analyst_consensus": 0.5,
        "institutional_flow": 0.5,
    }
    result = compute_structural_prediction(signals, current_price=100.0, week=3)
    assert result["range_low"] == 94.0
    assert result["range_high"] == 106.0
    assert result["direction"] == "UP"
    assert 20 <= result["up_probability"] <= 80
    assert "price_target" not in result


def test_structural_prediction_week4_wider_range():
    signals = {k: 0.0 for k in [
        "weekly_trend", "range_position", "mid_momentum",
        "macro_regime", "analyst_consensus", "institutional_flow",
    ]}
    result = compute_structural_prediction(signals, current_price=100.0, week=4)
    assert result["range_low"] == 92.0
    assert result["range_high"] == 108.0
    assert result["up_probability"] == 50.0


def test_confluence_4_aligned_up():
    conf = compute_confluence(
        {"direction": "UP"}, {"direction": "UP"},
        {"direction": "UP"}, {"direction": "UP"},
    )
    assert conf["aligned_count"] == 4
    assert conf["tone"] == "strong"
    assert conf["badge"] == "강한 확증"
    assert conf["majority_direction"] == "UP"
    assert conf["per_week"] == ["UP", "UP", "UP", "UP"]


def test_confluence_3_of_4():
    conf = compute_confluence(
        {"direction": "UP"}, {"direction": "UP"},
        {"direction": "UP"}, {"direction": "DOWN"},
    )
    assert conf["aligned_count"] == 3
    assert conf["tone"] == "moderate"


def test_confluence_2_2_split():
    conf = compute_confluence(
        {"direction": "UP"}, {"direction": "UP"},
        {"direction": "DOWN"}, {"direction": "DOWN"},
    )
    assert conf["aligned_count"] == 2
    assert conf["tone"] == "mixed"
    assert conf["badge"] == "혼조 — 되돌림 경계"
