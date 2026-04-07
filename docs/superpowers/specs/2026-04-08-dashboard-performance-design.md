# 대시보드 성능 개선 설계 문서

**작성일:** 2026-04-08

---

## 문제

대시보드 첫 로드 시 캐시가 없으면 12개 종목 각각 30~60초 소요 → 사실상 타임아웃.

---

## 해결 방향

**A + C 조합:**
- 스케줄러가 예측을 미리 계산해 DB에 캐싱 (A)
- 카드별 Suspense로 현재가 먼저 표시 후 예측 비동기 로딩 (C)

---

## 구성 요소

### 1. Backend: 캐시 워밍

**startup 워밍:**
- `app/main.py` startup 이벤트에서 DB predictions 테이블이 비어있으면 백그라운드 스레드로 전 종목 예측 실행
- `warming_status` 전역 상태 관리 (`{"warming": bool, "cached_count": int, "total": int}`)

**스케줄러 워밍:**
- 기존 `daily_collect()` 이후 전 종목 예측 순차 계산 → DB 저장
- 매일 21:30 UTC (장 마감 후)

### 2. Backend: `/status` 엔드포인트

```
GET /status
→ {
    "warming": true/false,
    "cached_count": 5,
    "total": 10,
    "last_warmed_at": "2026-04-08T21:35:00Z"
  }
```

프론트가 워밍 진행 상황 폴링에 사용. 5초 간격 폴링, `warming: false`되면 중단.

### 3. Frontend: 카드 구조 분리

**현재가 카드 (즉시 렌더링):**
- `GET /history/{ticker}` 마지막 `close` 값 사용
- 티커명 + 현재가 즉시 표시
- 예측 영역은 Suspense boundary로 감싸기

**예측 영역 (비동기):**
- 캐시 있으면 즉시 채워짐
- 캐시 없으면: 현재가 표시된 카드에 스피너 + "분석 중..." 표시

### 4. Frontend: 워밍 배너

- `/status` 폴링으로 `warming: true`면 페이지 상단 배너 표시
  ```
  ⏳ 초기 분석 중... (5/10 완료) — 처음 실행 시 수 분 소요됩니다
  ```
- `warming: false`되면 배너 사라지고 카드 자동 갱신

---

## 데이터 흐름

```
앱 시작
  → DB predictions 비어있음?
    → YES: 백그라운드 워밍 시작 + warming_status = true
    → NO: 그냥 서빙

프론트 대시보드 로드
  → /status 폴링 시작
  → warming: true → 배너 표시
  → 각 카드: /history/{ticker} → 현재가 즉시 렌더
  → 각 카드 예측 영역: /predict/{ticker}
      → 캐시 있음 → 즉시 표시
      → 캐시 없음 → 스피너 + "분석 중..."

매일 21:30 UTC
  → 스케줄러: 전 종목 예측 재계산 → DB 갱신
```

---

## 범위 밖

- 실시간 WebSocket 업데이트
- 종목별 워밍 우선순위
- 워밍 실패 시 재시도 로직

---

## 파일 변경 목록

**Backend:**
- `app/main.py` — startup 워밍 + warming_status 전역 관리
- `app/scheduler.py` — daily_collect 이후 전 종목 예측 추가
- `app/routers/status.py` — 신규, `/status` 엔드포인트

**Frontend:**
- `app/page.tsx` — Suspense 구조로 변경
- `components/StockCard.tsx` — 현재가 카드 / 예측 영역 분리
- `components/PredictionSection.tsx` — 신규, 예측 비동기 로딩
- `components/WarmingBanner.tsx` — 신규, 워밍 상태 배너
- `lib/api.ts` — fetchCurrentPrice, fetchStatus 추가
