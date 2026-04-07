import pytest
import os
from app.database import init_db, get_db

def test_init_db_creates_tables():
    if os.path.exists("test_stocks.db"):
        os.remove("test_stocks.db")
    init_db("test_stocks.db")
    db = get_db("test_stocks.db")
    cursor = db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    db.close()
    os.remove("test_stocks.db")
    assert "prices" in tables
    assert "news" in tables
    assert "predictions" in tables
    assert "settings" in tables
    assert "custom_tickers" in tables
