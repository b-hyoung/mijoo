# Weekly Prediction Confluence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Week 1/2는 이벤트 기반 예측(기존 XGBoost + 캘린더 프롬프트 주입)으로 유지하고, Week 3/4는 독립적 구조 신호 가중합으로 교체하여 확률+범위로 노출하고, 4주 방향 일치도를 종합하는 confluence 레이어를 추가한다.

**Architecture:** 백엔드 — `event_calendar.py`와 `features/structural.py` 신규 모듈 + `predict.py`의 week3/4 출력 교체 + confluence 계산/설명 추가. 프론트 — `WeekPrediction` 타입을 union으로 분리하고 `WeeklyCards` 렌더를 단기/구조 두 섹션으로 분할.

**Tech Stack:** Python 3.11, FastAPI, pydantic, pandas, XGBoost, pytest (백엔드) / Next.js 16, TypeScript, React Server Components (프론트엔드)

**Reference Spec:** [docs/superpowers/specs/2026-04-23-weekly-prediction-confluence-design.md](../specs/2026-04-23-weekly-prediction-confluence-design.md)

---

## File Structure

**Backend — 신규:**
- `backend/app/collectors/event_calendar.py` — 정적 캘린더(FOMC/CPI/NFP) + `upcoming_events()` 조회
- `backend/app/features/structural.py` — 6개 구조 시그널 계산 + `compute_structural_prediction()` + `compute_confluence()`
- `backend/tests/test_event_calendar.py` — 캘린더 유닛 테스트
- `backend/tests/test_structural.py` — 시그널/예측/컨플루언스 유닛 테스트

**Backend — 수정:**
- `backend/app/ml/trainer.py` — `WEEKS = [1, 2]`로 축소
- `backend/app/routers/predict.py` — week3/4 출력을 structural로 교체, confluence 필드 추가, 이벤트 주입
- `backend/app/debate/engine.py` — 토론 컨텍스트에 `upcoming_events` 주입
- `backend/app/debate/personas.py` — `CONFLUENCE_EXPLAINER` 페르소나 추가
- `backend/app/debate/orchestrator.py` — confluence 설명 호출 통합

**Frontend — 수정:**
- `frontend/lib/api.ts` — `WeekPredictionPoint`/`WeekPredictionRange` union, `Confluence` 타입, `UpcomingEvent` 타입
- `frontend/components/WeeklyCards.tsx` — 단기(1/2)와 구조(3/4) 렌더 분리
- `frontend/components/PredictionSection.tsx` — confluence 배지 추가
- `frontend/app/stock/[ticker]/page.tsx` — confluence 종합 섹션 신설

**Frontend — 신규:**
- `frontend/components/ConfluenceBadge.tsx` — 재사용 배지
- `frontend/components/ConfluenceSection.tsx` — 상세 페이지 종합 설명 블록

---

## Pre-flight

- [ ] **Verify backend dev server runs** — `set -a && source .env && set +a && cd backend && PYTHONIOENCODING=utf-8 py -m uvicorn app.main:app --port 8000 --reload` starts without errors. Confirm `curl http://127.0.0.1:8000/health` returns `{"status":"ok"}`.
- [ ] **Verify frontend dev server runs** — `cd frontend && npm run dev` starts on port 3000.
- [ ] **Read [frontend/node_modules/next/dist/docs/](../../../frontend/node_modules/next/dist/docs/)** before touching frontend files — Next.js 16.2.2 has breaking changes vs training data.

---

## Task 1: Event Calendar Module

**Files:**
- Create: `backend/app/collectors/event_calendar.py`
- Test: `backend/tests/test_event_calendar.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_event_calendar.py
from datetime import datetime, timezone
from unittest.mock import patch

from app.collectors.event_calendar import upcoming_events


def _fixed_now():
    return datetime(2026, 4, 23, tzinfo=timezone.utc)


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_within_window(_):
    events = upcoming_events(days_ahead=14)
    # FOMC 2026-04-28/29 is 5 days away → included
    types = {e["type"] for e in events}
    assert "FOMC" in types
    for e in events:
        assert 0 <= e["days_until"] <= 14
        assert e["type"] in {"FOMC", "CPI", "NFP"}
        assert "date" in e


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_excludes_outside_window(_):
    events = upcoming_events(days_ahead=3)
    # FOMC is 5 days away → must NOT appear when window is 3
    types = {e["type"] for e in events}
    assert "FOMC" not in types


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_sorted_by_days_until(_):
    events = upcoming_events(days_ahead=30)
    days_seq = [e["days_until"] for e in events]
    assert days_seq == sorted(days_seq)


@patch("app.collectors.event_calendar._now", side_effect=_fixed_now)
def test_upcoming_events_zero_ahead(_):
    events = upcoming_events(days_ahead=0)
    # No events are exactly today in fixture → empty list
    assert events == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && py -m pytest tests/test_event_calendar.py -v`
Expected: FAIL with `ImportError: ... app.collectors.event_calendar`.

- [ ] **Step 3: Implement the module**

