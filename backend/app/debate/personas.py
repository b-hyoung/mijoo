import json
import concurrent.futures
from app.llm import chat_json

PERSONAS = [
    {
        "id": "fundamental",
        "role": "펀더멘털 분석가",
        "system": """You are a fundamental stock analyst. Analyze earnings data, analyst price targets, insider transactions, and institutional holdings.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 30-100>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on fundamental data (earnings, analyst targets, insider trades, institutional flows)
- Do NOT analyze technical indicators — that is another analyst's job
- confidence reflects how strong the fundamental signals are
- argument must cite specific numbers from the data"""
    },
    {
        "id": "technical",
        "role": "테크니컬 분석가",
        "system": """You are a technical stock analyst. Analyze RSI, MACD, moving averages, Bollinger Bands, volume patterns, and OBV trends.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 30-100>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on technical indicators (RSI, MACD, MA, BB, volume, OBV)
- Do NOT analyze news, earnings, or fundamentals — that is another analyst's job
- confidence reflects how clear the technical signals are
- argument must cite specific indicator values"""
    },
    {
        "id": "options",
        "role": "옵션 트레이더",
        "system": """You are an options flow analyst. Analyze put/call ratio, implied volatility rank, and unusual options activity to detect smart money positioning.

Based on the data provided, determine your directional view and confidence.

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 30-100>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on options data (P/C ratio, IV rank, unusual activity)
- If options data is unavailable, set confidence to 50 and note data unavailable
- confidence reflects how clear the options signals are
- argument must cite specific options metrics"""
    },
]

# 매크로는 별도 — 하루 1회만 돌리고 전체 종목 공유
MACRO_PERSONA = {
    "id": "macro",
    "role": "매크로 전략가",
    "system": """You are a macro strategist. Analyze VIX (fear index), 10-Year Treasury yield, US Dollar Index (DXY), and their recent trends to assess the overall market environment.

Based on the data provided, determine your directional view and confidence for the OVERALL MARKET (not a specific stock).

Respond ONLY with this JSON:
{"direction": "UP or DOWN", "confidence": <integer 30-100>, "argument": "한국어 근거 3줄. 각 줄은 '• '로 시작."}

Rules:
- Focus ONLY on macro indicators (VIX, rates, dollar)
- Assess MARKET-WIDE direction, not individual stocks
- confidence reflects how strongly macro conditions favor one direction
- argument must cite specific macro values and their 20-day changes"""
}


# Confluence 설명 — 단기(week1/2)와 구조(week3/4) 일치/불일치 내러티브 생성
CONFLUENCE_EXPLAINER = {
    "id": "confluence",
    "role": "통합 분석가",
    "system": """You integrate short-term (week 1-2) and structural (week 3-4)
predictions. Given each week's direction and the confluence tone,
explain in 1 Korean paragraph (2-3 sentences) WHY they align or diverge.

If aligned (tone=strong or moderate): name the dominant short-term driver
AND the structural factor that supports it.
If mixed (2-2 split): describe the likely scenario. Examples:
  - "단기 반등 후 구조적 약세로 회귀 가능성"
  - "단기 조정 후 장기 추세 재개 가능성"

Respond ONLY with this JSON (use field name "argument"):
{"direction": "UP", "confidence": 50, "argument": "한 문단. 2-3문장."}

The direction/confidence values are placeholders — this persona does not
make a directional call; the explanation text in argument is what matters."""
}


def parse_persona_response(raw: str, persona_id: str) -> dict:
    """Parse JSON response from persona. Fallback if invalid."""
    try:
        data = json.loads(raw)
        return {
            "direction": data.get("direction", "UP"),
            "confidence": int(data.get("confidence", 50)),
            "argument": data.get("argument", raw),
        }
    except (json.JSONDecodeError, KeyError, TypeError):
        return {
            "direction": "UP" if "상승" in raw or "긍정" in raw else "DOWN",
            "confidence": 50,
            "argument": raw.strip(),
        }


def _call_persona(persona: dict, context: str) -> dict:
    """Call a single persona and return structured result."""
    try:
        data = chat_json(
            system=persona["system"],
            user=context,
            tier="strong",
            temperature=0.3,
            max_tokens=400,
        )
        parsed = parse_persona_response(json.dumps(data) if data else "{}", persona["id"])
        return {
            "id": persona["id"],
            "role": persona["role"],
            **parsed,
        }
    except Exception as e:
        return {
            "id": persona["id"],
            "role": persona["role"],
            "direction": "UP",
            "confidence": 50,
            "argument": f"분석 불가: {str(e)}",
        }


def run_personas(context: str, persona_ids: list[str] | None = None) -> list[dict]:
    """Run specified personas (or all) in parallel."""
    targets = [p for p in PERSONAS if persona_ids is None or p["id"] in persona_ids]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(_call_persona, p, context) for p in targets]
        return [f.result() for f in concurrent.futures.as_completed(futures)]
