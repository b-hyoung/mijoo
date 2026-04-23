# Phase 1: Macro Indicators + Persona Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VIX/Treasury/DXY macro data as ML features and replace 8 bull/bear personas with 5 role-based personas for better prediction quality.

**Architecture:** New macro_collector fetches 5-year daily VIX, 10Y Treasury, DXY from yfinance. These get joined to the price DataFrame as 6 new ML features (value + 20d change). The 8 domain×stance personas are replaced with 5 role-based analysts (fundamental, technical, macro, options, risk) that each independently judge direction + confidence. Judge synthesizes weighted opinions.

**Tech Stack:** Python, yfinance, XGBoost, OpenAI GPT-4o/4o-mini, FastAPI, Next.js/React

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/app/collectors/macro_collector.py` | Fetch VIX, 10Y, DXY from yfinance |
| Create | `backend/tests/test_macro_collector.py` | Tests for macro collector |
| Modify | `backend/app/features/technical.py` | Add macro feature columns to DataFrame |
| Create | `backend/tests/test_technical_macro.py` | Tests for macro feature join |
| Modify | `backend/app/ml/trainer.py` | Expand FEATURE_COLS from 11→17 |
| Modify | `backend/app/ml/predictor.py` | Update FEATURE_COLS import |
| Replace | `backend/app/debate/personas.py` | 5 role-based personas |
| Create | `backend/tests/test_personas.py` | Tests for new persona structure |
| Replace | `backend/app/debate/orchestrator.py` | Simplified orchestration (no balance check) |
| Modify | `backend/app/debate/engine.py` | Add macro context section |
| Modify | `backend/app/debate/judge.py` | New judge prompt for role-based opinions |
| Modify | `backend/app/routers/predict.py` | Wire macro collector + pass to debate |
| Modify | `frontend/lib/api.ts` | Add MacroData type |
| Modify | `frontend/app/stock/[ticker]/page.tsx` | Add macro indicators UI section |

---

### Task 1: Macro Collector

**Files:**
- Create: `backend/app/collectors/macro_collector.py`
- Create: `backend/tests/test_macro_collector.py`

- [ ] **Step 1: Create test file**

```python
# backend/tests/test_macro_collector.py
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np
from datetime import datetime


def test_fetch_macro_history_returns_dataframe():
    from app.collectors.macro_collector import fetch_macro_history
    df = fetch_macro_history(period="1mo")
    assert isinstance(df, pd.DataFrame)
    assert "vix" in df.columns
    assert "treasury_10y" in df.columns
    assert "dxy" in df.columns
    assert len(df) > 0


def test_fetch_macro_history_no_nans_after_ffill():
    from app.collectors.macro_collector import fetch_macro_history
    df = fetch_macro_history(period="1mo")
    # After ffill, only leading NaNs possible (before first data point)
    # Interior should have no NaNs
    interior = df.iloc[5:]  # skip first few rows
    if len(interior) > 0:
        assert interior.isnull().sum().sum() == 0, "Interior NaNs found after ffill"


def test_fetch_macro_latest_returns_dict():
    from app.collectors.macro_collector import fetch_macro_latest
    result = fetch_macro_latest()
    assert isinstance(result, dict)
    assert "vix" in result
    assert "vix_20d_change" in result
    assert "treasury_10y" in result
    assert "treasury_10y_20d_change" in result
    assert "dxy" in result
    assert "dxy_20d_change" in result


def test_fetch_macro_latest_change_is_percentage():
    from app.collectors.macro_collector import fetch_macro_latest
    result = fetch_macro_latest()
    # 20d change should be a reasonable percentage (not raw price diff)
    assert -100 < result["vix_20d_change"] < 500, f"VIX change looks wrong: {result['vix_20d_change']}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_macro_collector.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.collectors.macro_collector'`

- [ ] **Step 3: Implement macro_collector.py**

