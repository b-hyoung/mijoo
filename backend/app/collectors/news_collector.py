import requests
from datetime import datetime, timedelta
from app.config import settings
from app.database import get_db

def fetch_news(ticker: str, days: int = 7) -> list[dict]:
    from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": ticker,
        "from": from_date,
        "sortBy": "publishedAt",
        "language": "en",
        "apiKey": settings.news_api_key,
        "pageSize": 20
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code != 200:
            return []
        return response.json().get("articles", [])
    except Exception:
        return []

def save_news(ticker: str, articles: list[dict], sentiment_score: float, db_path=None):
    conn = get_db(db_path)
    for article in articles:
        conn.execute("""
            INSERT OR IGNORE INTO news (ticker, date, title, sentiment_score)
            VALUES (?, ?, ?, ?)
        """, (ticker, article.get("publishedAt", "")[:10], article.get("title", ""), sentiment_score))
    conn.commit()
    conn.close()
