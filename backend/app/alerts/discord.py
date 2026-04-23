import requests
from datetime import datetime
from app.config import settings

def send_prediction_alert(ticker: str, current_price: float, prediction: dict, summary: str):
    if not settings.discord_webhook_url:
        return
    w2 = prediction["week2"]
    direction_emoji = "📈" if w2["direction"] == "UP" else "📉"
    message = {
        "embeds": [{
            "title": f"⚡ {ticker} 예측 알림",
            "color": 0x00ff88 if w2["direction"] == "UP" else 0xff4444,
            "fields": [
                {"name": "현재가", "value": f"${current_price:,.2f}", "inline": True},
                {"name": "2주 후 방향", "value": f"{direction_emoji} {w2['direction']} ({w2['confidence']}%)", "inline": True},
                {"name": "2주 후 예상가", "value": f"${w2['price_low']:,.0f} ~ ${w2['price_high']:,.0f}", "inline": True},
                {"name": "4주 후 예상가", "value": f"${prediction['week4']['price_low']:,.0f} ~ ${prediction['week4']['price_high']:,.0f}", "inline": True},
                {"name": "근거", "value": summary, "inline": False},
            ],
            "timestamp": datetime.utcnow().isoformat()
        }]
    }
    try:
        requests.post(settings.discord_webhook_url, json=message, timeout=10)
    except Exception:
        pass

def send_weekly_report(summaries: list[dict]):
    if not settings.discord_webhook_url:
        return
    lines = []
    for s in summaries:
        emoji = "📈" if s["direction"] == "UP" else "📉"
        lines.append(f"{emoji} **{s['ticker']}**: {'+' if s['direction'] == 'UP' else '-'}{s['change_pct']:.1f}% 예상")
    message = {
        "embeds": [{
            "title": f"📊 주간 예측 요약 ({datetime.now().strftime('%Y-%m-%d')})",
            "color": 0x5865f2,
            "description": "\n".join(lines) if lines else "예측 데이터 없음",
            "timestamp": datetime.utcnow().isoformat()
        }]
    }
    try:
        requests.post(settings.discord_webhook_url, json=message, timeout=10)
    except Exception:
        pass