```python
# backend/app/collectors/macro_collector.py
import yfinance as yf
import pandas as pd

MACRO_TICKERS = {
    "vix": "^VIX",
    "treasury_10y": "^TNX",
    "dxy": "DX-Y.NYB",
}


def fetch_macro_history(period: str = "5y") -> pd.DataFrame:
    """Fetch VIX, 10Y Treasury, DXY as daily DataFrame.
    Missing days (weekends/holidays) filled with previous value."""
    frames = {}
    for col, symbol in MACRO_TICKERS.items():
        try:
            df = yf.download(symbol, period=period, progress=False)
            if df is not None and not df.empty:
                # Handle multi-level columns from yfinance
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                frames[col] = df["Close"]
        except Exception:
            pass

    if not frames:
        return pd.DataFrame()

    result = pd.DataFrame(frames)
    result = result.ffill()
    result.index = pd.to_datetime(result.index).tz_localize(None)
    return result


def fetch_macro_latest() -> dict:
    """Return latest macro values + 20-day percentage change."""
    df = fetch_macro_history(period="2mo")
    if df.empty or len(df) < 21:
        return {
            "vix": None, "vix_20d_change": None,
            "treasury_10y": None, "treasury_10y_20d_change": None,
            "dxy": None, "dxy_20d_change": None,
        }

    latest = df.iloc[-1]
    prev_20d = df.iloc[-21]

    result = {}
    for col in MACRO_TICKERS:
        val = float(latest[col]) if pd.notna(latest[col]) else None
        prev = float(prev_20d[col]) if pd.notna(prev_20d[col]) else None
        change = round((val - prev) / prev * 100, 1) if val and prev and prev != 0 else None
        result[col] = round(val, 2) if val else None
        result[f"{col}_20d_change"] = change

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_macro_collector.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/collectors/macro_collector.py backend/tests/test_macro_collector.py
git commit -m "feat: add macro collector for VIX, Treasury 10Y, DXY"
```

---

### Task 2: Add Macro Features to Technical Pipeline

**Files:**
- Modify: `backend/app/features/technical.py`
- Create: `backend/tests/test_technical_macro.py`

- [ ] **Step 1: Create test file**

```python
# backend/tests/test_technical_macro.py
import pandas as pd
import numpy as np


def test_add_macro_features_adds_columns():
    from app.features.technical import add_macro_features
    # Create a simple price df with date index
    dates = pd.date_range("2024-01-01", periods=30, freq="B")
    price_df = pd.DataFrame({"close": np.random.uniform(100, 200, 30)}, index=dates)

    macro_df = pd.DataFrame({
        "vix": np.random.uniform(15, 30, 30),
        "treasury_10y": np.random.uniform(3.5, 4.5, 30),
        "dxy": np.random.uniform(100, 110, 30),
    }, index=dates)

    result = add_macro_features(price_df, macro_df)
    assert "vix" in result.columns
    assert "vix_20d_change" in result.columns
    assert "treasury_10y" in result.columns
    assert "treasury_10y_20d_change" in result.columns
    assert "dxy" in result.columns
    assert "dxy_20d_change" in result.columns


def test_add_macro_features_handles_missing_dates():
    from app.features.technical import add_macro_features
    dates = pd.date_range("2024-01-01", periods=30, freq="B")
    price_df = pd.DataFrame({"close": np.random.uniform(100, 200, 30)}, index=dates)

    # Macro has fewer dates
    macro_df = pd.DataFrame({
        "vix": np.random.uniform(15, 30, 20),
        "treasury_10y": np.random.uniform(3.5, 4.5, 20),
        "dxy": np.random.uniform(100, 110, 20),
    }, index=dates[:20])

    result = add_macro_features(price_df, macro_df)
    assert len(result) == 30  # Same length as price_df
    # Missing macro rows should be ffilled
    assert result["vix"].iloc[-1] is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_technical_macro.py -v`
Expected: FAIL — `ImportError: cannot import name 'add_macro_features'`

- [ ] **Step 3: Add add_macro_features to technical.py**

Add this function at the end of `backend/app/features/technical.py`:

```python
def add_macro_features(price_df: pd.DataFrame, macro_df: pd.DataFrame) -> pd.DataFrame:
    """Join macro data to price DataFrame and compute 20-day change rates."""
    result = price_df.copy()

    if macro_df.empty:
        for col in ["vix", "treasury_10y", "dxy"]:
            result[col] = np.nan
            result[f"{col}_20d_change"] = np.nan
        return result

    # Align indexes (both should be DatetimeIndex)
    macro_df.index = pd.to_datetime(macro_df.index).tz_localize(None)
    result.index = pd.to_datetime(result.index).tz_localize(None)

    # Join
    for col in ["vix", "treasury_10y", "dxy"]:
        if col in macro_df.columns:
            result[col] = macro_df[col].reindex(result.index).ffill()
            result[f"{col}_20d_change"] = result[col].pct_change(20) * 100
        else:
            result[col] = np.nan
            result[f"{col}_20d_change"] = np.nan

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_technical_macro.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/features/technical.py backend/tests/test_technical_macro.py
git commit -m "feat: add macro feature join to technical pipeline"
```

