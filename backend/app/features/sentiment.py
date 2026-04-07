from openai import OpenAI
from app.config import settings

def score_articles(ticker: str, headlines: list[str]) -> float:
    if not headlines:
        return 0.0
    client = OpenAI(api_key=settings.openai_api_key)
    joined = "\n".join(f"- {h}" for h in headlines[:10])
    prompt = f"""You are a financial analyst. Given these news headlines about {ticker},
rate the overall sentiment on a scale from -1.0 (very bearish) to 1.0 (very bullish).
Return ONLY a number between -1.0 and 1.0, nothing else.

Headlines:
{joined}"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )
        score = float(response.choices[0].message.content.strip())
        return max(-1.0, min(1.0, score))
    except Exception:
        return 0.0
