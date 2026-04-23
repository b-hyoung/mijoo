"""Post-mortem analysis for missed predictions.

When we predicted DOWN but price went UP (or vice versa), ask GPT to
identify what real-world drivers overrode our reasoning. Store the
insights and feed them into future predictions as context.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.llm import chat_json

_WINDOW_DAYS = 28
_CACHE_TTL_DAYS = 7  # regenerate at most once a week per ticker


def _gather_misses(ticker: str) -> list[dict]:
    """Pull predictions from last window where direction disagreed with actual.

    Returns list of miss records, most recent first.
    """
    from app.collectors.price_collector import fetch_price_history

    cutoff = (datetime.now(timezone.utc) - timedelta(days=_WINDOW_DAYS)).isoformat()
    conn = get_db()
    rows = conn.execute(
        "SELECT predicted_at, summary FROM predictions "
        "WHERE ticker = ? AND predicted_at >= ? ORDER BY predicted_at DESC",
        (ticker, cutoff),
    ).fetchall()
    conn.close()

    try:
        df = fetch_price_history(ticker, period="1mo")
        if df.empty:
            return []
        current_price = float(df["close"].iloc[-1])
    except Exception:
        return []

    misses: list[dict] = []
    for row in rows:
        summary_json = row["summary"]
        if not summary_json or not summary_json.startswith("{"):
            continue
        try:
            data = json.loads(summary_json)
        except json.JSONDecodeError:
            continue

        price_at = data.get("current_price")
        debate = data.get("debate") or {}
        predicted = debate.get("direction")
        if predicted not in ("UP", "DOWN") or price_at is None:
            continue

        actual = "UP" if current_price > price_at else "DOWN"
        if actual == predicted:
            continue  # hit, not a miss

        personas = debate.get("personas") or []
        reasoning_lines = []
        for p in personas:
            arg = (p.get("argument") or "").splitlines()[0][:140]
            reasoning_lines.append(f"  - {p.get('role', p.get('id'))}: {p.get('direction')} — {arg}")

        misses.append({
            "predicted_at": row["predicted_at"],
            "predicted_direction": predicted,
            "actual_direction": actual,
            "price_at": price_at,
            "current_price": current_price,
            "change_pct": round((current_price - price_at) / price_at * 100, 2),
            "reasoning": "\n".join(reasoning_lines) or "(페르소나 미수집)",
            "summary": debate.get("summary", ""),
        })

    return misses


def _gather_headlines(ticker: str, since_iso: str) -> list[str]:
    """Pull news headlines for ticker since given date."""
    conn = get_db()
    rows = conn.execute(
        "SELECT date, title FROM news WHERE ticker = ? AND date >= ? "
        "ORDER BY date DESC LIMIT 30",
        (ticker, since_iso[:10]),
    ).fetchall()
    conn.close()
    return [f"{r['date']}: {r['title']}" for r in rows]


def _cached_analysis(ticker: str) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM miss_analysis WHERE ticker = ?", (ticker,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    try:
        analyzed_at = datetime.fromisoformat(row["analyzed_at"])
        if analyzed_at.tzinfo is None:
            analyzed_at = analyzed_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - analyzed_at
        if age > timedelta(days=_CACHE_TTL_DAYS):
            return None
    except Exception:
        return None
    return dict(row)


def _save_analysis(ticker: str, misses: list[dict], drivers: list[str], advice: str, summary: str):
    predicted = misses[0]["predicted_direction"] if misses else ""
    actual = misses[0]["actual_direction"] if misses else ""
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO miss_analysis
        (ticker, analyzed_at, predicted_direction, actual_direction, miss_count, drivers, advice, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticker,
        datetime.now(timezone.utc).isoformat(),
        predicted, actual, len(misses),
        json.dumps(drivers, ensure_ascii=False),
        advice, summary,
    ))
    conn.commit()
    conn.close()


def generate_miss_analysis(ticker: str, force: bool = False) -> dict | None:
    """Generate (or fetch cached) post-mortem for a ticker.

    Returns None if there are no misses in the window, or a dict:
      {
        "ticker", "analyzed_at", "miss_count", "predicted_direction",
        "actual_direction", "drivers" (list), "advice", "summary",
        "misses" (list of raw miss records for context)
      }
    """
    if not force:
        cached = _cached_analysis(ticker)
        if cached:
            try:
                drivers = json.loads(cached["drivers"] or "[]")
            except Exception:
                drivers = []
            misses = _gather_misses(ticker)
            return {
                "ticker": ticker,
                "analyzed_at": cached["analyzed_at"],
                "miss_count": cached["miss_count"],
                "predicted_direction": cached["predicted_direction"],
                "actual_direction": cached["actual_direction"],
                "drivers": drivers,
                "advice": cached["advice"] or "",
                "summary": cached["summary"] or "",
                "misses": misses,
                "cached": True,
            }

    misses = _gather_misses(ticker)
    if not misses:
        return None

    # Use the earliest miss date as the news window start
    earliest = misses[-1]["predicted_at"]
    headlines = _gather_headlines(ticker, earliest)

    # Build reasoning block
    reasoning_block = "\n\n".join(
        f"[{m['predicted_at'][:10]}] {m['predicted_direction']} 예측, 실제 {m['actual_direction']} ({m['change_pct']:+.1f}%)\n{m['reasoning']}"
        for m in misses[:5]
    )
    headlines_block = "\n".join(f"- {h}" for h in headlines[:15]) or "(수집된 헤드라인 없음)"

    system = """You are a post-mortem analyst. When directional predictions were wrong,
