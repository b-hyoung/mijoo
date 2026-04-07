from openai import OpenAI
from app.config import settings
from app.debate.personas import run_personas

def check_balance(results: list[dict]) -> dict:
    """Check if debate is balanced. Returns analysis."""
    bull_count = sum(1 for r in results if r["stance"] == "BULLISH")
    bear_count = sum(1 for r in results if r["stance"] == "BEARISH")
    total = len(results)
    bull_ratio = bull_count / total if total > 0 else 0.5
    return {
        "bull_count": bull_count,
        "bear_count": bear_count,
        "bull_ratio": bull_ratio,
        "is_balanced": 0.3 <= bull_ratio <= 0.7
    }

def get_context_weights(technical_data: dict) -> dict:
    """Adjust domain weights based on market context."""
    weights = {"news": 1.0, "technical": 1.0, "short_interest": 1.0, "order_flow": 1.0}
    rsi = technical_data.get("rsi", 50)
    volume_ratio = technical_data.get("volume_ratio", 1.0)
    short_float = technical_data.get("short_float_pct", 5.0)
    if rsi < 30 or rsi > 70:
        weights["technical"] = 1.5
    if volume_ratio > 2.0:
        weights["order_flow"] = 1.5
    if short_float > 15:
        weights["short_interest"] = 1.5
    return weights

def orchestrate(context: str, technical_data: dict, max_rounds: int = 2) -> tuple[list[dict], dict]:
    """Run debate with balance checking. Returns (all_results, weights)."""
    all_results = run_personas(context)
    balance = check_balance(all_results)

    for round_num in range(max_rounds - 1):
        if balance["is_balanced"]:
            break
        if balance["bull_ratio"] < 0.3:
            minority_ids = [p for p in ["news_bull", "technical_bull", "short_bull", "orderflow_bull"]]
            extra = run_personas(context, minority_ids)
        else:
            minority_ids = [p for p in ["news_bear", "technical_bear", "short_bear", "orderflow_bear"]]
            extra = run_personas(context, minority_ids)
        all_results.extend(extra)
        balance = check_balance(all_results)

    weights = get_context_weights(technical_data)
    return all_results, weights
