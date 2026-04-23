# Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 타임아웃 해결 — 스케줄러 캐시 워밍 + 카드별 Suspense 비동기 로딩 + 워밍 상태 배너

**Architecture:** 백엔드에 warming_status 전역 상태와 /status 엔드포인트 추가. 앱 시작 시 DB가 비어있으면 백그라운드 워밍 실행. 프론트는 StockCard를 현재가 레이어(즉시)와 예측 레이어(Suspense)로 분리해 현재가 먼저 표시하고 예측은 비동기 로딩.

**Tech Stack:** Python/FastAPI, threading, Next.js 14 App Router, Suspense, SWR

---

## File Structure

```
backend/
├── app/
│   ├── main.py                  -- startup 워밍 + warming_status 추가
│   ├── scheduler.py             -- daily_collect 이후 전 종목 예측 추가
│   ├── warming.py               -- 신규: warming_status 전역 + warm_all_tickers()
│   └── routers/
│       └── status.py            -- 신규: GET /status

frontend/
├── lib/
│   └── api.ts                   -- fetchCurrentPrice, fetchStatus 추가
├── components/
│   ├── StockCard.tsx            -- 현재가만 표시하는 껍데기로 변경
│   ├── PredictionSection.tsx    -- 신규: 예측 비동기 로딩 + 스피너
│   └── WarmingBanner.tsx        -- 신규: 워밍 상태 배너
└── app/
    └── page.tsx                 -- Suspense로 PredictionSection 감싸기
```

---

## Task 1: Backend — warming.py (워밍 상태 + 실행 로직)

**Files:**
- Create: `backend/app/warming.py`

- [ ] **Step 1: warming.py 작성**

```python
# backend/app/warming.py
import threading
from datetime import datetime, timezone
from app.config import settings

_lock = threading.Lock()

warming_status = {
    "warming": False,
    "cached_count": 0,
    "total": 0,
    "last_warmed_at": None
}

def _warm_ticker(ticker: str):
    """Compute and cache prediction for a single ticker."""
    try:
        from app.routers.predict import get_prediction
        get_prediction(ticker)
        with _lock:
            warming_status["cached_count"] += 1
    except Exception:
        pass

def warm_all_tickers():
    """Warm cache for all tickers. Runs in background thread."""
    tickers = settings.nasdaq100_tickers
    warming_status["warming"] = True
    warming_status["cached_count"] = 0
    warming_status["total"] = len(tickers)
    for ticker in tickers:
        _warm_ticker(ticker)
    warming_status["warming"] = False
    warming_status["last_warmed_at"] = datetime.now(timezone.utc).isoformat()

def start_warming_if_empty():
    """Start warming in background thread if predictions DB is empty."""
    from app.database import get_db
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    conn.close()
    if count == 0:
        thread = threading.Thread(target=warm_all_tickers, daemon=True)
        thread.start()
```

- [ ] **Step 2: 임포트 테스트**

```bash
cd backend && C:\Users\ACE\AppData\Local\Programs\Python\Python311\python.exe -c "from app.warming import warm_all_tickers, start_warming_if_empty, warming_status; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/warming.py
git commit -m "feat: warming module with background cache warming"
```

---

## Task 2: Backend — /status 엔드포인트

**Files:**
- Create: `backend/app/routers/status.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: status.py 작성**

```python
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
```

- [ ] **Step 2: main.py에 status 라우터 + startup 워밍 추가**

`backend/app/main.py` 전체 내용:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import stocks, predict, settings as settings_router, history
from app.routers import status
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

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 3: 임포트 테스트**

```bash
cd backend && C:\Users\ACE\AppData\Local\Programs\Python\Python311\python.exe -c "from app.main import app; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/status.py backend/app/main.py
git commit -m "feat: /status endpoint and startup cache warming"
```

---

## Task 3: Backend — 스케줄러에 daily 워밍 추가

**Files:**
- Modify: `backend/app/scheduler.py`

- [ ] **Step 1: scheduler.py 수정**

```python
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
```

- [ ] **Step 2: 임포트 테스트**

```bash
cd backend && C:\Users\ACE\AppData\Local\Programs\Python\Python311\python.exe -c "from app.scheduler import start_scheduler; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/scheduler.py
git commit -m "feat: daily warming after data collection in scheduler"
```

---

## Task 4: Frontend — api.ts에 fetchCurrentPrice, fetchStatus 추가

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: api.ts 끝에 추가**

```typescript
export interface WarmingStatus {
  warming: boolean;
  cached_count: number;
  total: number;
  last_warmed_at: string | null;
}

export async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/history/${ticker}?days=1`, {
      next: { revalidate: 300 }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const last = data.history?.[data.history.length - 1];
    return last?.close ?? null;
  } catch {
    return null;
  }
}

export async function fetchStatus(): Promise<WarmingStatus> {
  try {
    const res = await fetch(`${API_BASE}/status`, { cache: "no-store" });
    if (!res.ok) return { warming: false, cached_count: 0, total: 0, last_warmed_at: null };
    return res.json();
  } catch {
    return { warming: false, cached_count: 0, total: 0, last_warmed_at: null };
  }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: fetchCurrentPrice and fetchStatus api helpers"
```

---

## Task 5: Frontend — WarmingBanner 컴포넌트

**Files:**
- Create: `frontend/components/WarmingBanner.tsx`

- [ ] **Step 1: WarmingBanner.tsx 작성**

