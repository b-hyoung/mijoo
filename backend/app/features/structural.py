"""Structural (mid-term) signals for Week 3/4 prediction confirmation.

Each signal returns a score in [-1.0, +1.0]:
  +1.0 = maximally bullish
  -1.0 = maximally bearish
   0.0 = neutral / insufficient data

Input data is intentionally independent of the daily technical features
(RSI/MACD/MA) used by Week 1/2 XGBoost models — using the same features
4 times would produce correlated outputs, defeating the "confluence" premise.
"""
from __future__ import annotations

import math

import pandas as pd


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def weekly_trend(price_df: pd.DataFrame) -> float:
    """Weekly-resampled MA5 vs MA20 trend.

    Positive when weekly MA5 > MA20 (short weekly average above longer),
    scaled by gap magnitude.
    """
    if price_df.empty or "close" not in price_df.columns:
        return 0.0
    weekly = price_df["close"].resample("W").last().dropna()
    if len(weekly) < 20:
        return 0.0
    ma5 = weekly.rolling(5).mean().iloc[-1]
    ma20 = weekly.rolling(20).mean().iloc[-1]
    if ma20 == 0 or pd.isna(ma5) or pd.isna(ma20):
        return 0.0
    gap_pct = (ma5 - ma20) / ma20
    return _clip(gap_pct / 0.05)


def range_position(price_df: pd.DataFrame) -> float:
    """Current price position within the 52-week range.

    -1.0 at 52w low, +1.0 at 52w high, 0.0 at midpoint.
    """
    if price_df.empty or "close" not in price_df.columns:
        return 0.0
    window = price_df["close"].tail(252)
    if len(window) < 30:
        return 0.0
    lo, hi = window.min(), window.max()
    cur = window.iloc[-1]
    if hi == lo:
        return 0.0
    ratio = (cur - lo) / (hi - lo)
    return _clip(ratio * 2 - 1)


def mid_momentum(price_df: pd.DataFrame) -> float:
    """Average of 60-day and 120-day returns, tanh-normalized."""
    if price_df.empty or "close" not in price_df.columns:
        return 0.0
    closes = price_df["close"]
    if len(closes) < 121:
        return 0.0
    r60 = closes.iloc[-1] / closes.iloc[-61] - 1
    r120 = closes.iloc[-1] / closes.iloc[-121] - 1
    avg = (r60 + r120) / 2
    return _clip(math.tanh(avg * 5))


def macro_regime(macro: dict | None) -> float:
    """Combined macro risk-on/off score.

    Positive = risk-on (low fear, stable rates, stable dollar).
    """
    if not macro:
        return 0.0
    vix = macro.get("vix")
    t10y_chg = macro.get("treasury_10y_20d_change")
    dxy_chg = macro.get("dxy_20d_change")

    parts: list[float] = []
    if vix is not None:
        parts.append(_clip((20 - vix) / 10))
    if t10y_chg is not None:
        parts.append(_clip(-t10y_chg / 5))
    if dxy_chg is not None:
        parts.append(_clip(-dxy_chg / 3))

    if not parts:
        return 0.0
    return _clip(sum(parts) / len(parts))


def analyst_consensus_score(analyst: dict | None) -> float:
    """Analyst upside percent normalized: ±30% upside → ±1.0."""
    if not analyst:
        return 0.0
    up = analyst.get("upside_pct")
    if up is None:
        return 0.0
    return _clip(up / 30.0)


def institutional_flow_score(institutional: dict | None, insider: dict | None) -> float:
    """Combine institutional ownership delta vs 45% baseline and insider net 90d."""
    parts: list[float] = []
    if institutional and institutional.get("total_pct") is not None:
        pct = institutional["total_pct"]
        parts.append(_clip((pct - 45) / 55))
    if insider and insider.get("net_shares_90d") is not None:
        net = insider["net_shares_90d"]
        parts.append(_clip(net / 500_000))
    if not parts:
        return 0.0
    return _clip(sum(parts) / len(parts))
