from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import stocks, predict, settings as settings_router
from app.scheduler import start_scheduler

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

app.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
app.include_router(predict.router, prefix="/predict", tags=["predict"])
app.include_router(settings_router.router, prefix="/settings", tags=["settings"])

@app.get("/health")
def health():
    return {"status": "ok"}
