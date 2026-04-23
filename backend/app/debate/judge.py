from app.llm import chat_json

JUDGE_SYSTEM = """You are an impartial financial judge. You receive opinions from 5 specialist analysts, each with their own directional view and confidence.

Synthesize their opinions considering their weights (higher weight = more relevant in current context).

Respond ONLY with this JSON (no extra text):
{
  "direction": "UP or DOWN",
  "confidence": <integer 50-95>,
  "verdict": "매수 or 매도 or 관망",
  "summary": "Korean 2-sentence summary.",
  "stock_bull": ["종목 자체 상승 근거 (기술적/펀더멘탈/옵션/내부자 등)"],
  "stock_bear": ["종목 자체 하락 근거"],
  "market_bull": ["시장/매크로 호재 (VIX/금리/달러/경기 등)"],
  "market_bear": ["시장/매크로 악재"]
}

IMPORTANT: Separate stock-specific factors from market/macro factors.
- stock_bull/stock_bear: factors about THIS stock only (RSI, MACD, earnings, analyst targets, options flow, insider trades, revenue, etc.)
- market_bull/market_bear: factors about the overall market (VIX, interest rates, treasury yields, dollar index, Fed policy, recession risk, etc.)
- If there are no factors for a category, return an empty array [].

Confidence MUST be calculated from analyst agreement. Use this formula:

Step 1: Count how many analysts agree on the majority direction.
Step 2: Calculate their average confidence.
Step 3: Apply agreement multiplier:
  - 5/5 agree: final = avg_confidence × 1.1 (cap 95)
  - 4/5 agree: final = avg_confidence × 1.0
  - 3/5 agree: final = avg_confidence × 0.85
  - 2/5 or less: final = 50-55 (관망)

Example: 4 analysts say DOWN at avg 80% confidence → final = 80 × 1.0 = 80%
Example: 3 analysts say UP at avg 70% → final = 70 × 0.85 = 60% → 관망

DO NOT ignore this calculation. Your confidence MUST reflect the analyst consensus mathematically.

Rules:
- verdict "매수": UP and confidence>=65
- verdict "매도": DOWN and confidence>=65
- verdict "관망": otherwise
- Default to "관망" when uncertain
- summary and all points MUST be in Korean"""

OUTLOOK_SYSTEM_DIRECTIONAL = """You are a stock analyst writing week-by-week price drivers. Each week must reference a SPECIFIC data point.

RULES:
- Each sentence: 25-45 Korean characters
- Must mention at least one concrete number or named catalyst
- Each week must give a DIFFERENT reason (not the same theme repeated)
- Week 1: immediate catalyst (technical trigger this week)
- Week 2: near-term driver (news or momentum continuing)
- Week 3: mid-term factor (fundamental or macro)
- Week 4: longer-term outlook (trend confirmation or risk)
- Do NOT use vague phrases like "긍정적 전망", "우려 지속", "주의 필요"
- NEVER reference "ML 모델", "머신러닝", "XGBoost", or any model prediction as a reason. Only use real market data (RSI, MACD, VIX, earnings, news, analyst targets, insider trades, options flow, etc.)
- CRITICAL: All 4 weeks MUST support the given direction (UP→상승 이유, DOWN→하락 이유). NEVER cite counter-directional evidence.

GOOD examples:
- "RSI 42로 과매도 구간, 기술적 반등 예상."
- "공매도 비율 18.3%로 숏스퀴즈 압력 증가."

Respond ONLY with JSON: {"week1": "...", "week2": "...", "week3": "...", "week4": "..."}"""

OUTLOOK_SYSTEM_NEUTRAL = """You are a stock analyst explaining why this stock's direction is UNCERTAIN. Analysts are split — present BOTH sides each week using specific data.

RULES:
- Each sentence: 30-60 Korean characters
- Each week: cite one bullish AND one bearish factor with specific numbers
- Format: "[상승요인] vs [하락요인]" 형태
- Week 1: technical signals (RSI, MACD etc.)
- Week 2: sentiment/news factors
- Week 3: fundamental/macro factors
- Week 4: overall risk summary
- Do NOT pick a side. Present balanced view.
- NEVER reference "ML 모델", "머신러닝", "XGBoost", or any model prediction as a reason. Only use real market data.

GOOD examples:
- "RSI 38.8 과매도 접근이나 MACD -10.1로 하락세 지속 중."
- "목표가 $587 상승여력 있으나 VIX 25.8 불안정."
- "내부자 순매수 +5만주이나 공매도 2.3% 증가."

Respond ONLY with JSON: {"week1": "...", "week2": "...", "week3": "...", "week4": "..."}"""


