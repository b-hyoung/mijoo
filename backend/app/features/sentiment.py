from app.llm import chat

def score_articles(ticker: str, headlines: list[str]) -> float:
    if not headlines:
        return 0.0
    text = "\n".join(headlines[:15])
    prompt = f"Rate the overall sentiment for {ticker} stock based on these headlines:\n{text}\n\nRespond with ONLY a number between -1.0 (very bearish) and 1.0 (very bullish)."
    try:
        result = chat(
            system="You are a financial sentiment analyzer. Respond with only a decimal number between -1.0 and 1.0.",
            user=prompt,
            tier="fast",
            temperature=0,
            max_tokens=10,
        )
        score = float(result.strip())
        return max(-1.0, min(1.0, score))
    except Exception:
        return 0.0