---

### Task 3: Expand ML Feature Columns

**Files:**
- Modify: `backend/app/ml/trainer.py`
- Modify: `backend/app/ml/predictor.py`

- [ ] **Step 1: Update FEATURE_COLS in trainer.py**

Replace the FEATURE_COLS list in `backend/app/ml/trainer.py`:

```python
FEATURE_COLS = [
    "ma5", "ma20", "ma60", "rsi", "macd", "macd_signal",
    "bb_upper", "bb_lower", "volume_ratio", "obv", "sentiment",
    "vix", "vix_20d_change",
    "treasury_10y", "treasury_10y_20d_change",
    "dxy", "dxy_20d_change",
]
```

- [ ] **Step 2: Verify predictor.py imports FEATURE_COLS from trainer**

Read `backend/app/ml/predictor.py` line 2 — it already imports `from app.ml.trainer import FEATURE_COLS`. No change needed. The 17-column list will propagate automatically.

- [ ] **Step 3: Commit**

```bash
git add backend/app/ml/trainer.py
git commit -m "feat: expand ML features from 11 to 17 (add macro)"
```

---

### Task 4: Replace Personas with Role-Based System

**Files:**
- Replace: `backend/app/debate/personas.py`
- Create: `backend/tests/test_personas.py`

- [ ] **Step 1: Create test file**

```python
# backend/tests/test_personas.py
import json


def test_personas_has_five_roles():
    from app.debate.personas import PERSONAS
    assert len(PERSONAS) == 5
    ids = [p["id"] for p in PERSONAS]
    assert "fundamental" in ids
    assert "technical" in ids
    assert "macro" in ids
    assert "options" in ids
    assert "risk" in ids


def test_personas_no_stance_field():
    from app.debate.personas import PERSONAS
    for p in PERSONAS:
        assert "stance" not in p, f"Persona {p['id']} should not have 'stance' field"
        assert "role" in p
        assert "system" in p


def test_parse_persona_response_valid():
    from app.debate.personas import parse_persona_response
    raw = '{"direction": "UP", "confidence": 72, "argument": "테스트 근거"}'
    result = parse_persona_response(raw, "fundamental")
    assert result["direction"] == "UP"
    assert result["confidence"] == 72
    assert result["argument"] == "테스트 근거"


def test_parse_persona_response_fallback():
    from app.debate.personas import parse_persona_response
    raw = "This is not JSON, just plain text analysis"
    result = parse_persona_response(raw, "technical")
    assert result["direction"] in ("UP", "DOWN")
    assert 40 <= result["confidence"] <= 60
    assert len(result["argument"]) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_personas.py -v`
Expected: FAIL — old personas structure doesn't match

- [ ] **Step 3: Replace personas.py**

