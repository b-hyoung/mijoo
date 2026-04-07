from app.debate.orchestrator import orchestrate
from app.debate.judge import judge

def build_context(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict) -> str:
    """Build the context string for all personas."""
    headlines_text = "\n".join(f"- {h}" for h in news_headlines[:10]) if news_headlines else "No recent news available."

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
"""

def run_debate(ticker: str, technical_data: dict, news_headlines: list[str], short_data: dict, order_flow: dict) -> dict:
    """Run the full debate engine. Returns verdict with summary."""
    context = build_context(ticker, technical_data, news_headlines, short_data, order_flow)
    results, weights = orchestrate(context, technical_data)
    verdict = judge(ticker, results, weights)
    return {
        "direction": verdict["direction"],
        "confidence": verdict["confidence"],
        "summary": verdict["summary"],
        "debate_rounds": len(set(r["id"] for r in results)) // 8 + 1
    }
