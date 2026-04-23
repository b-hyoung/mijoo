import sqlite3
from pathlib import Path

# Docker container: /app/data/stocks.db (bind-mounted from host)
# Local dev:       <project_root>/data/stocks.db  (same file Docker mounts)
# /.dockerenv is the standard marker Docker drops inside containers.
_IN_DOCKER = Path("/.dockerenv").exists()
DB_PATH = (
    Path("/app/data/stocks.db") if _IN_DOCKER
    else Path(__file__).resolve().parents[2] / "data" / "stocks.db"
)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_db(db_path=None):
    path = db_path if db_path else str(DB_PATH)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path=None):
    conn = get_db(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL, high REAL, low REAL, close REAL, volume INTEGER,
            UNIQUE(ticker, date)
        );
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            title TEXT,
            sentiment_score REAL,
            UNIQUE(ticker, date, title)
        );
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            predicted_at TEXT NOT NULL,
            week2_direction TEXT,
            week2_confidence REAL,
            week2_price_low REAL,
            week2_price_high REAL,
            week4_direction TEXT,
            week4_confidence REAL,
            week4_price_low REAL,
            week4_price_high REAL,
            summary TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS custom_tickers (
            ticker TEXT PRIMARY KEY
        );
    """)
    conn.commit()
    conn.close()
