from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str = ""
    news_api_key: str = ""
    discord_webhook_url: str = ""
    discord_alert_threshold: float = 5.0
    nasdaq100_tickers: list[str] = [
        "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
        "META", "TSLA", "AVGO", "COST", "NFLX"
    ]

    class Config:
        env_file = ".env"

settings = Settings()