```python
# backend/app/debate/personas.py
import json
import concurrent.futures
from openai import OpenAI
from app.config import settings

PERSONAS = [
    {
        "id": "fundamental",
        "role": "펀더멘털 분석가",
        "system": """You are a fundamental stock analyst. Analyze earnings data, analyst price targets, insider transactions, and institutional holdings.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 40-95>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on fundamental data (earnings, analyst targets, insider trades, institutional flows)
- Do NOT analyze technical indicators — that is another analyst's job
- confidence reflects how strong the fundamental signals are
- argument must cite specific numbers from the data"""
    },
    {
        "id": "technical",
        "role": "테크니컬 분석가",
        "system": """You are a technical stock analyst. Analyze RSI, MACD, moving averages, Bollinger Bands, volume patterns, and OBV trends.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 40-95>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on technical indicators (RSI, MACD, MA, BB, volume, OBV)
- Do NOT analyze news, earnings, or fundamentals — that is another analyst's job
- confidence reflects how clear the technical signals are
- argument must cite specific indicator values"""
    },
    {
        "id": "macro",
        "role": "매크로 전략가",
        "system": """You are a macro strategist. Analyze VIX (fear index), 10-Year Treasury yield, US Dollar Index (DXY), and their recent trends to assess the macro environment's impact on this stock.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 40-95>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on macro indicators (VIX, rates, dollar)
- Explain how the macro environment specifically affects THIS stock
- confidence reflects how strongly macro conditions favor one direction
- argument must cite specific macro values and their 20-day changes"""
    },
    {
        "id": "options",
        "role": "옵션 트레이더",
        "system": """You are an options flow analyst. Analyze put/call ratio, implied volatility rank, and unusual options activity to detect smart money positioning.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 40-95>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on options data (P/C ratio, IV rank, unusual activity)
- If options data is unavailable, set confidence to 50 and note data unavailable
- confidence reflects how clear the options signals are
- argument must cite specific options metrics"""
    },
    {
        "id": "risk",
        "role": "리스크 매니저",
        "system": """You are a risk manager. Evaluate short interest levels, anomaly signals, earnings proximity risk, and overall downside scenarios.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 40-95>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus on RISK factors: short interest, anomaly score, earnings timing, worst-case scenarios
- You naturally lean bearish — that's your job. But if risks are genuinely low, say so
- confidence reflects how much risk you see
- argument must cite specific risk metrics"""
    },
]


def parse_persona_response(raw: str, persona_id: str) -> dict:
    """Parse JSON response from persona. Fallback if invalid."""
    try:
        data = json.loads(raw)
        return {
            "direction": data.get("direction", "UP"),
            "confidence": int(data.get("confidence", 50)),
            "argument": data.get("argument", raw),
        }
    except (json.JSONDecodeError, KeyError, TypeError):
        return {
            "direction": "UP" if "상승" in raw or "긍정" in raw else "DOWN",
            "confidence": 50,
            "argument": raw.strip(),
        }


def _call_persona(persona: dict, context: str, client: OpenAI) -> dict:
    """Call a single persona and return structured result."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": persona["system"]},
                {"role": "user", "content": context}
            ],
            temperature=0.3,
            max_tokens=400,
            response_format={"type": "json_object"}
        )
        raw = response.choices[0].message.content.strip()
        parsed = parse_persona_response(raw, persona["id"])
        return {
            "id": persona["id"],
            "role": persona["role"],
            **parsed,
        }
    except Exception as e:
        return {
            "id": persona["id"],
            "role": persona["role"],
            "direction": "UP",
            "confidence": 50,
            "argument": f"분석 불가: {str(e)}",
        }


def run_personas(context: str, persona_ids: list[str] | None = None) -> list[dict]:
    """Run specified personas (or all) in parallel."""
    client = OpenAI(api_key=settings.openai_api_key)
    targets = [p for p in PERSONAS if persona_ids is None or p["id"] in persona_ids]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(_call_persona, p, context, client) for p in targets]
        return [f.result() for f in concurrent.futures.as_completed(futures)]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec mijoo-backend-1 python -m pytest tests/test_personas.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/debate/personas.py backend/tests/test_personas.py
git commit -m "feat: replace 8 bull/bear personas with 5 role-based analysts"
```

---

### Task 5: Simplify Orchestrator

**Files:**
- Replace: `backend/app/debate/orchestrator.py`

- [ ] **Step 1: Replace orchestrator.py**

```python
# backend/app/debate/orchestrator.py
from app.debate.personas import run_personas


def get_context_weights(
    technical_data: dict,
    macro_data: dict | None = None,
    options_data: dict | None = None,
    earnings_data: dict | None = None,
    anomaly_data: dict | None = None,
) -> dict:
    """Compute persona weights based on market context."""
    weights = {
        "fundamental": 1.0,
        "technical": 1.0,
        "macro": 1.0,
        "options": 1.0,
        "risk": 1.0,
    }

    # Boost technical weight if RSI is extreme
    rsi = technical_data.get("rsi", 50)
    if rsi < 30 or rsi > 70:
        weights["technical"] += 0.5

    # Boost macro weight if VIX is swinging hard
    if macro_data and macro_data.get("vix_20d_change") is not None:
        if abs(macro_data["vix_20d_change"]) > 20:
            weights["macro"] += 0.5

    # Boost options weight if IV is elevated
    if options_data and options_data.get("iv_rank") is not None:
        if options_data["iv_rank"] >= 80:
            weights["options"] += 0.5

    # Boost fundamental weight if earnings imminent
    if earnings_data and earnings_data.get("days_until") is not None:
        if earnings_data["days_until"] <= 7:
            weights["fundamental"] += 0.5

    # Boost risk weight if anomaly detected
    if anomaly_data and anomaly_data.get("score") is not None:
        if anomaly_data["score"] >= 50:
            weights["risk"] += 0.5

    return weights


def orchestrate(
    context: str,
    technical_data: dict,
    macro_data: dict | None = None,
    options_data: dict | None = None,
    earnings_data: dict | None = None,
    anomaly_data: dict | None = None,
) -> tuple[list[dict], dict]:
    """Run all 5 personas in parallel. No rebalancing needed.
    Returns (results, weights)."""
    results = run_personas(context)
    weights = get_context_weights(
        technical_data, macro_data, options_data, earnings_data, anomaly_data
    )
    return results, weights
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/debate/orchestrator.py
git commit -m "feat: simplify orchestrator for role-based personas"
```