```typescript
// frontend/components/WarmingBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { fetchStatus, WarmingStatus } from "@/lib/api";

export default function WarmingBanner() {
  const [status, setStatus] = useState<WarmingStatus | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function check() {
      const s = await fetchStatus();
      setStatus(s);
      if (!s.warming) clearInterval(interval);
    }

    check();
    interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!status?.warming) return null;

  const pct = status.total > 0
    ? Math.round((status.cached_count / status.total) * 100)
    : 0;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 mb-6 flex items-center gap-3">
      <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      <p className="text-sm text-slate-300">
        ⏳ 초기 분석 중...{" "}
        <span className="text-sky-400 font-semibold">
          {status.cached_count}/{status.total}
        </span>{" "}
        완료 ({pct}%) — 처음 실행 시 수 분 소요됩니다
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/WarmingBanner.tsx
git commit -m "feat: warming banner with progress indicator"
```

---

## Task 6: Frontend — PredictionSection 컴포넌트

**Files:**
- Create: `frontend/components/PredictionSection.tsx`

- [ ] **Step 1: PredictionSection.tsx 작성**

```typescript
// frontend/components/PredictionSection.tsx
import { fetchPrediction } from "@/lib/api";
import PredictionBadge from "./PredictionBadge";

interface Props {
  ticker: string;
}

export default async function PredictionSection({ ticker }: Props) {
  let data = null;
  try {
    data = await fetchPrediction(ticker);
  } catch {}

  if (!data) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-800">
        <p className="text-xs text-slate-500">예측 데이터 없음</p>
      </div>
    );
  }

  const debate = data.debate;
  const isUp = debate ? debate.direction === "UP" : data.prediction.week2.direction === "UP";
  const confidence = debate ? debate.confidence : data.prediction.week2.confidence;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold w-fit ${
        isUp
          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
          : "bg-red-950 text-red-400 border border-red-800"
      }`}>
        <span>{isUp ? "📈" : "📉"}</span>
        <span>{isUp ? "상승" : "하락"}</span>
        <span className="text-xs opacity-70">{confidence}%</span>
      </div>

      {debate?.summary && (
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {debate.summary}
        </p>
      )}

      <div className="flex gap-4">
        <PredictionBadge label="2주 후" prediction={data.prediction.week2} />
        <PredictionBadge label="4주 후" prediction={data.prediction.week4} />
      </div>

      <div className="flex gap-3 text-xs text-slate-500 pt-1">
        {data.short_float_pct !== undefined && (
          <span>공매도 {data.short_float_pct.toFixed(1)}%</span>
        )}
        {data.order_flow?.is_accumulation && (
          <span className="text-amber-400">⚡ 매집</span>
        )}
        {data.order_flow && (
          <span>매수 {data.order_flow.buy_dominance_pct.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/PredictionSection.tsx
git commit -m "feat: async PredictionSection server component"
```

---

## Task 7: Frontend — StockCard 현재가 껍데기로 변경

**Files:**
- Modify: `frontend/components/StockCard.tsx`

- [ ] **Step 1: StockCard.tsx 전체 교체**

```typescript
// frontend/components/StockCard.tsx
import Link from "next/link";
import { Suspense } from "react";
import PredictionSection from "./PredictionSection";

interface Props {
  ticker: string;
  currentPrice: number | null;
}

function PredictionSkeleton() {
  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
        <span>분석 중...</span>
      </div>
      <div className="h-3 bg-slate-800 rounded animate-pulse w-3/4" />
      <div className="h-3 bg-slate-800 rounded animate-pulse w-1/2" />
    </div>
  );
}

export default function StockCard({ ticker, currentPrice }: Props) {
  return (
    <Link href={`/stock/${ticker}`}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors cursor-pointer h-full">
        <div className="mb-1">
          <h2 className="text-lg font-bold text-white">{ticker}</h2>
          <p className="text-slate-400 text-sm">
            {currentPrice != null ? `$${currentPrice.toLocaleString()}` : "—"}
          </p>
        </div>
        <Suspense fallback={<PredictionSkeleton />}>
          <PredictionSection ticker={ticker} />
        </Suspense>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/StockCard.tsx
git commit -m "feat: StockCard split into price shell + async prediction"
```

---

## Task 8: Frontend — page.tsx Suspense 구조 + WarmingBanner

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

```typescript
// frontend/app/page.tsx
import { fetchStockList, fetchCurrentPrice } from "@/lib/api";
import StockCard from "@/components/StockCard";
import WarmingBanner from "@/components/WarmingBanner";

async function StockCardWithPrice({ ticker }: { ticker: string }) {
  const currentPrice = await fetchCurrentPrice(ticker);
  return <StockCard ticker={ticker} currentPrice={currentPrice} />;
}

export default async function DashboardPage() {
  let tickers: string[] = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
    "META", "TSLA", "AVGO", "COST", "NFLX"
  ];
  try {
    const list = await fetchStockList();
    tickers = list.tickers;
  } catch {}

  return (
    <div>
      <WarmingBanner />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">종목 예측 현황</h2>
        <span className="text-sm text-slate-500">{tickers.length}개 종목</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tickers.slice(0, 12).map(ticker => (
          <StockCardWithPrice key={ticker} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: dashboard with warming banner and per-card suspense loading"
```

---

## 전체 검증

```bash
# 백엔드 시작
cd backend && C:\Users\ACE\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn app.main:app --reload

# 다른 터미널에서 확인
curl http://localhost:8000/health
curl http://localhost:8000/status
```

Expected:
- `/health` → `{"status":"ok"}`
- `/status` → `{"warming": true/false, "cached_count": N, "total": 10, ...}`
