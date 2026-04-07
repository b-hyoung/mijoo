import pytest
from app.collectors.price_collector import fetch_price_history

def test_fetch_price_history_returns_dataframe():
    df = fetch_price_history("AAPL", period="5d")
    assert not df.empty
    assert all(col in df.columns for col in ["open", "high", "low", "close", "volume"])

def test_fetch_price_history_invalid_ticker():
    df = fetch_price_history("INVALID_TICKER_XYZ123", period="5d")
    assert df.empty
