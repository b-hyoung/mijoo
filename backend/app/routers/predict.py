import json
import numpy as np
import concurrent.futures
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException

from app.collectors.price_collector import fetch_price_history
from app.collectors.news_collector import fetch_news, filter_important_news
from app.collectors.short_collector import fetch_short_interest
from app.collectors.fundamental_collector import fetch_analyst_data, fetch_insider_data, fetch_institutional_data
from app.collectors.macro_collector import fetch_macro_history, fetch_macro_latest
from app.collectors.earnings_collector import fetch_earnings_data
from app.collectors.options_collector import fetch_options_data
from app.anomaly import calculate_anomaly_score
from app.features.technical import build_technical_features, add_macro_features
from app.features.sentiment import score_articles
from app.ml.predictor import predict as ml_predict
from app.ml.predictor import apply_fundamental_adjustment
from app.ml.trainer import get_or_train_model
from app.debate.engine import run_debate
from app.debate.orchestrator import get_confluence_explanation
from app.collectors.event_calendar import upcoming_events
from app.features.structural import (
    weekly_trend, range_position, mid_momentum, macro_regime,
    analyst_consensus_score, institutional_flow_score,
    compute_structural_prediction, compute_confluence,
)


class _NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.bool_): return bool(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super().default(obj)


router = APIRouter()

MACRO_COLS = ["vix", "vix_20d_change", "treasury_10y", "treasury_10y_20d_change", "dxy", "dxy_20d_change"]


# ═══════════════════════════════════════════════════════════════════
#  Cache helpers
# ═══════════════════════════════════════════════════════════════════

def _get_week_start(dt: datetime) -> datetime:
    monday = dt - timedelta(days=dt.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _get_cached(ticker: str):
    from app.database import get_db
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM predictions WHERE ticker = ? ORDER BY predicted_at DESC LIMIT 1",
        (ticker,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    try:
        predicted_at = datetime.fromisoformat(row["predicted_at"])
        if predicted_at.tzinfo is None:
            predicted_at = predicted_at.replace(tzinfo=timezone.utc)
        if _get_week_start(predicted_at) != _get_week_start(datetime.now(timezone.utc)):
            return None
        if row["summary"] and row["summary"].startswith("{"):
            data = json.loads(row["summary"])
            data["predicted_at"] = predicted_at.isoformat()
            return data
    except Exception as e:
        print(f"[cache] FAIL {ticker}: {e}", flush=True)
    return None


def _save_cache(ticker: str, result: dict):
    from app.database import get_db
    conn = get_db()
    w2 = result["prediction"]["week2"]
    w4 = result["prediction"]["week4"]
    # Week2 is a point prediction (from ML). Week4 is structural (up_probability + range).
    w4_conf = w4.get("confidence", w4.get("up_probability", 50.0))
    w4_low = w4.get("price_low", w4.get("range_low", 0.0))
    w4_high = w4.get("price_high", w4.get("range_high", 0.0))
    conn.execute("""
        INSERT INTO predictions
        (ticker, predicted_at, week2_direction, week2_confidence, week2_price_low, week2_price_high,
         week4_direction, week4_confidence, week4_price_low, week4_price_high, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticker, datetime.now(timezone.utc).isoformat(),
        w2["direction"], w2["confidence"], w2["price_low"], w2["price_high"],
        w4["direction"], w4_conf, w4_low, w4_high,
        json.dumps(result, cls=_NumpyEncoder),
    ))
    conn.commit()
    conn.close()


def _update_cache(ticker: str, result: dict):
    from app.database import get_db
    conn = get_db()
    week_start = _get_week_start(datetime.now(timezone.utc))
    conn.execute(
        "UPDATE predictions SET summary = ? WHERE ticker = ? AND predicted_at >= ?",
        (json.dumps(result, cls=_NumpyEncoder), ticker, week_start.isoformat()),
    )
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════════════════════════════
#  Component 1: Price + Technical
# ═══════════════════════════════════════════════════════════════════

def comp_price_and_technical(ticker: str):
    """Fetch 5y price, build technical features + macro features. Returns (df_clean, latest, technical_data)."""
    df = fetch_price_history(ticker, period="5y")
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    df = build_technical_features(df)
    macro_history = fetch_macro_history(period="5y")
    df = add_macro_features(df, macro_history)

    for col in MACRO_COLS:
        if col in df.columns:
            df[col] = df[col].ffill().bfill().fillna(0)
    df_clean = df.dropna()
    if len(df_clean) < 60:
        raise HTTPException(status_code=422, detail="Not enough data to predict")

    latest = df_clean.iloc[-1]
    technical_data = {
        "close": float(latest["close"]),
        "rsi": float(latest["rsi"]),
        "macd": float(latest["macd"]),
        "macd_signal": float(latest["macd_signal"]),
        "ma5": float(latest["ma5"]),
        "ma20": float(latest["ma20"]),
        "ma60": float(latest["ma60"]),
        "bb_upper": float(latest["bb_upper"]),
        "bb_lower": float(latest["bb_lower"]),
        "volume_ratio": float(latest["volume_ratio"]),
    }
    return df_clean, latest, technical_data


# ═══════════════════════════════════════════════════════════════════
#  Component 2: News
# ═══════════════════════════════════════════════════════════════════

def comp_news(ticker: str):
    """Fetch + filter news. Returns (articles, headlines, important_headlines)."""
    articles = fetch_news(ticker, days=30)
    headlines = [a["title"] for a in articles if a.get("title")]
    important = filter_important_news(ticker, articles)
    important_headlines = [a["title"] for a in important if a.get("title")]
    return articles, headlines, important_headlines


# ═══════════════════════════════════════════════════════════════════
#  Component 3: Fundamentals (parallel)
# ═══════════════════════════════════════════════════════════════════

def comp_fundamentals(ticker: str):
    """Parallel fetch: analyst, insider, institutional, macro, earnings, options.
    Returns dict with all data."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        f_analyst = ex.submit(fetch_analyst_data, ticker)
        f_insider = ex.submit(fetch_insider_data, ticker)
        f_institutional = ex.submit(fetch_institutional_data, ticker)
        f_macro = ex.submit(fetch_macro_latest)
        f_earnings = ex.submit(fetch_earnings_data, ticker)
        analyst = f_analyst.result()
        insider = f_insider.result()
        institutional = f_institutional.result()
        macro = f_macro.result()
        earnings = f_earnings.result()

    options = fetch_options_data(ticker, earnings_date=earnings.get("next_date"))

    return {
        "analyst": analyst,
        "insider": insider,
        "institutional": institutional,
        "macro": macro,
        "earnings": earnings,
        "options": options,
    }


# ═══════════════════════════════════════════════════════════════════
#  Component 4: Order Flow + Signals + Anomaly
# ═══════════════════════════════════════════════════════════════════

def comp_order_flow(df) -> dict:
    recent = df.tail(20).copy()
    recent["buy_volume"] = (
        recent["volume"]
        * (recent["close"] >= recent["close"].shift(1).fillna(recent["close"])).astype(float)
    )
    recent["sell_volume"] = recent["volume"] - recent["buy_volume"]
    total_buy = recent["buy_volume"].sum()
    total_sell = recent["sell_volume"].sum()
    total = total_buy + total_sell
    buy_dom = (total_buy / total * 100) if total > 0 else 50.0

    obv_start = float(recent["close"].iloc[0])
    obv_end = float(recent["close"].iloc[-1])
    obv_trend = "UP" if obv_end > obv_start else "DOWN"
    price_chg = abs((obv_end - obv_start) / obv_start * 100) if obv_start > 0 else 0
    vol_recent = recent["volume"].tail(5).mean()
    vol_early = recent["volume"].head(5).mean()
    vol_increasing = vol_recent > vol_early * 1.1

    return {
        "buy_dominance_pct": round(float(buy_dom), 1),
        "obv_trend": obv_trend,
        "is_accumulation": bool(buy_dom >= 55 and price_chg < 8 and (vol_increasing or obv_trend == "UP")),
    }


def comp_signals(latest) -> dict:
    bb_upper = float(latest["bb_upper"])
    bb_lower = float(latest["bb_lower"])
    close = float(latest["close"])
    bb_range = bb_upper - bb_lower
    return {
        "rsi": round(float(latest["rsi"]), 1),
        "macd_cross": "BULLISH" if float(latest["macd"]) > float(latest["macd_signal"]) else "BEARISH",
        "ma_trend": "BULLISH" if float(latest["ma5"]) > float(latest["ma20"]) else "BEARISH",
        "bb_position": round((close - bb_lower) / bb_range * 100) if bb_range > 0 else 50,
        "volume_ratio": round(float(latest["volume_ratio"]), 2),
    }


def comp_anomaly(df_clean, options, insider, institutional, order_flow) -> dict:
    return calculate_anomaly_score(
        price_df=df_clean,
        options_data=options,
        insider_data=insider,
        institutional_data=institutional,
        order_flow=order_flow,
    )


# ═══════════════════════════════════════════════════════════════════
#  Component 5: ML Prediction (XGBoost)
# ═══════════════════════════════════════════════════════════════════

def comp_ml(ticker: str, df_clean, latest, headlines, analyst, insider, institutional):
    """Train/load model + predict. Returns ml_result dict (week1/2 only)."""
    sentiment = score_articles(ticker, headlines)
    df = df_clean.copy()
    df["sentiment"] = sentiment

    models = get_or_train_model(ticker, df)
    result = ml_predict(models, df.iloc[[-1]])
    result = apply_fundamental_adjustment(
        result, float(latest["close"]), analyst, insider, institutional
    )
    return result, sentiment


def comp_structural_signals(df_clean, macro_data, analyst_data, institutional_data, insider_data) -> dict:
    """Compute 6 structural signals for week3/4 confirmation layer."""
    return {
        "weekly_trend": weekly_trend(df_clean),
        "range_position": range_position(df_clean),
        "mid_momentum": mid_momentum(df_clean),
        "macro_regime": macro_regime(macro_data),
        "analyst_consensus": analyst_consensus_score(analyst_data),
        "institutional_flow": institutional_flow_score(institutional_data, insider_data),
    }


# ═══════════════════════════════════════════════════════════════════
#  Component 6: AI Debate
# ═══════════════════════════════════════════════════════════════════

def comp_debate(ticker, technical_data, headlines, short_data, order_flow, ml_result,
                analyst, insider, macro, options, earnings, anomaly):
    """Run 5-persona debate + judge. Returns debate_result dict."""
    return run_debate(
        ticker, technical_data, headlines, short_data, order_flow,
        ml_result, analyst, insider,
        macro_data=macro, options_data=options, earnings_data=earnings, anomaly_data=anomaly,
    )


# ═══════════════════════════════════════════════════════════════════
#  Component 7: ML ↔ Debate Alignment
# ═══════════════════════════════════════════════════════════════════

def comp_align_ml_debate(ml_result: dict, debate_result: dict, current_price: float) -> dict:
    """If debate has strong opinion, flip ML week1/2 predictions to match.
    Week3/4 are structural-only and retain their own direction."""
    direction = debate_result.get("direction")
    conf = debate_result.get("confidence", 50)
    if not direction or conf < 65:
        return ml_result

    for wk in ["week1", "week2"]:
        pred = ml_result.get(wk)
        if not pred or "price_target" not in pred:
            continue
        ml_up = pred["price_target"] > current_price
        debate_up = direction == "UP"
        if ml_up != debate_up:
            change = abs(pred["price_target"] - current_price) / current_price
            flip = change * 0.5
            new_target = current_price * (1 + flip) if debate_up else current_price * (1 - flip)
            spread = (pred["price_high"] - pred["price_low"]) / 2
            pred["price_target"] = round(new_target, 2)
            pred["price_low"] = round(new_target - spread, 2)
            pred["price_high"] = round(new_target + spread, 2)
            pred["direction"] = direction
            pred["confidence"] = round(min(95, 50 + flip * 100 * 3), 1)
    return ml_result


# ═══════════════════════════════════════════════════════════════════
#  Assemble result
# ═══════════════════════════════════════════════════════════════════

def assemble_result(ticker, latest, sentiment, short_data, order_flow, articles,
                    signals, fund, anomaly, ml_result, debate_result) -> dict:
    return {
        "ticker": ticker,
        "current_price": round(float(latest["close"]), 2),
        "sentiment_score": round(sentiment, 3),
        "short_float_pct": short_data.get("short_float_pct", 0.0),
        "short_change": short_data.get("short_change"),
        "order_flow": order_flow,
        "news_headlines": [{"title": a.get("title", ""), "url": a.get("url", "")} for a in articles[:20] if a.get("title")],
        "signals": signals,
        "analyst": fund["analyst"],
        "insider": fund["insider"],
        "institutional": fund["institutional"],
        "macro": fund["macro"],
        "options": fund["options"],
        "earnings": fund["earnings"],
        "anomaly": anomaly,
        "prediction": ml_result,
        "debate": debate_result,
    }


# ═══════════════════════════════════════════════════════════════════
#  API Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.post("/refresh-outlook/{ticker}")
def refresh_outlook(ticker: str):
    """Re-generate weekly_outlook only (gpt-4o-mini). ~$0.003 per call."""
    ticker = ticker.upper()
    cached = _get_cached(ticker)
    if not cached:
        raise HTTPException(status_code=404, detail=f"No cached prediction for {ticker}")

    debate = cached.get("debate", {})
    from app.debate.judge import judge_outlook_only
    outlook = judge_outlook_only(
        ticker=ticker,
        direction=debate.get("direction", "UP"),
        verdict=debate.get("verdict", ""),
        confidence=debate.get("confidence", 60),
        summary=debate.get("summary", ""),
        bull_points=debate.get("bull_points", []),
        bear_points=debate.get("bear_points", []),
        personas=debate.get("personas", []),
    )
    debate["weekly_outlook"] = outlook
    cached["debate"] = debate
    _update_cache(ticker, cached)
    return {"status": "refreshed", "ticker": ticker, "weekly_outlook": outlook}


@router.post("/refresh-fundamentals/{ticker}")
def refresh_fundamentals(ticker: str):
    """Re-fetch analyst/insider/institutional/macro/earnings/options only. No GPT cost."""
    ticker = ticker.upper()
    cached = _get_cached(ticker)
    if not cached:
        raise HTTPException(status_code=404, detail=f"No cached prediction for {ticker}")

    fund = comp_fundamentals(ticker)
    cached.update({
        "analyst": fund["analyst"],
        "insider": fund["insider"],
        "institutional": fund["institutional"],
        "macro": fund["macro"],
        "options": fund["options"],
        "earnings": fund["earnings"],
    })
    _update_cache(ticker, cached)
    return {"status": "refreshed", "ticker": ticker, "updated": list(fund.keys())}


@router.post("/refresh-news/{ticker}")
def refresh_news(ticker: str):
    """Re-fetch news headlines. Minimal GPT cost (filter only)."""
    ticker = ticker.upper()
    cached = _get_cached(ticker)
    if not cached:
        raise HTTPException(status_code=404, detail=f"No cached prediction for {ticker}")

    articles, _, _ = comp_news(ticker)
    cached["news_headlines"] = [
        {"title": a.get("title", ""), "url": a.get("url", "")}
        for a in articles[:20] if a.get("title")
    ]
    _update_cache(ticker, cached)
    return {"status": "refreshed", "ticker": ticker, "count": len(cached["news_headlines"])}


@router.post("/refresh-debate/{ticker}")
def refresh_debate(ticker: str):
    """Re-run full AI debate (5 personas + judge). ~$0.15 per call."""
    ticker = ticker.upper()
    cached = _get_cached(ticker)
    if not cached:
        raise HTTPException(status_code=404, detail=f"No cached prediction for {ticker}")

    # Need technical + fundamental data from cache
    df_clean, latest, technical_data = comp_price_and_technical(ticker)
    short_data = fetch_short_interest(ticker)
    technical_data["short_float_pct"] = short_data.get("short_float_pct", 0.0)
    order_flow = comp_order_flow(df_clean)

    articles, headlines, important_headlines = comp_news(ticker)
    debate_headlines = important_headlines if important_headlines else headlines[:10]

    debate_result = comp_debate(
        ticker, technical_data, debate_headlines, short_data, order_flow,
        cached.get("prediction", {}),
        cached.get("analyst", {}), cached.get("insider", {}),
        cached.get("macro", {}), cached.get("options", {}),
        cached.get("earnings", {}), cached.get("anomaly", {}),
    )

    # Re-align ML
    ml_result = comp_align_ml_debate(
        cached.get("prediction", {}), debate_result, cached.get("current_price", 0)
    )

    cached["debate"] = debate_result
    cached["prediction"] = ml_result
    _update_cache(ticker, cached)
    return {
        "status": "refreshed",
        "ticker": ticker,
        "verdict": debate_result.get("verdict"),
        "confidence": debate_result.get("confidence"),
    }


@router.get("/{ticker}")
def get_prediction(ticker: str):
    """Full prediction — uses cache if available, otherwise runs everything."""
    ticker = ticker.upper()

    cached = _get_cached(ticker)
    if cached:
        return cached

    # 1. Price + Technical
    df_clean, latest, technical_data = comp_price_and_technical(ticker)

    # 2. News
    articles, headlines, important_headlines = comp_news(ticker)

    # 3. Short interest
    short_data = fetch_short_interest(ticker)
    technical_data["short_float_pct"] = short_data.get("short_float_pct", 0.0)

    # 4. Order flow
    order_flow = comp_order_flow(df_clean)

    # 5. Fundamentals (parallel)
    fund = comp_fundamentals(ticker)

    # 6. Anomaly
    anomaly = comp_anomaly(df_clean, fund["options"], fund["insider"], fund["institutional"], order_flow)

    # 7. ML prediction (week1/2 only)
    ml_result, sentiment = comp_ml(ticker, df_clean, latest, headlines,
                                   fund["analyst"], fund["insider"], fund["institutional"])

    # 7b. Structural week3/4 (confirmation layer, independent signals)
    structural_signals = comp_structural_signals(
        df_clean, fund["macro"], fund["analyst"], fund["institutional"], fund["insider"]
    )
    current_price_val = float(latest["close"])
    ml_result["week3"] = compute_structural_prediction(structural_signals, current_price_val, week=3)
    ml_result["week4"] = compute_structural_prediction(structural_signals, current_price_val, week=4)

    # 8. AI Debate
    debate_headlines = important_headlines if important_headlines else headlines[:10]
    debate_result = comp_debate(
        ticker, technical_data, debate_headlines, short_data, order_flow, ml_result,
        fund["analyst"], fund["insider"], fund["macro"],
        fund["options"], fund["earnings"], anomaly,
    )

    # 9. Align ML ↔ Debate
    ml_result = comp_align_ml_debate(ml_result, debate_result, float(latest["close"]))

    # 10. Signals
    signals = comp_signals(latest)

    # 10b. Confluence (4-week directional alignment)
    confluence = compute_confluence(
        ml_result["week1"], ml_result["week2"],
        ml_result["week3"], ml_result["week4"],
    )

    # 10c. Confluence explanation (1 GPT call, cached per week via SQLite)
    personas = debate_result.get("personas", []) if debate_result else []
    driver_lines = []
    for p in personas:
        arg = (p.get("argument") or "").splitlines()[0][:120]
        driver_lines.append(f"- {p.get('role', p.get('id'))}: {p.get('direction')} — {arg}")
    personas_summary = "\n".join(driver_lines) if driver_lines else "(페르소나 미수집)"
    confluence["explanation"] = get_confluence_explanation(ticker, confluence, personas_summary)

    # 11. Assemble + Cache
    result = assemble_result(
        ticker, latest, sentiment, short_data, order_flow, articles,
        signals, fund, anomaly, ml_result, debate_result,
    )
    result["confluence"] = confluence

    # Expose upcoming events at top level (for UI badges)
    earnings_obj = fund.get("earnings") or {}
    events_out = list(upcoming_events(days_ahead=14))
    if earnings_obj.get("days_until") is not None and 0 <= earnings_obj["days_until"] <= 14:
        events_out.append({
            "type": "earnings",
            "date": earnings_obj.get("next_date"),
            "days_until": earnings_obj["days_until"],
            "ticker": ticker,
        })
    events_out.sort(key=lambda e: e.get("days_until", 999))
    result["upcoming_events"] = events_out

    has_analyst = fund["analyst"].get("target_mean") is not None
    has_debate = debate_result.get("confidence", 0) > 0 and debate_result.get("summary", "")
    if has_analyst or has_debate:
        _save_cache(ticker, result)
    else:
        print(f"[predict] {ticker}: skip cache - incomplete", flush=True)

    result["predicted_at"] = datetime.now(timezone.utc).isoformat()
    return result
