from openai import OpenAI
from app.config import settings
import concurrent.futures

PERSONAS = [
    {
        "id": "news_bull",
        "domain": "news",
        "stance": "BULLISH",
        "system": "You are a bullish financial news analyst. Given stock data, identify positive catalysts, strong earnings signals, favorable macro trends, and any news that supports a price increase. Be specific and data-driven."
    },
    {
        "id": "news_bear",
        "domain": "news",
        "stance": "BEARISH",
        "system": "You are a bearish financial news analyst. Given stock data, identify negative catalysts, earnings risks, regulatory threats, competition concerns, and any news that supports a price decline. Be specific and data-driven."
    },
    {
        "id": "technical_bull",
        "domain": "technical",
        "stance": "BULLISH",
        "system": "You are a bullish technical analyst. Analyze the provided technical indicators (RSI, MACD, moving averages, Bollinger Bands) and identify bullish signals: golden crosses, oversold RSI recovery, MACD bullish crossover, price above key moving averages."
    },
    {
        "id": "technical_bear",
        "domain": "technical",
        "stance": "BEARISH",
        "system": "You are a bearish technical analyst. Analyze the provided technical indicators and identify bearish signals: death crosses, overbought RSI, MACD bearish crossover, price below key moving averages, resistance levels."
    },
    {
        "id": "short_bull",
        "domain": "short_interest",
        "stance": "BULLISH",
        "system": "You are a bullish short interest analyst. Analyze short interest data and identify potential short squeeze setups, declining short interest as bullish signal, and situations where high short interest with positive catalysts could drive rapid price increases."
    },
    {
        "id": "short_bear",
        "domain": "short_interest",
        "stance": "BEARISH",
        "system": "You are a bearish short interest analyst. Analyze short interest data and identify increasing short positions as bearish signal, high short float percentage as indicator of institutional bearish sentiment, and risk of continued selling pressure."
    },
    {
        "id": "orderflow_bull",
        "domain": "order_flow",
        "stance": "BULLISH",
        "system": "You are a bullish order flow analyst. Analyze volume patterns and OBV trends to identify quiet institutional accumulation, buy volume dominance, rising OBV as bullish divergence, and stealth buying patterns that precede price increases."
    },
    {
        "id": "orderflow_bear",
        "domain": "order_flow",
        "stance": "BEARISH",
        "system": "You are a bearish order flow analyst. Analyze volume patterns and OBV trends to identify distribution patterns, sell volume dominance, declining OBV as bearish divergence, and institutional selling that precedes price declines."
    },
]

def _call_persona(persona: dict, context: str, client: OpenAI) -> dict:
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": persona["system"]},
                {"role": "user", "content": context}
            ],
            temperature=0.3,
            max_tokens=200
        )
        argument = response.choices[0].message.content.strip()
        return {
            "id": persona["id"],
            "domain": persona["domain"],
            "stance": persona["stance"],
            "argument": argument
        }
    except Exception as e:
        return {
            "id": persona["id"],
            "domain": persona["domain"],
            "stance": persona["stance"],
            "argument": f"Analysis unavailable: {str(e)}"
        }

def run_personas(context: str, persona_ids: list[str] = None) -> list[dict]:
    """Run specified personas (or all) in parallel."""
    client = OpenAI(api_key=settings.openai_api_key)
    targets = [p for p in PERSONAS if persona_ids is None or p["id"] in persona_ids]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_call_persona, p, context, client) for p in targets]
        return [f.result() for f in concurrent.futures.as_completed(futures)]
