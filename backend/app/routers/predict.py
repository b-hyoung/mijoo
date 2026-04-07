from fastapi import APIRouter, HTTPException
from app.collectors.price_collector import fetch_price_history
from app.collectors.news_collector import fetch_news
from app.features.technical import build_technical_features
from app.features.sentiment import score_articles
from app.ml.trainer import train_model
from app.ml.predictor import predict

router = APIRouter()

@router.get("/{ticker}")
def get_prediction(ticker: str):
    ticker = ticker.upper()
    df = fetch_price_history(ticker, period="5y")
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")
    df = build_technical_features(df)
    articles = fetch_news(ticker)
    headlines = [a["title"] for a in articles if a.get("title")]
    df["sentiment"] = score_articles(ticker, headlines)
    df = df.dropna()
    if len(df) < 60:
        raise HTTPException(status_code=422, detail="Not enough data to predict")
    model2, model4 = train_model(df)
    result = predict(model2, model4, df.iloc[[-1]])
    return {
        "ticker": ticker,
        "current_price": round(float(df["close"].iloc[-1]), 2),
        "sentiment_score": round(float(df["sentiment"].iloc[-1]), 3),
        "prediction": result
    }
