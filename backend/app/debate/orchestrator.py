from datetime import datetime, timezone
from app.debate.personas import run_personas, MACRO_PERSONA, CONFLUENCE_EXPLAINER, _call_persona

# 매크로 캐시 — 하루 1회만 GPT 호출
_macro_cache: dict = {"date": None, "result": None}


def get_macro_opinion(context: str) -> dict:
    """Get macro persona opinion. Cached per day."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _macro_cache["date"] == today and _macro_cache["result"]:
        print("[orchestrator] macro cache HIT", flush=True)
        return _macro_cache["result"]

    print("[orchestrator] macro cache MISS - calling GPT", flush=True)
    result = _call_persona(MACRO_PERSONA, context)
    _macro_cache["date"] = today
    _macro_cache["result"] = result
    return result


def get_context_weights(
    technical_data: dict,
    macro_data: dict | None = None,
    options_data: dict | None = None,
    earnings_data: dict | None = None,
    anomaly_data: dict | None = None,
) -> dict:
    """Compute persona weights based on market context."""
    weights = {
        "fundamental": 1.0,
        "technical": 1.0,
        "macro": 0.8,
        "options": 1.0,
    }

    rsi = technical_data.get("rsi", 50)
    if rsi < 30 or rsi > 70:
        weights["technical"] += 0.5

    if macro_data and macro_data.get("vix_20d_change") is not None:
        if abs(macro_data["vix_20d_change"]) > 20:
            weights["macro"] += 0.5

    if options_data and options_data.get("iv_rank") is not None:
        if options_data["iv_rank"] >= 80:
            weights["options"] += 0.5

    if earnings_data and earnings_data.get("days_until") is not None:
        if earnings_data["days_until"] <= 7:
            weights["fundamental"] += 0.5

    return weights


def orchestrate(
    context: str,
    technical_data: dict,
    macro_data: dict | None = None,
    options_data: dict | None = None,
    earnings_data: dict | None = None,
    anomaly_data: dict | None = None,
) -> tuple[list[dict], dict]:
    """Run 3 stock personas in parallel + 1 cached macro. No risk persona."""
    # 3 stock personas (parallel)
    stock_results = run_personas(context, persona_ids=["fundamental", "technical", "options"])

    # macro (cached per day)
    macro_result = get_macro_opinion(context)
    results = stock_results + [macro_result]

    weights = get_context_weights(
        technical_data, macro_data, options_data, earnings_data, anomaly_data
    )
    return results, weights


def get_confluence_explanation(
    ticker: str,
    confluence: dict,
    week_personas_summary: str,
) -> str:
    """Generate a 1-paragraph explanation of the confluence pattern.

    `week_personas_summary` is a compact text block describing each week's
    direction + main driver, assembled by the caller.
    """
    context = (
        f"티커: {ticker}\n"
        f"Confluence: {confluence['aligned_count']}/4 일치 "
        f"({confluence['tone']}, {confluence['badge']})\n"
        f"주차별 방향: {confluence['per_week']}\n\n"
        f"{week_personas_summary}"
    )
    result = _call_persona(CONFLUENCE_EXPLAINER, context)
    return (result.get("argument") or "").strip()
