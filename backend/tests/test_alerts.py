from unittest.mock import patch, MagicMock
from app.alerts.discord import send_prediction_alert, send_weekly_report

def test_send_prediction_alert_calls_webhook():
    prediction = {
        "week2": {"direction": "UP", "confidence": 73.0, "price_low": 891.0, "price_high": 924.0, "price_target": 907.0},
        "week4": {"direction": "UP", "confidence": 65.0, "price_low": 900.0, "price_high": 960.0, "price_target": 930.0}
    }
    with patch("requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=204)
        send_prediction_alert("NVDA", 850.0, prediction, "실적 호조 · 매집 시그널")
    mock_post.assert_called_once()

def test_send_weekly_report_calls_webhook():
    summaries = [
        {"ticker": "AAPL", "direction": "UP", "change_pct": 4.2},
        {"ticker": "TSLA", "direction": "DOWN", "change_pct": 2.8},
    ]
    with patch("requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=204)
        send_weekly_report(summaries)
    mock_post.assert_called_once()