NEWS_SUMMARY_SYSTEM = """You are a financial news analyst. From the given headlines, pick the 2-3 most impactful for the stock's price movement. Summarize each in Korean (1-2 sentences, 40-80 chars).

Respond ONLY with this JSON:
{
  "key_news": [
    {"headline": "original English headline", "summary": "한국어 요약 및 주가 영향 분석"},
    ...
  ]
}

Rules:
- Pick ONLY 2-3 headlines that most affect the stock price
- summary must explain WHY this news matters for the stock (not just translate)
- Write summary in Korean
- If no impactful news, return empty array"""


def judge(ticker: str, results: list[dict], weights: dict, headlines: list[str] | None = None) -> dict:
    debate_text = f"Stock: {ticker}\n\nAnalyst Opinions:\n"
    for r in results:
        w = weights.get(r["id"], 1.0)
        debate_text += f"\n[{r.get('role', r['id'])} — weight {w:.1f}] Direction: {r.get('direction', '?')} | Confidence: {r.get('confidence', 50)}%\n{r.get('argument', '')}\n"
    debate_text += f"\nContext: {len(results)} analysts provided opinions. Weigh their confidence and argument quality."

    import json

    # Step 1: 메인 판정
    try:
        raw = chat_json(
            system=JUDGE_SYSTEM,
            user=debate_text,
            tier="strong",
            temperature=0.3,
            max_tokens=500,
        )
        verdict = raw if raw else {}

        # Override confidence with data-driven calculation
        # GPT tends to under-report confidence. Calculate from actual persona agreement.
        up_personas = [r for r in results if r.get("direction") == "UP"]
        down_personas = [r for r in results if r.get("direction") == "DOWN"]
        majority = up_personas if len(up_personas) >= len(down_personas) else down_personas
        majority_count = len(majority)
        total_count = len(results) if results else 1

        if majority_count > 0:
            # Weighted average confidence of majority
            total_w = 0
            weighted_conf = 0
            for r in majority:
                w = weights.get(r["id"], 1.0)
                weighted_conf += r.get("confidence", 50) * w
                total_w += w
            avg_conf = weighted_conf / total_w if total_w > 0 else 50

            # Agreement multiplier
            ratio = majority_count / total_count
            if ratio >= 1.0:      multiplier = 1.1   # 5/5
            elif ratio >= 0.8:    multiplier = 1.0   # 4/5
            elif ratio >= 0.6:    multiplier = 0.85  # 3/5
            else:                 multiplier = 0.7   # 2/5 or less

            calculated_conf = int(min(100, max(30, avg_conf * multiplier)))
            verdict["confidence"] = calculated_conf

            # Fix verdict based on calculated confidence
            direction = verdict.get("direction", "UP")
            if calculated_conf >= 65:
                verdict["verdict"] = "매수" if direction == "UP" else "매도"
            else:
                verdict["verdict"] = "관망"

    except Exception as e:
        print(f"[judge] Step 1 FAILED: {e}", flush=True)
        up_count = sum(1 for r in results if r.get("direction") == "UP")
        down_count = sum(1 for r in results if r.get("direction") == "DOWN")
        direction = "UP" if up_count >= down_count else "DOWN"
        return {
            "direction": direction,
            "confidence": 55,
            "verdict": "관망",
            "summary": "신호가 혼재되어 명확한 방향을 판단하기 어렵습니다.",
            "bull_points": [],
            "bear_points": [],
            "weekly_outlook": {},
        }

    # Step 2: 주차별 근거
    print(f"[judge] Step 2 starting for {ticker}, verdict={verdict.get('verdict','?')}", flush=True)
    weekly_outlook = {}
    try:
        direction = verdict.get('direction', 'UP')
        verdict_label = verdict.get('verdict', '관망')
        is_neutral = verdict_label == "관망"

        # Collect analyst arguments
        all_data = [f"[{r.get('role', r['id'])} - {r.get('direction', '?')}]: {r.get('argument', '')[:200]}" for r in results[:6]]

        if is_neutral:
            # 관망: 양쪽 근거를 균형있게 제시
            bull_data = [r.get('argument', '')[:200] for r in results if r.get('direction') == 'UP']
            bear_data = [r.get('argument', '')[:200] for r in results if r.get('direction') == 'DOWN']
            outlook_prompt = f"""Ticker: {ticker}
Verdict: 관망 (HOLD) | Confidence: {verdict.get('confidence', '')}%
Analysts are SPLIT. Present both sides for each week.

Bull points: {verdict.get('bull_points', [])}
Bear points: {verdict.get('bear_points', [])}

UP-leaning analysts:
{chr(10).join(bull_data[:3])}

DOWN-leaning analysts:
{chr(10).join(bear_data[:3])}

Each week: cite one specific bullish number AND one bearish number.
Write week1~week4 in Korean."""
            system_prompt = OUTLOOK_SYSTEM_NEUTRAL
        else:
            # 매수/매도: 방향에 맞는 근거만
            aligned_points = verdict.get('bull_points', []) if direction == 'UP' else verdict.get('bear_points', [])
            aligned_data = [r.get('argument', '')[:200] for r in results if r.get('direction') == direction]
            outlook_prompt = f"""Ticker: {ticker}
Final verdict: {verdict_label} | Direction: {direction} | Confidence: {verdict.get('confidence', '')}%
Summary: {verdict.get('summary', '')}

YOU MUST write reasons that SUPPORT the {direction} direction ONLY.
If direction is UP, every week must explain why price goes UP.
If direction is DOWN, every week must explain why price goes DOWN.
NEVER contradict the direction.

Key reasons supporting {direction}:
{aligned_points}

Supporting analysts:
{chr(10).join(aligned_data[:4])}

Each week must cite a DIFFERENT specific data point.
Write week1~week4 in Korean."""
            system_prompt = OUTLOOK_SYSTEM_DIRECTIONAL

        raw = chat_json(
            system=system_prompt,
            user=outlook_prompt,
            tier="fast",
            temperature=0,
            max_tokens=400,
        )
        print(f"[judge] weekly_outlook raw: {raw}", flush=True)
        weekly_outlook = {
            f"week{i}": raw.get(f"week{i}", raw.get(f"week_{i}", raw.get(str(i), "")))
            for i in range(1, 5)
        }
        print(f"[judge] weekly_outlook final: {weekly_outlook}", flush=True)
    except Exception as e:
        print(f"[judge] weekly_outlook FAILED: {e}", flush=True)

    # Step 3: 핵심 뉴스 요약 (한국어)
    key_news = []
    if headlines and len(headlines) > 0:
        try:
            news_prompt = f"Ticker: {ticker}\nHeadlines:\n" + "\n".join(f"- {h}" for h in headlines[:10])
            raw_news = chat_json(
                system=NEWS_SUMMARY_SYSTEM,
                user=news_prompt,
                tier="fast",
                temperature=0,
                max_tokens=400,
            )
            key_news = raw_news.get("key_news", [])[:3]
            print(f"[judge] key_news: {len(key_news)} items", flush=True)
        except Exception as e:
            print(f"[judge] key_news FAILED: {e}", flush=True)

    return {
        "direction": verdict.get("direction", "UP"),
        "confidence": int(verdict.get("confidence", 60)),
        "verdict": verdict.get("verdict", "관망"),
        "summary": verdict.get("summary", ""),
        "stock_bull": verdict.get("stock_bull", verdict.get("bull_points", [])),
        "stock_bear": verdict.get("stock_bear", verdict.get("bear_points", [])),
        "market_bull": verdict.get("market_bull", []),
        "market_bear": verdict.get("market_bear", []),
        "bull_points": verdict.get("stock_bull", verdict.get("bull_points", [])) + verdict.get("market_bull", []),
        "bear_points": verdict.get("stock_bear", verdict.get("bear_points", [])) + verdict.get("market_bear", []),
        "weekly_outlook": weekly_outlook,
        "key_news": key_news,
    }


