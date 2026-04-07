from openai import OpenAI
from app.config import settings

JUDGE_SYSTEM = """You are an impartial financial judge synthesizing a stock debate.
You will receive bullish and bearish arguments from multiple analysts.
Your job is to weigh the evidence and deliver a verdict.

Respond in this exact JSON format:
{
  "direction": "UP" or "DOWN",
  "confidence": <integer 50-95>,
  "summary": "<1-2 sentences explaining the key reason for your verdict>"
}"""

def judge(ticker: str, results: list[dict], weights: dict) -> dict:
    client = OpenAI(api_key=settings.openai_api_key)

    debate_text = f"Stock: {ticker}\n\n"
    for r in results:
        weight = weights.get(r["domain"], 1.0)
        weight_label = "HIGH WEIGHT" if weight > 1.0 else "NORMAL WEIGHT"
        debate_text += f"[{r['stance']} - {r['domain'].upper()} - {weight_label}]\n{r['argument']}\n\n"

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": JUDGE_SYSTEM},
                {"role": "user", "content": debate_text}
            ],
            temperature=0,
            max_tokens=150,
            response_format={"type": "json_object"}
        )
        import json
        verdict = json.loads(response.choices[0].message.content)
        return {
            "direction": verdict.get("direction", "UP"),
            "confidence": int(verdict.get("confidence", 60)),
            "summary": verdict.get("summary", "")
        }
    except Exception:
        bull_count = sum(1 for r in results if r["stance"] == "BULLISH")
        bear_count = sum(1 for r in results if r["stance"] == "BEARISH")
        direction = "UP" if bull_count >= bear_count else "DOWN"
        return {
            "direction": direction,
            "confidence": 55,
            "summary": "Analysis based on aggregated signals."
        }
