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
    """Pull news headlines for ticker since given date.

    Tries fresh yfinance fetch first (covers events during the miss window),
    falls back to news table. Both sources are merged and de-duplicated.
    """
    # Fresh fetch
    fresh: list[tuple[str, str]] = []
    try:
        from app.collectors.news_collector import fetch_news
        articles = fetch_news(ticker, days=45)
        for a in articles:
            title = (a.get("title") or "").strip()
            date = (a.get("date") or "")[:10]
            if title and date and date >= since_iso[:10]:
                fresh.append((date, title))
    except Exception:
        pass

    # DB fallback / supplement
    try:
        conn = get_db()
        db_rows = conn.execute(
            "SELECT date, title FROM news WHERE ticker = ? AND date >= ? "
            "ORDER BY date DESC LIMIT 30",
            (ticker, since_iso[:10]),
        ).fetchall()
        conn.close()
        for r in db_rows:
            fresh.append((r["date"], r["title"]))
    except Exception:
        pass

    seen: set[str] = set()
    out: list[str] = []
    for date, title in sorted(fresh, key=lambda x: x[0], reverse=True):
        key = title.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(f"{date}: {title}")
    return out[:25]


def _gather_price_path(ticker: str, since_iso: str) -> str:
    """Build a compact daily price-change summary during the miss window."""
    try:
        from app.collectors.price_collector import fetch_price_history
        df = fetch_price_history(ticker, period="2mo")
        if df.empty:
            return "(가격 이력 없음)"
        import pandas as pd
        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)
        since_dt = pd.Timestamp(since_iso[:10])
        window = df[df.index >= since_dt]
        if len(window) < 2:
            return "(기간 데이터 부족)"
        closes = window["close"]
        lines: list[str] = []
        prev = closes.iloc[0]
        for idx, close in closes.items():
            chg = (close - prev) / prev * 100
            # Only surface days with material moves (|>=2%|) to keep signal
            if abs(chg) >= 2.0 or idx == closes.index[-1] or idx == closes.index[0]:
                lines.append(f"  {idx.strftime('%Y-%m-%d')}: ${float(close):.2f} ({chg:+.1f}% 전일대비)")
            prev = close
        total_chg = (closes.iloc[-1] - closes.iloc[0]) / closes.iloc[0] * 100
        header = f"시작 ${float(closes.iloc[0]):.2f} → 현재 ${float(closes.iloc[-1]):.2f} ({total_chg:+.1f}%, {len(closes)}거래일)"
        return header + "\n" + "\n".join(lines) if lines else header
    except Exception as e:
        return f"(가격 이력 실패: {e})"


def _gather_macro_snapshot() -> str:
    try:
        from app.collectors.macro_collector import fetch_macro_latest
        m = fetch_macro_latest()
        return (
            f"VIX {m.get('vix')} (20d {m.get('vix_20d_change'):+.1f}%), "
            f"10Y {m.get('treasury_10y')}% (20d {m.get('treasury_10y_20d_change'):+.1f}%), "
            f"DXY {m.get('dxy')} (20d {m.get('dxy_20d_change'):+.1f}%)"
        )
    except Exception:
        return "(매크로 스냅샷 미수집)"


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
    price_path = _gather_price_path(ticker, earliest)
    macro_now = _gather_macro_snapshot()

    # Build reasoning block
    reasoning_block = "\n\n".join(
        f"[{m['predicted_at'][:10]}] {m['predicted_direction']} 예측, 실제 {m['actual_direction']} ({m['change_pct']:+.1f}%)\n{m['reasoning']}"
        for m in misses[:5]
    )
    headlines_block = "\n".join(f"- {h}" for h in headlines[:20]) or "(수집된 헤드라인 없음)"

    system = """You are a financial post-mortem analyst. Given a ticker's wrong directional
predictions, identify what SPECIFIC real-world factors overrode our reasoning.

Requirements for every driver you list:
- Cite a concrete event, date, or number when possible (e.g., "4/15 Robotaxi 발표", "Q1 EPS +12%", "Cybertruck 유럽 출시")
- Avoid generic phrases like "실적 발표가 예상 상회" without a date/number.
- If the exact event is not in the provided data, clearly prefix with "가능성:" and
  name the most likely catalyst category (섹터 로테이션, 숏커버, 거시 전환 등).
- Prefer NAMING specific products / policies / people rather than abstract trends.

Language: Korean. Respond ONLY with this JSON:
{
  "drivers": ["구체적 한 줄, 날짜/제품명/수치 포함", ... 2~3개],
  "advice": "다음 예측에서 이 티커에 대해 추가로 볼 시그널 (1문장, 구체적)",
  "summary": "한 문단 (2~3문장), 어떤 날짜에 뭐가 일어났는지 포함"
}"""

    user = f"""티커: {ticker}
예측 실패: {len(misses)}회
기본 방향: {misses[0]['predicted_direction']} 예측 → 실제 {misses[0]['actual_direction']}

=== 빗나간 예측별 당시 근거 ===
{reasoning_block}

=== 가격 경로 (기간 내 일별 움직임) ===
{price_path}

=== 현재 매크로 스냅샷 ===
{macro_now}

=== 기간 내 뉴스 헤드라인 (최신순) ===
{headlines_block}

위 근거들이 있었음에도 실제로 반대로 간 **결정적 요인 1~3가지**를 찾아라.
가능한 한 날짜 + 구체적 이벤트명(제품, 정책, 인물)을 포함해라.
뉴스에 없는 가설이면 "가능성:" 붙여서 적어라."""

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
