# backend/app/routers/status.py
from fastapi import APIRouter
from app.warming import warming_status

router = APIRouter()

@router.get("")
def get_status():
    return {
        "warming": warming_status["warming"],
        "cached_count": warming_status["cached_count"],
        "total": warming_status["total"],
        "last_warmed_at": warming_status["last_warmed_at"]
    }
