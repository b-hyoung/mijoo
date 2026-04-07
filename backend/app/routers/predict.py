from fastapi import APIRouter, HTTPException
from app.collectors.price_collector import fetch_price_history
from app.collectors.news_collector import fetch_news
from app.collectors.short_collector import fetch_short_interest
from app.features.technical import build_technical_features
from app.features.sentiment import score_articles
from app.ml.trainer import train_model
from app.ml.predictor import predict
from app.debate.engine import run_debate
import ta

router = APIRouter()

def _get_order_flow(df) -> dict:
    """Compute 1-month order flow summary from price dataframe."""
    recent = df.tail(20).copy()
    recent["buy_volume"] = (
        recent["volume"] *
        (recent["close"] >= recent["close"].shift(1).fillna(recent["close"])).astype(float)
    )
    recent["sell_volume"] = recent["volume"] - recent["buy_volume"]
    total_buy = recent["buy_volume"].sum()
    total_sell = recent["sell_volume"].sum()
    total = total_buy + total_sell
    buy_dominance = (total_buy / total * 100) if total > 0 else 50.0
    obv_start = float(recent["close"].iloc[0])
    obv_end = float(recent["close"].iloc[-1])
    obv_trend = "UP" if obv_end > obv_start else "DOWN"
    is_accumulation = buy_dominance > 60
    return {
        "buy_dominance_pct": round(buy_dominance, 1),
        "obv_trend": obv_trend,
        "is_accumulation": is_accumulation
    }

@router.get("/{ticker}")
def get_prediction(ticker: str):
    ticker = ticker.upper()

    # Fetch price data
    df = fetch_price_history(ticker, period="5y")
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    # Build technical features
    df = build_technical_features(df)
    df_clean = df.dropna()
    if len(df_clean) < 60:
        raise HTTPException(status_code=422, detail="Not enough data to predict")

    # Get latest technical values
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

    # Fetch news
    articles = fetch_news(ticker)
    headlines = [a["title"] for a in articles if a.get("title")]

    # Fetch short interest
    short_data = fetch_short_interest(ticker)
    technical_data["short_float_pct"] = short_data.get("short_float_pct", 0.0)

    # Compute order flow
    order_flow = _get_order_flow(df_clean)

    # Sentiment score for ML feature
    sentiment = score_articles(ticker, headlines)
    df_clean = df_clean.copy()
    df_clean["sentiment"] = sentiment

    # XGBoost price prediction
    model2, model4 = train_model(df_clean)
    ml_result = predict(model2, model4, df_clean.iloc[[-1]])

    # AI Debate Engine
    debate_result = run_debate(ticker, technical_data, headlines, short_data, order_flow)

    return {
        "ticker": ticker,
        "current_price": round(float(latest["close"]), 2),
        "sentiment_score": round(sentiment, 3),
        "short_float_pct": short_data.get("short_float_pct", 0.0),
        "order_flow": order_flow,
        "prediction": ml_result,
        "debate": debate_result
    }
