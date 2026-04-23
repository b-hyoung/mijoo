from app.debate.orchestrator import orchestrate
from app.debate.judge import judge
from app.debate.personas import PERSONAS
from app.collectors.event_calendar import upcoming_events
from app.stats_analysis import fetch_miss_context_for_prompt


def _format_event_block(ticker: str, earnings_data: dict | None) -> str:
    macro = upcoming_events(days_ahead=14)
    lines = ["=== 향후 2주 예정 이벤트 ==="]
    if earnings_data and earnings_data.get("days_until") is not None:
        d = earnings_data["days_until"]
        if 0 <= d <= 14:
            lines.append(f"- {ticker} 실적: {earnings_data.get('next_date')} (D-{d})")
    for e in macro:
        lines.append(f"- {e['type']} 발표: {e['date']} (D-{e['days_until']})")
    if len(lines) == 1:
        lines.append("- 예정 이벤트 없음")
    return "\n".join(lines)

def build_context(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict, ml_result: dict = None, analyst_data: dict = None, insider_data: dict = None, macro_data=None, options_data=None, earnings_data=None, anomaly_data=None) -> str:
    """Build the context string for all personas."""
    headlines_text = "\n".join(f"- {h}" for h in news_headlines[:10]) if news_headlines else "No recent news available."

    ml_section = ""
    if ml_result:
        current = technical_data.get('close', 0)
        w2 = ml_result.get('week2', {})
        w4 = ml_result.get('week4', {})
        w2_chg = ((w2.get('price_target', current) - current) / current * 100) if current else 0
        w4_chg = ((w4.get('price_target', current) - current) / current * 100) if current else 0
        ml_section = f"""
ML MODEL PRICE FORECAST (XGBoost, trained on 5yr history):
- 2-week target: ${w2.get('price_target', 'N/A')} ({w2_chg:+.1f}%) direction={w2.get('direction', 'N/A')}
- 4-week target: ${w4.get('price_target', 'N/A')} ({w4_chg:+.1f}%) direction={w4.get('direction', 'N/A')}
Note: The ML forecast is based purely on historical price patterns. Your job is to reconcile or challenge it with fundamental/sentiment evidence.
"""

    analyst_section = ""
    if analyst_data and analyst_data.get("target_mean"):
        rec = analyst_data.get("recommendation", "").replace("_", " ").upper()
        analyst_section = f"""
ANALYST CONSENSUS ({analyst_data.get('num_analysts', '?')} analysts):
- Price Target: Mean ${analyst_data['target_mean']} | Low ${analyst_data.get('target_low')} | High ${analyst_data.get('target_high')}
- Upside to Mean Target: {analyst_data.get('upside_pct', 'N/A')}%
- Recommendation: {rec}
"""

    insider_section = ""
    if insider_data and insider_data.get("recent"):
        net = insider_data.get("net_shares_90d", 0)
        net_label = f"NET BUY +{net:,}" if net > 0 else f"NET SELL {net:,}"
        lines = [f"- {t['date']} {t['insider']} ({t['title']}): {t['type']} {t['shares']:,}shares" for t in insider_data["recent"][:3]]
        insider_section = f"""
INSIDER TRANSACTIONS (last 90 days):
- {net_label} shares net
{chr(10).join(lines)}
"""

    macro_section = ""
    if macro_data:
        vix = macro_data.get("vix")
        vix_chg = macro_data.get("vix_20d_change")
        t10y = macro_data.get("treasury_10y")
        t10y_chg = macro_data.get("treasury_10y_20d_change")
        dxy_val = macro_data.get("dxy")
        dxy_chg = macro_data.get("dxy_20d_change")
        macro_section = f"""
MACRO ENVIRONMENT:
- VIX: {vix or 'N/A'} (20-day change: {(vix_chg or 0):+.1f}%){"— ELEVATED FEAR" if vix and vix > 25 else ""}
- 10Y Treasury: {t10y or 'N/A'}% (20-day change: {(t10y_chg or 0):+.1f}%){"— RISING PRESSURE ON GROWTH" if t10y_chg and t10y_chg > 5 else ""}
- Dollar Index: {dxy_val or 'N/A'} (20-day change: {(dxy_chg or 0):+.1f}%){"— STRONG DOLLAR" if dxy_val and dxy_val > 105 else ""}
"""

    options_section = ""
    if options_data and options_data.get("pc_ratio") is not None:
        options_section = f"""
OPTIONS FLOW:
- Put/Call Ratio: {options_data.get('pc_ratio')} {"(EXTREME BEARISH)" if options_data['pc_ratio'] > 1.5 else "(EXTREME BULLISH)" if options_data['pc_ratio'] < 0.3 else ""}
- IV Rank: {options_data.get('iv_rank')}% {"(HIGH — big move expected)" if options_data.get('iv_rank', 0) >= 80 else ""}
- Unusual Activity: {(options_data.get('unusual_activity') or 0):.1f}x on {options_data.get('unusual_side') or 'N/A'} side
"""

    earnings_section = ""
    if earnings_data and earnings_data.get("next_date"):
        days = earnings_data.get("days_until", "?")
        warn = "⚠ EARNINGS IMMINENT" if isinstance(days, int) and days <= 7 else ""
        history_lines = []
        for h in earnings_data.get("history", [])[:4]:
            eps_beat = "BEAT" if h.get("eps_surprise_pct", 0) > 0 else "MISS"
            rev_beat = "BEAT" if h.get("revenue_surprise_pct", 0) > 0 else "MISS"
            history_lines.append(f"- {h.get('quarter')}: EPS {eps_beat} {h.get('eps_surprise_pct', 0):+.1f}% | Revenue {rev_beat} {h.get('revenue_surprise_pct', 0):+.1f}%")
        earnings_section = f"""
EARNINGS CALENDAR: {warn}
- Next earnings: {earnings_data['next_date']} ({days} days away)
{chr(10).join(history_lines)}
"""

    anomaly_section = ""
    if anomaly_data and anomaly_data.get("score", 0) > 30:
        sig_lines = [f"- {s['name']}: +{s['score']}pts {s['direction']} ({s['detail']})" for s in anomaly_data.get("signals", []) if s.get("score", 0) > 0]
        anomaly_section = f"""
⚠ ANOMALY DETECTED: Score {anomaly_data['score']}/100 — {anomaly_data.get('direction', '?')} pressure ({anomaly_data.get('level', '?')})
{chr(10).join(sig_lines)}
"""

    event_block = _format_event_block(ticker, earnings_data)
    miss_feedback = fetch_miss_context_for_prompt(ticker)

    return f"""
STOCK: {ticker}

TECHNICAL INDICATORS:
- Current Price: ${technical_data.get('close', 'N/A')}
- RSI(14): {technical_data.get('rsi', 'N/A'):.1f}
- MACD: {technical_data.get('macd', 'N/A'):.3f} | Signal: {technical_data.get('macd_signal', 'N/A'):.3f}
- MA5: ${technical_data.get('ma5', 'N/A'):.2f} | MA20: ${technical_data.get('ma20', 'N/A'):.2f} | MA60: ${technical_data.get('ma60', 'N/A'):.2f}
- Bollinger Upper: ${technical_data.get('bb_upper', 'N/A'):.2f} | Lower: ${technical_data.get('bb_lower', 'N/A'):.2f}
- Volume Ratio (vs 5d avg): {technical_data.get('volume_ratio', 'N/A'):.2f}x

ORDER FLOW (1 month):
- OBV Trend: {order_flow.get('obv_trend', 'N/A')}
- Recent 1-week buy dominance: {order_flow.get('buy_dominance_pct', 'N/A'):.1f}%
- Accumulation detected: {order_flow.get('is_accumulation', False)}

SHORT INTEREST:
- Short Float %: {short_data.get('short_float_pct', 'N/A')}
- Short Interest Change: {short_data.get('short_change', 'N/A')}

RECENT NEWS HEADLINES:
{headlines_text}
{analyst_section}{insider_section}{macro_section}{options_section}{earnings_section}{anomaly_section}{ml_section}
{event_block}

{miss_feedback}
"""

def run_debate(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict, ml_result: dict = None, analyst_data: dict = None, insider_data: dict = None, macro_data=None, options_data=None, earnings_data=None, anomaly_data=None) -> dict:
    """Run the full debate engine. Returns verdict with summary and persona arguments."""
    context = build_context(ticker, technical_data, news_headlines, short_data, order_flow, ml_result, analyst_data, insider_data, macro_data, options_data, earnings_data, anomaly_data)
    results, weights = orchestrate(context, technical_data, macro_data, options_data, earnings_data, anomaly_data)
    verdict = judge(ticker, results, weights, headlines=news_headlines)

    return {
        "direction": verdict["direction"],
        "confidence": verdict["confidence"],
        "verdict": verdict.get("verdict", "관망"),
        "summary": verdict["summary"],
        "stock_bull": verdict.get("stock_bull", []),
        "stock_bear": verdict.get("stock_bear", []),
        "market_bull": verdict.get("market_bull", []),
        "market_bear": verdict.get("market_bear", []),
        "bull_points": verdict.get("bull_points", []),
        "bear_points": verdict.get("bear_points", []),
        "weekly_outlook": verdict.get("weekly_outlook", {}),
        "key_news": verdict.get("key_news", []),
        "personas": results
    }
