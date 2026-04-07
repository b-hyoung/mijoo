import pytest
from unittest.mock import patch, MagicMock
from app.collectors.price_collector import fetch_price_history
from app.collectors.news_collector import fetch_news

def test_fetch_price_history_returns_dataframe():
    df = fetch_price_history("AAPL", period="5d")
    assert not df.empty
    assert all(col in df.columns for col in ["open", "high", "low", "close", "volume"])

def test_fetch_price_history_invalid_ticker():
    df = fetch_price_history("INVALID_TICKER_XYZ123", period="5d")
    assert df.empty

def test_fetch_news_returns_list():
    mock_response = {
        "articles": [
            {"title": "AAPL hits record high", "publishedAt": "2026-04-07T10:00:00Z"},
            {"title": "Apple faces antitrust probe", "publishedAt": "2026-04-07T11:00:00Z"}
        ]
    }
    with patch("requests.get") as mock_get:
        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: mock_response
        )
        articles = fetch_news("AAPL")
    assert len(articles) == 2
    assert articles[0]["title"] == "AAPL hits record high"

def test_fetch_news_bad_status_returns_empty():
    with patch("requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=429)
        articles = fetch_news("AAPL")
    assert articles == []