```python
# backend/app/collectors/event_calendar.py
"""Static macro-event calendar for forward-looking prediction context.

Hardcoded FOMC meeting dates, CPI release dates, and NFP release dates for 2026.
Each year requires a small manual update (end-of-year maintenance task).

Sources verified against:
- FOMC:  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
- CPI:   https://www.bls.gov/schedule/news_release/cpi.htm
- NFP:   https://www.bls.gov/schedule/news_release/empsit.htm

Engineer: verify these dates against the official sources before merging;
placeholder dates are reasonable approximations but may shift by 1-2 days.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, TypedDict


class EventEntry(TypedDict):
    type: Literal["FOMC", "CPI", "NFP"]
    date: str  # YYYY-MM-DD
    days_until: int


# FOMC 정례회의 2026 (2-day meetings; use day-2 for "meeting date")
_FOMC_DATES: list[str] = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-10",
    "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
]

# CPI 발표일 (매월 둘째 주 수요일경)
_CPI_DATES: list[str] = [
    "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-15",
    "2026-05-13", "2026-06-10", "2026-07-15", "2026-08-12",
    "2026-09-09", "2026-10-14", "2026-11-12", "2026-12-10",
]

# NFP (Non-Farm Payrolls, 매월 첫 금요일)
_NFP_DATES: list[str] = [
    "2026-01-02", "2026-02-06", "2026-03-06", "2026-04-03",
    "2026-05-01", "2026-06-05", "2026-07-02", "2026-08-07",
    "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
]


def _now() -> datetime:
    """Indirection for testability — patch this in tests."""
    return datetime.now(timezone.utc)


def _to_utc_midnight(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def upcoming_events(days_ahead: int = 14) -> list[EventEntry]:
    """Return macro events occurring within `days_ahead` days from now, sorted by proximity.

    Days_until is calculated in whole days (UTC midnight boundaries).
    """
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    horizon = days_ahead

    out: list[EventEntry] = []
    for kind, dates in (("FOMC", _FOMC_DATES), ("CPI", _CPI_DATES), ("NFP", _NFP_DATES)):
        for d in dates:
            evt_date = _to_utc_midnight(d)
            delta = (evt_date - today).days
            if 0 <= delta <= horizon:
                out.append({"type": kind, "date": d, "days_until": delta})

    out.sort(key=lambda e: e["days_until"])
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && py -m pytest tests/test_event_calendar.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/collectors/event_calendar.py backend/tests/test_event_calendar.py
git commit -m "feat(backend): static macro event calendar (FOMC/CPI/NFP) with upcoming-window query"
```

---

## Task 2: Structural Signals (6 features)

**Files:**
- Create: `backend/app/features/structural.py`
- Test: `backend/tests/test_structural.py`

- [ ] **Step 1: Write the failing tests for individual signals**

```python
# backend/tests/test_structural.py
import numpy as np
import pandas as pd
import pytest

from app.features.structural import (
    weekly_trend,
    range_position,
    mid_momentum,
    macro_regime,
    analyst_consensus_score,
    institutional_flow_score,
)


def _make_price_df(n: int = 400, trend: float = 0.0) -> pd.DataFrame:
    """Helper: n daily rows with optional linear trend."""
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    base = 100 + np.arange(n) * trend
    return pd.DataFrame({"close": base}, index=dates)


def test_weekly_trend_positive_for_uptrend():
    df = _make_price_df(400, trend=0.5)  # strong uptrend
    score = weekly_trend(df)
    assert 0 < score <= 1.0


def test_weekly_trend_negative_for_downtrend():
    df = _make_price_df(400, trend=-0.5)
    score = weekly_trend(df)
    assert -1.0 <= score < 0


def test_range_position_at_highs():
    df = _make_price_df(300, trend=0.3)  # rising → current near highs
    score = range_position(df)
    assert score > 0.5  # near top of 52w range


def test_range_position_at_lows():
    df = _make_price_df(300, trend=-0.3)
    score = range_position(df)
    assert score < -0.5


def test_mid_momentum_zero_for_flat():
    df = _make_price_df(300, trend=0.0)
    score = mid_momentum(df)
    assert abs(score) < 0.1


def test_macro_regime_risk_on_low_vix():
    score = macro_regime({"vix": 15.0, "treasury_10y_20d_change": 0.0, "dxy_20d_change": 0.0})
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && py -m pytest tests/test_structural.py -v`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement the signal module**

```python
# backend/app/features/structural.py
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

import numpy as np
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
    # ±5% gap = ±1.0 score
    return _clip(gap_pct / 0.05)


def range_position(price_df: pd.DataFrame) -> float:
    """Current price position within the 52-week range.

    -1.0 at 52w low, +1.0 at 52w high, 0.0 at midpoint.
    Note: for a mean-reverting interpretation, the caller applies a negative
    weight in the aggregator (range_position alone is a descriptor, not a
    directional bet).
    """
    if price_df.empty or "close" not in price_df.columns:
        return 0.0
    window = price_df["close"].tail(252)  # ~52 weeks of trading days
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
    return _clip(math.tanh(avg * 5))  # 5x sharpens the response curve


def macro_regime(macro: dict | None) -> float:
    """Combined macro risk-on/off score.

    Inputs:
      vix                          float
      treasury_10y_20d_change      float (percent)
      dxy_20d_change               float (percent)
    Positive = risk-on (low fear, stable rates, stable dollar)
    """
    if not macro:
        return 0.0
    vix = macro.get("vix")
    t10y_chg = macro.get("treasury_10y_20d_change")
    dxy_chg = macro.get("dxy_20d_change")

    parts: list[float] = []
    if vix is not None:
        # VIX 15 → +0.5, 20 → 0, 30 → -1.0
        parts.append(_clip((20 - vix) / 10))
    if t10y_chg is not None:
        # rising yields pressure growth stocks
        parts.append(_clip(-t10y_chg / 5))
    if dxy_chg is not None:
        # strong dollar headwinds for multinationals
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
        parts.append(_clip((pct - 45) / 55))  # 45% neutral, 100% very bullish, 0% bearish
    if insider and insider.get("net_shares_90d") is not None:
        net = insider["net_shares_90d"]
        parts.append(_clip(net / 500_000))
    if not parts:
        return 0.0
    return _clip(sum(parts) / len(parts))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && py -m pytest tests/test_structural.py -v`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/structural.py backend/tests/test_structural.py