def judge_outlook_only(
    ticker: str,
    direction: str,
    verdict: str,
    confidence: int,
    summary: str,
    bull_points: list,
    bear_points: list,
    personas: list,
) -> dict:
    """Re-generate weekly outlook only (gpt-4o-mini). Used for refresh without full re-run."""
    is_neutral = verdict == "관망"

    if is_neutral:
        bull_data = [p.get("argument", "")[:200] for p in personas if p.get("direction") == "UP"]
        bear_data = [p.get("argument", "")[:200] for p in personas if p.get("direction") == "DOWN"]
        prompt = f"""Ticker: {ticker}
Verdict: 관망 (HOLD) | Confidence: {confidence}%
Analysts are SPLIT. Present both sides for each week.

Bull points: {bull_points}
Bear points: {bear_points}

UP analysts: {chr(10).join(bull_data[:3])}
DOWN analysts: {chr(10).join(bear_data[:3])}

Each week: cite one bullish AND one bearish number.
Write week1~week4 in Korean."""
        system = OUTLOOK_SYSTEM_NEUTRAL
    else:
        aligned_points = bull_points if direction == "UP" else bear_points
        aligned_data = [p.get("argument", "")[:200] for p in personas if p.get("direction") == direction]
        prompt = f"""Ticker: {ticker}
Final verdict: {verdict} | Direction: {direction} | Confidence: {confidence}%
Summary: {summary}

YOU MUST write reasons that SUPPORT the {direction} direction ONLY.
NEVER contradict the direction.

Key reasons: {aligned_points}
Supporting analysts: {chr(10).join(aligned_data[:4])}

Each week must cite a DIFFERENT specific data point.
Write week1~week4 in Korean."""
        system = OUTLOOK_SYSTEM_DIRECTIONAL

    try:
        raw = chat_json(system=system, user=prompt, tier="fast", temperature=0, max_tokens=400)
        return {f"week{i}": raw.get(f"week{i}", raw.get(f"week_{i}", raw.get(str(i), ""))) for i in range(1, 5)}
    except Exception as e:
        print(f"[judge_outlook_only] FAILED: {e}", flush=True)
        return {}