---

### Task 6: Update Debate Engine Context

**Files:**
- Modify: `backend/app/debate/engine.py`

- [ ] **Step 1: Update build_context to include macro section**

In `backend/app/debate/engine.py`, update the `build_context` function signature and add macro section. The full updated function:

```python
def build_context(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict, ml_result: dict = None, analyst_data: dict = None, insider_data: dict = None, macro_data: dict = None, options_data: dict = None, earnings_data: dict = None, anomaly_data: dict = None) -> str:
    """Build the context string for all personas."""
    headlines_text = "\n".join(f"- {h}" for h in news_headlines[:10]) if news_headlines else "No recent news available."

    ml_section = ""
    if ml_result:
        current = technical_data.get('close', 0)
        w2 = ml_result.get('week2', {})
        w4 = ml_result.get('week4', {})
        w2_chg = ((w2.get('price_target', current) - current) / current * 100) if current else 0
        w4_chg = ((w4.get('price_target', current) - current) / current * 100) if current else 0
        ml_section = f"""
ML MODEL PRICE FORECAST (XGBoost, trained on 5yr history):
- 2-week target: ${w2.get('price_target', 'N/A')} ({w2_chg:+.1f}%) direction={w2.get('direction', 'N/A')}
- 4-week target: ${w4.get('price_target', 'N/A')} ({w4_chg:+.1f}%) direction={w4.get('direction', 'N/A')}
Note: The ML forecast is based purely on historical price patterns. Your job is to reconcile or challenge it with your domain evidence.
"""

    analyst_section = ""
    if analyst_data and analyst_data.get("target_mean"):
        rec = analyst_data.get("recommendation", "").replace("_", " ").upper()
        analyst_section = f"""
ANALYST CONSENSUS ({analyst_data.get('num_analysts', '?')} analysts):
- Price Target: Mean ${analyst_data['target_mean']} | Low ${analyst_data.get('target_low')} | High ${analyst_data.get('target_high')}
- Upside to Mean Target: {analyst_data.get('upside_pct', 'N/A')}%
- Recommendation: {rec}
"""

    insider_section = ""
    if insider_data and insider_data.get("recent"):
        net = insider_data.get("net_shares_90d", 0)
        net_label = f"NET BUY +{net:,}" if net > 0 else f"NET SELL {net:,}"
        lines = [f"- {t['date']} {t['insider']} ({t['title']}): {t['type']} {t['shares']:,}shares" for t in insider_data["recent"][:3]]
        insider_section = f"""
INSIDER TRANSACTIONS (last 90 days):
- {net_label} shares net
{chr(10).join(lines)}
"""

    macro_section = ""
    if macro_data:
        vix = macro_data.get("vix")
        vix_chg = macro_data.get("vix_20d_change")
        t10y = macro_data.get("treasury_10y")
        t10y_chg = macro_data.get("treasury_10y_20d_change")
        dxy_val = macro_data.get("dxy")
        dxy_chg = macro_data.get("dxy_20d_change")
        macro_section = f"""
MACRO ENVIRONMENT:
- VIX: {vix} (20-day change: {vix_chg:+.1f}%){"— ELEVATED FEAR" if vix and vix > 25 else ""}
- 10Y Treasury: {t10y}% (20-day change: {t10y_chg:+.1f}%){"— RISING PRESSURE ON GROWTH" if t10y_chg and t10y_chg > 5 else ""}
- Dollar Index: {dxy_val} (20-day change: {dxy_chg:+.1f}%){"— STRONG DOLLAR" if dxy_val and dxy_val > 105 else ""}
"""

    options_section = ""
    if options_data and options_data.get("pc_ratio") is not None:
        options_section = f"""
OPTIONS FLOW:
- Put/Call Ratio: {options_data.get('pc_ratio')} {"(EXTREME BEARISH)" if options_data['pc_ratio'] > 1.5 else "(EXTREME BULLISH)" if options_data['pc_ratio'] < 0.3 else ""}
- IV Rank: {options_data.get('iv_rank')}% {"(HIGH — big move expected)" if options_data.get('iv_rank', 0) >= 80 else ""}
- Unusual Activity: {options_data.get('unusual_activity', 0):.1f}x on {options_data.get('unusual_side', 'N/A')} side
- Data Source: {options_data.get('data_source', 'N/A')} (expiry: {options_data.get('expiry_used', 'N/A')})
"""

    earnings_section = ""
    if earnings_data and earnings_data.get("next_date"):
        days = earnings_data.get("days_until", "?")
        warn = "⚠ EARNINGS IMMINENT" if isinstance(days, int) and days <= 7 else ""
        history_lines = []
        for h in earnings_data.get("history", [])[:4]:
            eps_beat = "BEAT" if h.get("eps_surprise_pct", 0) > 0 else "MISS"
            rev_beat = "BEAT" if h.get("revenue_surprise_pct", 0) > 0 else "MISS"
            history_lines.append(f"- {h.get('quarter')}: EPS {eps_beat} {h.get('eps_surprise_pct', 0):+.1f}% | Revenue {rev_beat} {h.get('revenue_surprise_pct', 0):+.1f}%")
        earnings_section = f"""
EARNINGS CALENDAR: {warn}
- Next earnings: {earnings_data['next_date']} ({days} days away)
- Recent history:
{chr(10).join(history_lines)}
"""

    anomaly_section = ""
    if anomaly_data and anomaly_data.get("score", 0) > 30:
        sig_lines = [f"- {s['name']}: +{s['score']}pts {s['direction']} ({s['detail']})" for s in anomaly_data.get("signals", []) if s.get("score", 0) > 0]
        anomaly_section = f"""
⚠ ANOMALY DETECTED: Score {anomaly_data['score']}/100 — {anomaly_data.get('direction', '?')} pressure ({anomaly_data.get('level', '?')})
{chr(10).join(sig_lines)}
"""

    return f"""
STOCK: {ticker}

TECHNICAL INDICATORS:
- Current Price: ${technical_data.get('close', 'N/A')}
- RSI(14): {technical_data.get('rsi', 'N/A'):.1f}
- MACD: {technical_data.get('macd', 'N/A'):.3f} | Signal: {technical_data.get('macd_signal', 'N/A'):.3f}
- MA5: ${technical_data.get('ma5', 'N/A'):.2f} | MA20: ${technical_data.get('ma20', 'N/A'):.2f} | MA60: ${technical_data.get('ma60', 'N/A'):.2f}
- Bollinger Upper: ${technical_data.get('bb_upper', 'N/A'):.2f} | Lower: ${technical_data.get('bb_lower', 'N/A'):.2f}
- Volume Ratio (vs 5d avg): {technical_data.get('volume_ratio', 'N/A'):.2f}x

ORDER FLOW (1 month):
- OBV Trend: {order_flow.get('obv_trend', 'N/A')}
- Recent 1-week buy dominance: {order_flow.get('buy_dominance_pct', 'N/A'):.1f}%
- Accumulation detected: {order_flow.get('is_accumulation', False)}

SHORT INTEREST:
- Short Float %: {short_data.get('short_float_pct', 'N/A')}
- Short Interest Change: {short_data.get('short_change', 'N/A')}

RECENT NEWS HEADLINES:
{headlines_text}
{analyst_section}{insider_section}{macro_section}{options_section}{earnings_section}{anomaly_section}{ml_section}"""
```