git commit -m "feat(backend): structural signals for mid-term (week 3/4) confirmation layer"
```

---

## Task 3: Structural Prediction + Confluence Aggregator

**Files:**
- Modify: `backend/app/features/structural.py` (append two functions)
- Modify: `backend/tests/test_structural.py` (append tests)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_structural.py`:

```python
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
    # week3 range = ±6%
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
    # week4 range = ±8%
    assert result["range_low"] == 92.0
    assert result["range_high"] == 108.0
    assert result["up_probability"] == 50.0  # all-zero signals → 50/50


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && py -m pytest tests/test_structural.py -v`
Expected: 5 new failures (import errors).

- [ ] **Step 3: Append the two functions to `structural.py`**

```python
# Append at end of backend/app/features/structural.py

WEIGHTS: dict[str, float] = {
    "weekly_trend": 0.25,
    "range_position": -0.15,   # near-high = mean-reversion pressure down
    "mid_momentum": 0.20,
    "macro_regime": 0.20,
    "analyst_consensus": 0.10,
    "institutional_flow": 0.10,
}


def compute_structural_prediction(signals: dict, current_price: float, week: int) -> dict:
    """Produce a week-3/4 prediction from 6 structural signals.

    Output shape (intentionally different from week 1/2 — no price_target):
        direction:       "UP" | "DOWN"
        up_probability:  20.0 ~ 80.0 (clipped)
        range_low/high:  current_price * (1 ∓ range_pct)
    """
    score = sum(signals.get(k, 0.0) * w for k, w in WEIGHTS.items())
    score = max(-1.0, min(1.0, score))
    up_probability = round(50 + score * 30, 1)  # score=±1 → 80%/20%
    up_probability = max(20.0, min(80.0, up_probability))
    direction = "UP" if score >= 0 else "DOWN"
    range_pct = 0.06 if week == 3 else 0.08
    return {
        "direction": direction,
        "up_probability": up_probability,
        "range_low": round(current_price * (1 - range_pct), 2),
        "range_high": round(current_price * (1 + range_pct), 2),
    }


def compute_confluence(w1: dict, w2: dict, w3: dict, w4: dict) -> dict:
    """Aggregate 4-week directional alignment."""
    dirs = [w1["direction"], w2["direction"], w3["direction"], w4["direction"]]
    up = dirs.count("UP")
    down = dirs.count("DOWN")
    aligned = max(up, down)
    majority = "UP" if up >= down else "DOWN"

    if aligned == 4:
        badge, tone = "강한 확증", "strong"
    elif aligned == 3:
        badge, tone = "대체로 일치", "moderate"
    else:  # aligned == 2 (2-2 split)
        badge, tone = "혼조 — 되돌림 경계", "mixed"

    return {
        "aligned_count": aligned,
        "total": 4,
        "majority_direction": majority,
        "badge": badge,
        "tone": tone,
        "per_week": dirs,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && py -m pytest tests/test_structural.py -v`
