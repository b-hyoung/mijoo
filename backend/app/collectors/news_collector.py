import json
import yfinance as yf
import concurrent.futures
from datetime import datetime, timedelta
from app.llm import chat_json
from app.database import get_db

# Keywords that signal price-impacting news
IMPACT_KEYWORDS = {
    "earnings": ["earnings", "revenue", "EPS", "beat", "miss", "guidance", "outlook", "forecast", "profit", "loss", "quarterly"],
    "analyst": ["upgrade", "downgrade", "price target", "rating", "overweight", "underweight", "outperform", "buy rating", "sell rating"],
    "corporate": ["CEO", "layoff", "restructure", "merger", "acquisition", "buyback", "dividend", "split", "hire", "resign"],
    "regulatory": ["lawsuit", "SEC", "FDA", "antitrust", "investigation", "fine", "settlement", "ban", "regulation", "compliance"],
    "product": ["launch", "patent", "partnership", "contract", "deal", "AI", "chip", "release", "product", "service"],
    "crisis": ["recall", "hack", "breach", "bankruptcy", "default", "crash", "fraud", "scandal", "warning"],
}

ALL_KEYWORDS = [kw for group in IMPACT_KEYWORDS.values() for kw in group]


def fetch_news(ticker: str, days: int = 30) -> list[dict]:
    """Fetch news from Yahoo Finance for ticker."""
    try:
        stock = yf.Ticker(ticker)
        news = stock.news or []
        articles = []
        cutoff = datetime.now() - timedelta(days=days)

        for item in news:
            try:
                # yfinance new format: item["content"] has all fields
                content = item.get("content", item)
                title = content.get("title", "")
                if not title:
                    continue

                # URL
                canon = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
                url = canon.get("url", "") if isinstance(canon, dict) else ""

                # Date
                pub_date_str = content.get("pubDate", "")
                date_str = ""
                if pub_date_str:
                    try:
                        pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                        if pub_date.replace(tzinfo=None) < cutoff:
                            continue
                        date_str = pub_date.strftime("%Y-%m-%d")
                    except Exception:
                        pass

                # Publisher
                provider = content.get("provider", {})
                publisher = provider.get("displayName", "") if isinstance(provider, dict) else ""

                # Summary/description
                summary = content.get("summary", title)

                articles.append({
                    "title": title,
                    "url": url,
                    "publishedAt": date_str,
                    "source": publisher,
                    "description": summary,
                })
            except Exception:
                continue

        print(f"[news] {ticker}: {len(articles)} articles from Yahoo Finance", flush=True)
        return articles
    except Exception as e:
        print(f"[news] {ticker}: FAILED {e}", flush=True)
        return []


def _keyword_filter(articles: list[dict]) -> list[dict]:
    """Step 1: Filter articles by impact keywords. Fast, no API calls."""
    filtered = []
    for article in articles:
        title = (article.get("title") or "").lower()
        desc = (article.get("description") or "").lower()
        text = title + " " + desc
        if any(kw.lower() in text for kw in ALL_KEYWORDS):
            filtered.append(article)
    return filtered


def _gpt_rate_batch(ticker: str, headlines: list[str]) -> list[str]:
    """Rate a batch of headlines as 상/중/하 impact."""
    if not headlines:
        return []
    prompt = f"Rate each headline's impact on {ticker} stock price.\n"
    prompt += "상 = direct price impact, 중 = indirect, 하 = irrelevant.\n\n"
    for i, h in enumerate(headlines):
        prompt += f"{i+1}. {h}\n"
    prompt += f'\nRespond ONLY with JSON: {{"ratings": ["상", "하", "중", ...]}}'

    try:
        data = chat_json(
            system="You rate financial news headlines by stock price impact. Respond with JSON only.",
            user=prompt,
            tier="fast",
            temperature=0,
            max_tokens=200,
        )
        ratings = data.get("ratings", [])
        while len(ratings) < len(headlines):
            ratings.append("중")
        return ratings[:len(headlines)]
    except Exception:
        return ["중"] * len(headlines)


def filter_important_news(ticker: str, articles: list[dict]) -> list[dict]:
    """B+C filter pipeline: keyword filter → GPT parallel rating → 상 only."""
    keyword_filtered = _keyword_filter(articles)

    if not keyword_filtered:
        return []

    headlines = [a.get("title", "") for a in keyword_filtered]

    batch_size = 10
    batches = [headlines[i:i+batch_size] for i in range(0, len(headlines), batch_size)]

    all_ratings = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(_gpt_rate_batch, ticker, batch) for batch in batches]
        for f in futures:
            all_ratings.extend(f.result())

    important = []
    for article, rating in zip(keyword_filtered, all_ratings):
        if rating == "상":
            important.append(article)

    return important[:10]


def save_news(ticker: str, articles: list[dict], sentiment_score: float, db_path=None):
    conn = get_db(db_path)
    for article in articles:
        conn.execute("""
            INSERT OR IGNORE INTO news (ticker, date, title, sentiment_score)
            VALUES (?, ?, ?, ?)
        """, (ticker, article.get("publishedAt", "")[:10], article.get("title", ""), sentiment_score))
    conn.commit()
    conn.close()