- [ ] **Step 2: Update run_debate to pass new data and use new orchestrator signature**

```python
def run_debate(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict, ml_result: dict = None, analyst_data: dict = None, insider_data: dict = None, macro_data: dict = None, options_data: dict = None, earnings_data: dict = None, anomaly_data: dict = None) -> dict:
    """Run the full debate engine. Returns verdict with summary and persona arguments."""
    context = build_context(ticker, technical_data, news_headlines, short_data, order_flow, ml_result, analyst_data, insider_data, macro_data, options_data, earnings_data, anomaly_data)
    results, weights = orchestrate(context, technical_data, macro_data, options_data, earnings_data, anomaly_data)
    verdict = judge(ticker, results, weights, headlines=news_headlines)

    return {
        "direction": verdict["direction"],
        "confidence": verdict["confidence"],
        "verdict": verdict.get("verdict", "관망"),
        "summary": verdict["summary"],
        "bull_points": verdict.get("bull_points", []),
        "bear_points": verdict.get("bear_points", []),
        "weekly_outlook": verdict.get("weekly_outlook", {}),
        "key_news": verdict.get("key_news", []),
        "debate_rounds": 1,
        "personas": results,
    }
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/debate/engine.py
git commit -m "feat: expand debate context with macro/options/earnings/anomaly sections"
```

