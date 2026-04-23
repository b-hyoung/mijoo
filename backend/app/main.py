from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import stocks, predict, settings as settings_router, history
from app.routers import status, translate, prediction_history, stats
from app.scheduler import start_scheduler
from app.warming import start_warming_if_empty

app = FastAPI(title="Nasdaq Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    start_scheduler()
    start_warming_if_empty()

app.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
app.include_router(predict.router, prefix="/predict", tags=["predict"])
app.include_router(settings_router.router, prefix="/settings", tags=["settings"])
app.include_router(history.router, prefix="/history", tags=["history"])
app.include_router(status.router, prefix="/status", tags=["status"])
app.include_router(translate.router, prefix="/translate", tags=["translate"])
app.include_router(prediction_history.router, prefix="/prediction-history", tags=["prediction-history"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])

@app.get("/health")
def health():
    return {"status": "ok"}