Expected: 16 passed (11 from Task 2 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/structural.py backend/tests/test_structural.py
git commit -m "feat(backend): structural prediction + confluence aggregator"
```

---

## Task 4: Shrink ML Training to Weeks 1-2

**Files:**
- Modify: `backend/app/ml/trainer.py:18`
- Delete: `C:/app/data/models/*_week3.json`, `*_week4.json`

- [ ] **Step 1: Read current trainer.py**

Read `backend/app/ml/trainer.py` to confirm line 18 has `WEEKS = [1, 2, 3, 4]`.

- [ ] **Step 2: Change WEEKS constant**

Edit `backend/app/ml/trainer.py`:
- Before: `WEEKS = [1, 2, 3, 4]  # 7, 14, 21, 28일`
- After: `WEEKS = [1, 2]  # 7, 14일 (week3/4는 구조 시그널로 대체)`

- [ ] **Step 3: Remove unused std_by_week entries in predictor**

Edit `backend/app/ml/predictor.py`:
- Before: `std_by_week = {1: 0.02, 2: 0.03, 3: 0.04, 4: 0.05}`
- After: `std_by_week = {1: 0.02, 2: 0.03}`

- [ ] **Step 4: Delete obsolete model artifacts**

Run:
```bash
rm -f /c/app/data/models/*_week3.json /c/app/data/models/*_week4.json
ls /c/app/data/models/ | head
```
Expected output contains only `*_week1.json` and `*_week2.json`.

- [ ] **Step 5: Verify the models still train/load**

Run: `cd backend && py -c "from app.ml.trainer import WEEKS; print(WEEKS)"`
Expected: `[1, 2]`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ml/trainer.py backend/app/ml/predictor.py
git commit -m "refactor(ml): shrink XGBoost training to weeks 1-2"
```

---

## Task 5: Wire Structural Prediction into `/predict` Response

**Files:**
- Modify: `backend/app/routers/predict.py`

- [ ] **Step 1: Identify the current predictor call site**

Grep for `predict(models, ...)` invocation — should be inside the `/predict/{ticker}` pipeline, between "ML prediction" and "Assemble result" steps. Confirm line numbers.

- [ ] **Step 2: Add structural imports to predict.py**

Add to the imports at the top of `backend/app/routers/predict.py`:

```python
from app.features.structural import (
    weekly_trend, range_position, mid_momentum, macro_regime,
    analyst_consensus_score, institutional_flow_score,
    compute_structural_prediction,
)
```

After Task 4 (`WEEKS = [1, 2]`), the existing `ml_result = predict(models, latest_row)` now returns only `{week1, week2}`. Task 5's remaining steps add week3/4 by computing structural predictions.

- [ ] **Step 3: Add a helper to build structural signals from pipeline state**

Add to `backend/app/routers/predict.py` (near other comp_* helpers):

```python
def comp_structural_signals(df_clean, macro_data, analyst_data, institutional_data, insider_data) -> dict:
    return {
        "weekly_trend": weekly_trend(df_clean),
        "range_position": range_position(df_clean),
        "mid_momentum": mid_momentum(df_clean),
        "macro_regime": macro_regime(macro_data),
        "analyst_consensus": analyst_consensus_score(analyst_data),
        "institutional_flow": institutional_flow_score(institutional_data, insider_data),
    }
```

- [ ] **Step 4: Populate week3/4 in ml_result from structural**

In the main pipeline inside `get_prediction`, after `ml_result` is built (now containing only week1/2) and after `fund` is available:

```python
# Structural signals for week3/4
structural_signals = comp_structural_signals(
    df_clean,
    fund["macro"],
    fund["analyst"],
    fund["institutional"],
    fund["insider"],
)
current_price = float(latest["close"])
ml_result["week3"] = compute_structural_prediction(structural_signals, current_price, week=3)
ml_result["week4"] = compute_structural_prediction(structural_signals, current_price, week=4)
```

Place this BEFORE `comp_align_ml_debate` so downstream code sees 4 weeks.

- [ ] **Step 5: Verify `assemble_result` passes `ml_result` through unchanged**

Confirm [backend/app/routers/predict.py:305-325](backend/app/routers/predict.py#L305-L325) contains `"prediction": ml_result` — it does (as of current code). No changes needed to `assemble_result`; the new week3/4 shape flows through automatically.

- [ ] **Step 6: Kill stale caches before smoke-testing**

Run:
```bash
py -c "
import sqlite3, datetime
conn = sqlite3.connect(r'C:/app/data/stocks.db')
now = datetime.datetime.now(datetime.timezone.utc)
monday = (now - datetime.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
conn.execute('DELETE FROM predictions WHERE predicted_at >= ?', (monday.isoformat(),))
conn.commit(); conn.close()
print('cache cleared')
"
```

- [ ] **Step 7: Smoke test**

Restart uvicorn (if not `--reload`), then:
```bash
curl -s http://127.0.0.1:8000/predict/AAPL | PYTHONIOENCODING=utf-8 py -c "
import json, sys
d = json.load(sys.stdin)
p = d['prediction']
print('w1:', p['week1'])
print('w3:', p['week3'])
assert 'price_target' in p['week1']
assert 'up_probability' in p['week3']
assert 'price_target' not in p['week3']
print('OK')
"
```
Expected: prints week1 (with price_target), week3 (with up_probability, no price_target), then `OK`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/predict.py
git commit -m "feat(backend): serve week3/4 from structural signals instead of ML"
```

---

## Task 6: Confluence Field in `/predict` Response

**Files:**
- Modify: `backend/app/routers/predict.py`

- [ ] **Step 1: Import the aggregator**

Add `compute_confluence` to the existing `from app.features.structural import ...` line added in Task 5.

- [ ] **Step 2: Compute confluence after all 4 weeks exist**

After populating week3/4 (Task 5 Step 4), append:

```python
from app.features.structural import compute_confluence  # if not already imported

confluence = compute_confluence(
    ml_result["week1"], ml_result["week2"], ml_result["week3"], ml_result["week4"]
)
```

- [ ] **Step 3: Add confluence to the final result dict**

Inside `get_prediction`, after `result = assemble_result(...)` and before `_save_cache`:

```python
result["confluence"] = confluence  # explanation populated in Task 8
```

- [ ] **Step 4: Smoke test**

After server restart + cache clear:
```bash
curl -s http://127.0.0.1:8000/predict/AAPL | PYTHONIOENCODING=utf-8 py -c "
import json, sys
d = json.load(sys.stdin)
c = d['confluence']
print(c)
assert c['aligned_count'] in {2, 3, 4}
assert c['tone'] in {'strong', 'moderate', 'mixed'}
print('OK')
"
```
Expected: prints confluence dict, then `OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/predict.py
git commit -m "feat(backend): confluence aggregation field in /predict response"
```

---

## Task 7: Confluence Explainer Persona

**Files:**
- Modify: `backend/app/debate/personas.py`
- Modify: `backend/app/debate/orchestrator.py`
- Modify: `backend/app/routers/predict.py`

- [ ] **Step 1: Add persona definition**

Edit `backend/app/debate/personas.py` — append below the existing `MACRO_PERSONA`:

```python
CONFLUENCE_EXPLAINER = {
    "id": "confluence",
    "role": "통합 분석가",
    "system": """You integrate short-term (week 1-2) and structural (week 3-4)
predictions. Given each week's direction and the confluence tone,
explain in 1 Korean paragraph (2-3 sentences) WHY they align or diverge.

If aligned (tone=strong or moderate): name the dominant short-term driver
AND the structural factor that supports it.
If mixed (2-2 split): describe the likely scenario. Examples:
  - "단기 반등 후 구조적 약세로 회귀 가능성"
  - "단기 조정 후 장기 추세 재개 가능성"

Respond ONLY with this JSON (use field name "argument"):
{"direction": "UP", "confidence": 50, "argument": "한 문단. 2-3문장."}

The direction/confidence values are placeholders — this persona does not
make a directional call; the explanation text is what matters.
"""
}
```

- [ ] **Step 2: Add orchestrator helper**

Edit `backend/app/debate/orchestrator.py` — append at end:

```python
from app.debate.personas import CONFLUENCE_EXPLAINER, _call_persona


def get_confluence_explanation(
    ticker: str,
    confluence: dict,
    week_personas_summary: str,
) -> str:
    """Generate a 1-paragraph explanation of the confluence pattern.

    `week_personas_summary` is a compact text block describing each week's
    direction + main driver, assembled by the caller.
    """
    context = (
        f"티커: {ticker}\n"
        f"Confluence: {confluence['aligned_count']}/4 일치 ({confluence['tone']}, {confluence['badge']})\n"
        f"주차별 방향: {confluence['per_week']}\n\n"
        f"{week_personas_summary}"
    )
    result = _call_persona(CONFLUENCE_EXPLAINER, context)
    return result.get("argument", "") or ""
```

Note: `_call_persona` is reused; it returns a dict with `{id, role, direction, confidence, argument}` based on `parse_persona_response`. For JSON-shaped personas, the `argument` field carries the explanation text.

- [ ] **Step 3: Call from predict.py**

In `backend/app/routers/predict.py`, after computing `confluence` (Task 6), build a brief summary and call the explainer:

```python
from app.debate.orchestrator import get_confluence_explanation

# Build week-driver summary from debate result (if available)
personas = debate_result.get("personas", []) if debate_result else []
driver_lines = []
for p in personas:
    arg = (p.get("argument") or "").splitlines()[0][:120]
    driver_lines.append(f"- {p.get('role', p.get('id'))}: {p.get('direction')} — {arg}")
personas_summary = "\n".join(driver_lines) if driver_lines else "(페르소나 미수집)"

explanation = get_confluence_explanation(ticker, confluence, personas_summary)
confluence["explanation"] = explanation
```

Insert this block after the `compute_confluence` call and before `result["confluence"] = confluence`.

- [ ] **Step 4: Smoke test**

Clear cache + restart, then:
```bash
curl -s http://127.0.0.1:8000/predict/AAPL | PYTHONIOENCODING=utf-8 py -c "
import json, sys
d = json.load(sys.stdin)
c = d['confluence']
print('explanation:', c.get('explanation'))
assert c.get('explanation'), 'explanation missing or empty'
assert len(c['explanation']) > 20
print('OK')
"
```
Expected: prints a Korean sentence, then `OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/debate/personas.py backend/app/debate/orchestrator.py backend/app/routers/predict.py
git commit -m "feat(backend): confluence explainer persona generates alignment narrative"
```

---

## Task 8: Inject Upcoming Events into Week 1/2 Debate Context

**Files:**
- Modify: `backend/app/debate/engine.py`
- Modify: `backend/app/routers/predict.py` (if it passes context to engine)

- [ ] **Step 1: Import and call event calendar in debate engine**

Edit `backend/app/debate/engine.py` — in `build_debate_context` (or wherever the debate prompt is assembled), add:

```python
from app.collectors.event_calendar import upcoming_events

def _format_event_block(ticker: str, earnings_data: dict | None) -> str:
    macro = upcoming_events(days_ahead=14)
    lines = ["=== 향후 2주 예정 이벤트 ==="]
    if earnings_data and earnings_data.get("days_until") is not None:
        d = earnings_data["days_until"]
        if 0 <= d <= 14:
            lines.append(f"- {ticker} 실적: {earnings_data.get('next_date')} (D-{d})")
    for e in macro:
        lines.append(f"- {e['type']} 발표: {e['date']} (D-{e['days_until']})")
    if len(lines) == 1:
        lines.append("- 예정 이벤트 없음")
    return "\n".join(lines)
```

- [ ] **Step 2: Include the block in the debate context**

In `build_debate_context`, add the event block to the assembled prompt. Locate the part that builds the technical/macro context string and append:

```python
event_block = _format_event_block(ticker, earnings_data)
context = "\n\n".join([context, event_block])  # merge into final prompt
```

Adjust variable names to match the function's actual parameters; the key is that `event_block` ends up in the text sent to personas.

- [ ] **Step 3: Update persona prompts**

Edit `backend/app/debate/personas.py` — append to each of the 3 stock personas' `system` prompts (fundamental, technical, options):

```
- If events are listed in "향후 2주 예정 이벤트" section of the context:
  - Earnings D-7 이내 → 서프라이즈 시나리오 언급 필요
  - FOMC D-10 이내 → 포지셔닝 구간으로 언급
  - CPI/NFP D-5 이내 → 단기 변동성 확대 가능성 언급
```

Use `Edit` with `replace_all=False` separately per persona since each has its own `system` string.

- [ ] **Step 4: Smoke test**

Clear cache + restart, then verify personas reference upcoming events:
```bash
curl -s http://127.0.0.1:8000/predict/AAPL | PYTHONIOENCODING=utf-8 py -c "
import json, sys
d = json.load(sys.stdin)
p = d['debate']['personas']
texts = ' '.join(x.get('argument','') for x in p)
# Expect mention of at least one calendar event keyword if any upcoming
print('persona texts sample:', texts[:400])
print('has event ref:', any(k in texts for k in ['FOMC', 'CPI', 'NFP', '실적', 'D-']))
"
```
Expected: `has event ref: True` (assuming events within 14-day window).

- [ ] **Step 5: Verify `upcoming_events` also appears at the top level**

Edit `backend/app/routers/predict.py` — after `result = assemble_result(...)`:

```python
from app.collectors.event_calendar import upcoming_events as _upcoming
earnings_obj = fund.get("earnings") or {}
events_out = list(_upcoming(days_ahead=14))
if earnings_obj.get("days_until") is not None and 0 <= earnings_obj["days_until"] <= 14:
    events_out.append({
        "type": "earnings",
        "date": earnings_obj.get("next_date"),
        "days_until": earnings_obj["days_until"],
        "ticker": ticker,
    })
events_out.sort(key=lambda e: e.get("days_until", 999))
result["upcoming_events"] = events_out
```

Place this before `_save_cache`.

Smoke test: `curl http://127.0.0.1:8000/predict/AAPL | jq '.upcoming_events'`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/debate/engine.py backend/app/debate/personas.py backend/app/routers/predict.py
git commit -m "feat(backend): inject upcoming macro/earnings events into debate + response"
```

---

## Task 9: Frontend API Types — Union + Confluence

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update `WeekPrediction` to a union**

Edit `frontend/lib/api.ts` — replace the existing `WeekPrediction` interface with two types and a union:

```typescript
export interface WeekPredictionPoint {
  direction: "UP" | "DOWN";
  confidence: number;
  price_target: number;
  price_low: number;
  price_high: number;
}

export interface WeekPredictionRange {
  direction: "UP" | "DOWN";
  up_probability: number;
  range_low: number;
  range_high: number;
}

export type WeekPrediction = WeekPredictionPoint | WeekPredictionRange;

export function isPointPrediction(w: WeekPrediction): w is WeekPredictionPoint {
  return "price_target" in w;
}
```

- [ ] **Step 2: Update `PredictionResult.prediction` types**

In the same file, replace the `prediction` field shape:

```typescript
prediction: {
  week1: WeekPredictionPoint;
  week2: WeekPredictionPoint;
  week3: WeekPredictionRange;
  week4: WeekPredictionRange;
};
```

- [ ] **Step 3: Add Confluence + UpcomingEvent types**

Append to `PredictionResult`:

```typescript
confluence?: {
  aligned_count: number;
  total: number;
  majority_direction: "UP" | "DOWN";
  badge: "강한 확증" | "대체로 일치" | "혼조 — 되돌림 경계";
  tone: "strong" | "moderate" | "mixed";
  per_week: ("UP" | "DOWN")[];
  explanation?: string;
};

upcoming_events?: {
  type: "FOMC" | "CPI" | "NFP" | "earnings";
  date: string;
  days_until: number;
  ticker?: string;
}[];
```

- [ ] **Step 4: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors in all components that access `week3.price_target` or `week4.price_target`. Record these for Task 10.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(frontend): split WeekPrediction into point vs range + confluence types"
```

Do not run the site yet — downstream components will break until Task 10.

---

## Task 10: WeeklyCards Render — Split Short-Term vs Structural

**Files:**
- Modify: `frontend/components/WeeklyCards.tsx`

- [ ] **Step 1: Read current implementation**

Read `frontend/components/WeeklyCards.tsx` to understand the existing card layout and find any direct access to `price_target` on week3/4 (those will cause TS errors after Task 9).

- [ ] **Step 2: Rewrite component to dispatch per-type**

Replace file content with:

```tsx
import {
  WeekPredictionPoint,
  WeekPredictionRange,
  isPointPrediction,
  type PredictionResult,
} from "@/lib/api";

interface Props {
  prediction: PredictionResult["prediction"];
  currentPrice: number;
}

function PointCard({
  label, week, currentPrice,
}: { label: string; week: WeekPredictionPoint; currentPrice: number }) {
  const up = week.direction === "UP";
  const change = ((week.price_target - currentPrice) / currentPrice) * 100;
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: 14, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>
        ${week.price_target.toFixed(2)}
      </div>
      <div style={{ fontSize: 11, color, marginTop: 4 }}>
        {up ? "+" : ""}{change.toFixed(1)}% · {week.confidence}%
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
        ${week.price_low.toFixed(2)} – ${week.price_high.toFixed(2)}
      </div>
    </div>
  );
}

function RangeCard({
  label, week, currentPrice,
}: { label: string; week: WeekPredictionRange; currentPrice: number }) {
  const up = week.direction === "UP";
  const color = up ? "var(--up)" : "var(--down)";
  // Progress bar visualising current price inside range
  const pos = Math.max(0, Math.min(1, (currentPrice - week.range_low) / (week.range_high - week.range_low)));
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px dashed var(--border)",
      borderRadius: 10, padding: 14, minWidth: 0,
    }}
    title="구조적 확증: 개별 가격 예측이 아니라 중기 추세 확인 신호입니다.">
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
        {label} <span style={{ opacity: 0.7 }}>(구조 확증)</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>
        {up ? "상승" : "하락"} {week.up_probability.toFixed(0)}%
      </div>
      <div style={{ position: "relative", height: 6, background: "var(--border)",
                    borderRadius: 3, marginTop: 8 }}>
        <div style={{
          position: "absolute", left: `${pos * 100}%`, top: -3,
          width: 2, height: 12, background: color,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between",
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: "var(--text-3)", marginTop: 4 }}>
        <span>${week.range_low.toFixed(2)}</span>
        <span>${week.range_high.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function WeeklyCards({ prediction, currentPrice }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)",
                      letterSpacing: "0.05em", marginBottom: 8 }}>
          단기 예측 (이벤트 기반)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <PointCard label="1주" week={prediction.week1} currentPrice={currentPrice} />
          <PointCard label="2주" week={prediction.week2} currentPrice={currentPrice} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)",
                      letterSpacing: "0.05em", marginBottom: 8 }}>
          구조적 확증 (중기 추세)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <RangeCard label="3주" week={prediction.week3} currentPrice={currentPrice} />
          <RangeCard label="4주" week={prediction.week4} currentPrice={currentPrice} />
        </div>
      </div>
    </div>
  );
}

// isPointPrediction is available for future consumers but unused here since
// types are already narrowed via explicit week3/week4 = Range.
void isPointPrediction;
```

- [ ] **Step 3: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 4: Visual smoke**

Refresh `http://localhost:3000/stock/AAPL` in the browser. Verify:
- Week 1/2 cards show solid background with $price_target
- Week 3/4 cards show dashed border with "상승 N%" + range bar
- Layout doesn't overflow container

- [ ] **Step 5: Commit**

```bash
git add frontend/components/WeeklyCards.tsx
git commit -m "feat(frontend): split WeeklyCards into short-term point + structural range"
```

---

## Task 11: ConfluenceBadge Component + Main Card Integration

**Files:**
- Create: `frontend/components/ConfluenceBadge.tsx`
- Modify: `frontend/components/PredictionSection.tsx`

- [ ] **Step 1: Create the badge component**

Write `frontend/components/ConfluenceBadge.tsx`:

```tsx
import type { PredictionResult } from "@/lib/api";

interface Props {
  confluence: NonNullable<PredictionResult["confluence"]>;
  size?: "sm" | "md";
}

const TONE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  strong:   { color: "var(--up)",   bg: "rgba(45,212,160,0.12)", border: "rgba(45,212,160,0.3)" },
  moderate: { color: "#86efac",     bg: "rgba(134,239,172,0.1)", border: "rgba(134,239,172,0.25)" },
  mixed:    { color: "#f5a623",     bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.28)" },
};

export default function ConfluenceBadge({ confluence, size = "sm" }: Props) {
  const s = TONE_STYLES[confluence.tone] ?? TONE_STYLES.mixed;
  const fontSize = size === "sm" ? 11 : 13;
  return (
    <span
      title={confluence.explanation ?? confluence.badge}
      style={{
        fontSize, fontWeight: 700, color: s.color,
        background: s.bg, border: `1px solid ${s.border}`,
        borderRadius: 5, padding: "2px 7px", letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {confluence.aligned_count}/{confluence.total} 일치
    </span>
  );
}
```

- [ ] **Step 2: Add badge to PredictionSection**

Edit `frontend/components/PredictionSection.tsx` — import the badge and render it in the verdict row:

Add to imports:
```tsx
import ConfluenceBadge from "./ConfluenceBadge";
```

Inside the verdict row (where the `{v}` verdict span is rendered), after the verdict and change% block, add:

```tsx
{data.confluence && (
  <ConfluenceBadge confluence={data.confluence} size="sm" />
)}
```

Place it inside the same flex container as the verdict badge so they sit side by side.

- [ ] **Step 3: Type check + visual**

Run: `cd frontend && npx tsc --noEmit` → zero errors.
Browser: main page `http://localhost:3000/` — each card shows `N/4 일치` badge beside verdict.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ConfluenceBadge.tsx frontend/components/PredictionSection.tsx
git commit -m "feat(frontend): confluence badge on main page cards"
```

---

## Task 12: ConfluenceSection — Detail Page Narrative

**Files:**
- Create: `frontend/components/ConfluenceSection.tsx`
- Modify: `frontend/app/stock/[ticker]/page.tsx`

- [ ] **Step 1: Create the section**

Write `frontend/components/ConfluenceSection.tsx`:

```tsx
import type { PredictionResult } from "@/lib/api";
import ConfluenceBadge from "./ConfluenceBadge";

interface Props {
  confluence: NonNullable<PredictionResult["confluence"]>;
}

const DIR_COLOR = { UP: "var(--up)", DOWN: "var(--down)" } as const;

export default function ConfluenceSection({ confluence }: Props) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)",
                       letterSpacing: "-0.01em" }}>
          📊 주차별 방향 종합
        </span>
        <ConfluenceBadge confluence={confluence} size="md" />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {confluence.per_week.map((d, i) => (
          <span key={i}
            style={{
              fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
              color: DIR_COLOR[d],
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "2px 6px", letterSpacing: "-0.01em",
            }}>
            W{i + 1} {d === "UP" ? "↑" : "↓"}
          </span>
        ))}
      </div>
      {confluence.explanation && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)",
                    lineHeight: 1.7 }}>
          {confluence.explanation}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the detail page**

Edit `frontend/app/stock/[ticker]/page.tsx`:
- Add to imports: `import ConfluenceSection from "@/components/ConfluenceSection";`
- Render it inside the main content column, between the `Summary` block and the `AnomalyCard` block:

```tsx
{data.confluence && (
  <div style={{ paddingBottom: 16 }}>
    <ConfluenceSection confluence={data.confluence} />
  </div>
)}
```

- [ ] **Step 3: Type check + visual**

Run: `cd frontend && npx tsc --noEmit`
Browser: `http://localhost:3000/stock/AAPL` shows the new section below the summary with per-week badges + explanation.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ConfluenceSection.tsx frontend/app/stock/[ticker]/page.tsx
git commit -m "feat(frontend): confluence narrative section on stock detail page"
```

---

## Task 13: Upcoming Events Tag (Stock Detail Page)

**Files:**
- Modify: `frontend/app/stock/[ticker]/page.tsx`

- [ ] **Step 1: Add a small event strip**

Insert under the header (same area where `분석 N분 전` timestamp lives), render upcoming event badges:

```tsx
{data.upcoming_events && data.upcoming_events.length > 0 && (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
    {data.upcoming_events.map((e, i) => (
      <span key={i}
        title={e.date}
        style={{
          fontSize: 11, fontWeight: 700, color: "var(--text-2)",
          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
          borderRadius: 4, padding: "3px 8px", letterSpacing: "-0.01em",
        }}>
        {e.type === "earnings" ? "실적" : e.type} D-{e.days_until}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 2: Type check + visual**

Run: `cd frontend && npx tsc --noEmit`
Browser: Detail page shows small event badges like `FOMC D-5`, `CPI D-20`, `실적 D-10`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/stock/[ticker]/page.tsx
git commit -m "feat(frontend): upcoming event strip on stock detail"
```

---

## Task 14: End-to-End Verification

**Files:** None (verification only).

- [ ] **Step 1: Full cache wipe + warm restart**

```bash
py -c "
import sqlite3, datetime
conn = sqlite3.connect(r'C:/app/data/stocks.db')
now = datetime.datetime.now(datetime.timezone.utc)
monday = (now - datetime.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
conn.execute('DELETE FROM predictions WHERE predicted_at >= ?', (monday.isoformat(),))
conn.commit(); conn.close()
print('cache cleared')
"
```
Restart the backend (stop existing task, start new one with env loaded).

- [ ] **Step 2: Request all 10 tickers, verify schema**

```bash
for T in AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO COST NFLX; do
  curl -s "http://127.0.0.1:8000/predict/$T" | PYTHONIOENCODING=utf-8 py -c "
import json, sys
d = json.load(sys.stdin)
p = d['prediction']; c = d.get('confluence') or {}
assert 'price_target' in p['week1'], 'week1 missing price_target'
assert 'up_probability' in p['week3'], 'week3 missing up_probability'
assert 'price_target' not in p['week3'], 'week3 should NOT have price_target'
assert c.get('aligned_count') in {2,3,4}, f'bad confluence {c}'
assert c.get('explanation'), 'missing explanation'
print('$T OK', c['tone'], c['aligned_count'])
"
done
```
Expected: 10 lines all containing `OK`.

- [ ] **Step 3: Browser check — main page**

Open `http://localhost:3000/`. Each card should show:
- Verdict badge (existing)
- New `N/4 일치` confluence badge
- Summary, short float %, 매집 flag, 분석 N분 전 (existing)

- [ ] **Step 4: Browser check — detail page**

Open `http://localhost:3000/stock/AAPL`. Verify in order:
1. Header: ticker, price, `분석 N분 전`
2. Event strip: `FOMC D-N`, `실적 D-N`, etc. (if present in 14-day window)
3. Verdict
4. Summary paragraph
5. **New Confluence section** (📊 주차별 방향 종합) with per-week badges + 설명
6. Weekly cards: week1/2 with price targets; week3/4 as range bars
7. Everything else intact

- [ ] **Step 5: Run backend test suite**

```bash
cd backend && py -m pytest tests/test_event_calendar.py tests/test_structural.py -v
```
Expected: all green (4 + 16 = 20 passed).

- [ ] **Step 6: Document run state**

If all green, the feature ships. If anything fails at Step 2-5, return to the relevant task, diagnose, patch, and re-run step 2.

No commit for Task 14 — verification only.