---

### Task 7: Update Judge for Role-Based Opinions

**Files:**
- Modify: `backend/app/debate/judge.py`

- [ ] **Step 1: Update JUDGE_SYSTEM prompt and judge function**

Replace the `JUDGE_SYSTEM` prompt and update the `judge()` function signature to accept role-based results:

```python
JUDGE_SYSTEM = """You are an impartial financial judge. You receive opinions from 5 specialist analysts, each with their own directional view and confidence.

Synthesize their opinions considering their weights (higher weight = more relevant in current context).

Respond ONLY with this JSON (no extra text):
{
  "direction": "UP or DOWN",
  "confidence": <integer 50-95>,
  "verdict": "매수 or 매도 or 관망",
  "summary": "Korean 2-sentence summary.",
  "bull_points": ["상승 근거 1", "상승 근거 2"],
  "bear_points": ["하락 근거 1", "하락 근거 2"]
}

Confidence scoring guide:
- 90-95: 4-5 analysts agree strongly
- 80-89: clear majority with strong confidence
- 70-79: majority agrees but some dissent
- 65-69: slight edge, notable disagreement
- 50-64: split opinions, leads to "관망"
Calculate confidence from the weighted analyst opinions. Any value 50-95 is valid.

Rules:
- verdict "매수": UP and confidence>=65
- verdict "매도": DOWN and confidence>=65
- verdict "관망": otherwise
- Default to "관망" when uncertain
- summary and all points MUST be in Korean"""
```

Update the debate_text construction inside `judge()`:

```python
def judge(ticker: str, results: list[dict], weights: dict, headlines: list[str] | None = None) -> dict:
    client = OpenAI(api_key=settings.openai_api_key)

    debate_text = f"Stock: {ticker}\n\nAnalyst Opinions:\n"
    for r in results:
        w = weights.get(r["id"], 1.0)
        debate_text += f"\n[{r['role']} — weight {w:.1f}] Direction: {r.get('direction', '?')} | Confidence: {r.get('confidence', 50)}%\n{r.get('argument', '')}\n"

    debate_text += f"\nContext: {len(results)} analysts provided opinions. Weigh their confidence and argument quality."

    import json
    # ... rest of judge function stays the same (Step 1 verdict, Step 2 outlook, Step 3 key_news)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/debate/judge.py
git commit -m "feat: update judge prompt for role-based analyst opinions"
```

---

### Task 8: Wire Macro into Predict Router

**Files:**
- Modify: `backend/app/routers/predict.py`

- [ ] **Step 1: Add macro collector imports and calls**

In `backend/app/routers/predict.py`, add macro collector import at the top with other imports:

```python
from app.collectors.macro_collector import fetch_macro_history, fetch_macro_latest
from app.features.technical import add_macro_features
```

- [ ] **Step 2: Update get_prediction function**

In the `get_prediction()` function, after `df = build_technical_features(df)`, add:

```python
    # Add macro features for ML
    macro_history = fetch_macro_history(period="5y")
    df = add_macro_features(df, macro_history)
```

Add `fetch_macro_latest` to the parallel fundamental fetch:

```python
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f_analyst = ex.submit(fetch_analyst_data, ticker)
        f_insider = ex.submit(fetch_insider_data, ticker)
        f_institutional = ex.submit(fetch_institutional_data, ticker)
        f_macro = ex.submit(fetch_macro_latest)
        analyst_data = f_analyst.result()
        insider_data = f_insider.result()
        institutional_data = f_institutional.result()
        macro_data = f_macro.result()
```

Pass `macro_data` to `run_debate`:

```python
    debate_result = run_debate(ticker, technical_data, headlines, short_data, order_flow, ml_result, analyst_data, insider_data, macro_data=macro_data)
```

Add `macro_data` to the result dict:

```python
    result = {
        # ... existing fields ...
        "macro": macro_data,
        # ... rest ...
    }
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/predict.py
git commit -m "feat: wire macro collector into predict pipeline"
```

