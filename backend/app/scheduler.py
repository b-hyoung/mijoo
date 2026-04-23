# backend/app/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.collectors.price_collector import collect_all
from app.collectors.news_collector import fetch_news, save_news
from app.features.sentiment import score_articles
from app.alerts.discord import send_weekly_report

def daily_collect():
    tickers = settings.nasdaq100_tickers
    collect_all(tickers)
    for ticker in tickers:
        articles = fetch_news(ticker)
        headlines = [a["title"] for a in articles if a.get("title")]
        score = score_articles(ticker, headlines)
        save_news(ticker, articles, score)
    # 데이터 수집 후 전 종목 예측 캐시 갱신
    from app.warming import warm_all_tickers
    warm_all_tickers()

def weekly_report():
    send_weekly_report([])

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(daily_collect, CronTrigger(day_of_week="mon-fri", hour=21, minute=30))
    scheduler.add_job(weekly_report, CronTrigger(day_of_week="mon", hour=0, minute=0))
    scheduler.start()
    return scheduler