identify what real-world factors overrode the reasoning. Be specific, cite headlines
if helpful. Output Korean.

Respond ONLY with this JSON:
{"drivers": ["한 줄 설명", ...3개 이하], "advice": "다음 예측에서 이 티커에 대해 추가로 고려할 점 (1문장)", "summary": "한 문단 요약 (2~3문장)"}"""

    user = f"""티커: {misses[0].get('predicted_at','')}의 {len(misses)}회 예측 실패.
예측: {misses[0]['predicted_direction']}, 실제: {misses[0]['actual_direction']}

=== 빗나간 예측별 당시 근거 ===
{reasoning_block}

=== 기간 내 뉴스 헤드라인 ===
{headlines_block}

위 근거들이 있었음에도 실제로 반대로 간 **결정적 요인 1~3가지**를 찾아라.
뉴스/이벤트/시장 구조 어떤 것이든. 추측일 수밖에 없는 경우 "가능성:" 접두사 붙여라."""

    try:
        result = chat_json(system=system, user=user, tier="strong", temperature=0.3, max_tokens=600)
    except Exception as e:
        result = {"drivers": [], "advice": "", "summary": f"분석 실패: {e}"}

    drivers = result.get("drivers") or []
    if isinstance(drivers, str):
        drivers = [drivers]
    advice = result.get("advice", "") or ""
    summary = result.get("summary", "") or ""

    _save_analysis(ticker, misses, drivers, advice, summary)

    return {
        "ticker": ticker,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "miss_count": len(misses),
        "predicted_direction": misses[0]["predicted_direction"],
        "actual_direction": misses[0]["actual_direction"],
        "drivers": drivers,
        "advice": advice,
        "summary": summary,
        "misses": misses,
        "cached": False,
    }


def fetch_miss_context_for_prompt(ticker: str) -> str:
    """Return a short context block to inject into next-prediction personas.

    If there's no recent miss analysis, returns empty string.
    """
    conn = get_db()
    row = conn.execute(
        "SELECT drivers, advice, miss_count, predicted_direction, actual_direction "
        "FROM miss_analysis WHERE ticker = ?", (ticker,),
    ).fetchone()
    conn.close()
    if not row:
        return ""
    try:
        drivers = json.loads(row["drivers"] or "[]")
    except Exception:
        drivers = []
    if not drivers and not row["advice"]:
        return ""

    lines = [f"=== 최근 {row['miss_count']}회 예측 실패 요인 ({row['predicted_direction']} 예측 → 실제 {row['actual_direction']}) ==="]
    for d in drivers:
        lines.append(f"- {d}")
    if row["advice"]:
        lines.append(f"(조언: {row['advice']})")
    return "\n".join(lines)