---

### Task 9: Frontend — Add Macro Types and UI

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/app/stock/[ticker]/page.tsx`

- [ ] **Step 1: Add MacroData interface in api.ts**

After the `Signals` interface in `frontend/lib/api.ts`, add:

```typescript
export interface MacroData {
  vix: number | null;
  vix_20d_change: number | null;
  treasury_10y: number | null;
  treasury_10y_20d_change: number | null;
  dxy: number | null;
  dxy_20d_change: number | null;
}
```

Add `macro?: MacroData;` to the `PredictionResult` interface.

Update the `DebateResult` interface — change `personas` type:

```typescript
  personas?: {
    id: string;
    role: string;
    direction: "UP" | "DOWN";
    confidence: number;
    argument: string;
  }[];
```

- [ ] **Step 2: Add MacroIndicators component to detail page**

In `frontend/app/stock/[ticker]/page.tsx`, add after the SignalsList component:

```tsx
function MacroIndicators({ macro }: { macro: MacroData }) {
  const rows: { label: string; value: string; change: number | null; status: "up" | "down" | "neutral" }[] = [];

  if (macro.vix != null) {
    const status = macro.vix > 25 ? "down" : macro.vix < 15 ? "up" : "neutral";
    rows.push({ label: "VIX", value: String(macro.vix), change: macro.vix_20d_change, status });
  }
  if (macro.treasury_10y != null) {
    const status = (macro.treasury_10y_20d_change ?? 0) > 3 ? "down" : (macro.treasury_10y_20d_change ?? 0) < -3 ? "up" : "neutral";
    rows.push({ label: "10Y 금리", value: `${macro.treasury_10y}%`, change: macro.treasury_10y_20d_change, status });
  }
  if (macro.dxy != null) {
    const status = (macro.dxy_20d_change ?? 0) > 2 ? "down" : (macro.dxy_20d_change ?? 0) < -2 ? "up" : "neutral";
    rows.push({ label: "달러(DXY)", value: String(macro.dxy), change: macro.dxy_20d_change, status });
  }

  return (
    <div>
      {rows.map((r, i) => {
        const changeColor = r.change && r.change > 0 ? "var(--up)" : r.change && r.change < 0 ? "var(--down)" : "var(--text-3)";
        return (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{r.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{r.value}</span>
              {r.change != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: changeColor }}>
                  {r.change > 0 ? "+" : ""}{r.change.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Add this section in the page layout after the signals section:

```tsx
          {data.macro && (
            <Section label="매크로 환경">
              <MacroIndicators macro={data.macro} />
            </Section>
          )}
```

- [ ] **Step 3: Update DebateAccordion for new persona structure**

In `frontend/components/DebateAccordion.tsx`, update to show role-based personas instead of bull/bear split. The component now receives all personas and displays them as a list with each persona's direction and confidence.

Update the Props and rendering:

```tsx
interface Props {
  personas: { id: string; role: string; direction: string; confidence: number; argument: string }[];
}

export default function DebateAccordion({ personas }: Props) {
  // ... render each persona with their role, direction, confidence, argument
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/app/stock/[ticker]/page.tsx frontend/components/DebateAccordion.tsx
git commit -m "feat: add macro indicators UI + update debate for role-based personas"
```

---

### Task 10: Clean Up and Deploy

**Files:**
- None new — operational steps

- [ ] **Step 1: Delete old model files**

```bash
docker exec mijoo-backend-1 rm -rf /app/data/models/*
```

- [ ] **Step 2: Clear predictions cache**

```bash
docker exec mijoo-backend-1 python -c "
from app.database import get_db
conn = get_db()
conn.execute('DELETE FROM predictions')
conn.commit()
conn.close()
print('Cleared')
"
```

- [ ] **Step 3: Rebuild and restart backend**

```bash
docker compose build backend && docker compose up -d backend
```

- [ ] **Step 4: Test one prediction end-to-end**

```bash
curl -s http://localhost:8000/predict/NVDA | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('macro:', d.get('macro'))
print('debate.confidence:', d.get('debate',{}).get('confidence'))
print('personas:', [(p['role'], p['direction'], p['confidence']) for p in d.get('debate',{}).get('personas',[])])
"
```

Expected: macro data present, 5 personas with varied directions/confidences.

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Phase 1 complete — macro indicators + role-based personas"
```
