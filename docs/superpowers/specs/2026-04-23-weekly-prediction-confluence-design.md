# Weekly Prediction Restructure: Event-Grounded + Structural Confluence

## Goal
현재 주차별 예측(week1~4)은 전부 같은 XGBoost 모델이 같은 피처로 훈련되어, 주차별 독립적인 근거가 없고 "4주 후 $X"라는 허위 정밀도만 제시한다.

이를 **이벤트 기반 예측(week1/2) + 구조적 확증(week3/4) + confluence 종합**의 3층 구조로 재설계하여:
- **1~2주 예측은 확정된 미래 이벤트(실적·FOMC·CPI·NFP)를 근거로 제시** (근거 확보)
- **3~4주는 독립적인 구조적 시그널로 단기 예측을 확증**하는 레이어로 역할 변경 (멀티 타임프레임 confluence)
- **점 예측(price target) 대신 확률 + 범위**로 불확실성을 구조적으로 노출 (허위 정밀도 제거)

## Non-Goals
- XGBoost 자체 재설계는 하지 않음 (week1/2는 기존 모델 유지, 이벤트 피처는 프롬프트 주입으로 해결)
- 섹터 동종업체 이벤트(옵션 d) 및 배당락/옵션 만기(옵션 c)는 이번 스콥 제외. b(거시 이벤트)까지만.
- 주 단위보다 긴 호라이즌(월/분기) 예측 추가 없음

## Architecture Overview

```
┌───────────────────────────────────────────────┐
│  Confluence 배지 + 설명 (최상단)               │
│  "4/4 일치 → 강한 매수" + AI 한 문단 설명      │
└───────────────────────────────────────────────┘
┌──────────────────┐  ┌───────────────────────┐
│ Week 1/2         │  │ Week 3/4              │
│ (이벤트 예측)     │  │ (구조적 확증)          │
│                  │  │                       │
│ XGBoost + 이벤트  │  │ 독립적 신호 가중합    │
│ price_target O   │  │ probability + range   │
│                  │  │ price_target 없음     │
└──────────────────┘  └───────────────────────┘
       ▲                       ▲
       │                       │
 이벤트 캘린더        구조적 시그널 6종
 (실적/FOMC/CPI/NFP)  (주간 MA, 52w, 매크로 레짐 등)
```

### 층별 역할 분리

| 층 | 입력 신호 | 출력 | 역할 |
|---|---------|------|------|
| Week 1/2 | 기존 일간 피처 + **확정된 미래 이벤트** | direction, confidence, price_target, price_low/high | 단기 예측 |
| Week 3/4 | 주간/중기 구조 시그널 6종 (일간 피처와 독립) | direction, up_probability %, range_low, range_high | 추세 확증 |
| Confluence | week1/2/3/4 방향 비교 | aligned_count, badge, 설명 | 종합 판정 보정 |

신호 소스가 **겹치지 않아야** confluence가 의미 있음. 겹치면 같은 데이터의 4중 복제.

---

## Component 1: Event Calendar (신규)

### 1.1 데이터 소스
**파일:** `backend/app/collectors/event_calendar.py` (신규)

정적 날짜 리스트 기반. 외부 API 호출 없음 (단순성, 안정성).

```python
# FOMC 정례회의 2026년 (Fed 공개)
FOMC_DATES = [
    "2026-01-27", "2026-01-28",  # 2일 회의
    "2026-03-17", "2026-03-18",
    "2026-04-28", "2026-04-29",
    "2026-06-09", "2026-06-10",
    "2026-07-28", "2026-07-29",
    "2026-09-15", "2026-09-16",
    "2026-11-03", "2026-11-04",
    "2026-12-15", "2026-12-16",
]

# CPI 발표일 (매월 둘째 주 수요일경, BLS 캘린더)
CPI_DATES = [
    "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-15",
    "2026-05-13", "2026-06-10", "2026-07-15", "2026-08-12",
    "2026-09-09", "2026-10-14", "2026-11-12", "2026-12-10",
]

# NFP (Non-Farm Payrolls, 매월 첫 금요일)
NFP_DATES = [
    "2026-01-02", "2026-02-06", "2026-03-06", "2026-04-03",
    "2026-05-01", "2026-06-05", "2026-07-02", "2026-08-07",
    "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
]
```

실제 날짜는 구현 시점에 각 공식 소스에서 검증하여 확정. 연말에 2027년 리스트 추가하는 소규모 유지보수 필요 (1년 1회).

### 1.2 조회 API

```python
def upcoming_events(days_ahead: int = 14) -> list[dict]:
    """오늘부터 N일 이내 예정된 거시 이벤트 반환.
    Returns: [
      {"type": "FOMC", "date": "2026-04-28", "days_until": 5},
      {"type": "CPI",  "date": "2026-05-13", "days_until": 20},
    ]
    """
```

기본 `days_ahead=14` (2주 이내). 각 종목 실적 날짜(`earnings.next_date`)는 이미 수집되므로 병합만.

### 1.3 페르소나 프롬프트 주입
**수정 파일:** `backend/app/debate/engine.py`

`build_debate_context`에 이벤트 섹션 추가:

```
=== 향후 2주 예정 이벤트 ===
- {ticker} 실적: 5월 3일 (D-10)
- FOMC 회의: 4월 28~29일 (D-5, 2일 회의)
- CPI 발표: 5월 13일 (D-20, 윈도우 밖)
(해당 없으면 "예정 이벤트 없음")
```

페르소나 프롬프트에 추가:
> "이벤트가 1~2주 내 있으면, 해당 주의 변동성/방향성에 대한 근거를 반드시 포함하라. 특히 실적 D-7 이내면 서프라이즈 시나리오 언급, FOMC D-10 이내면 포지셔닝 구간 언급."

이로써 GPT가 week1/2별로 다른 이벤트 근거를 생성할 수 있다 ("week1은 CPI 결과 의존, week2는 FOMC 포지셔닝 구간").

---

## Component 2: Structural Signals (신규, Week 3/4용)

### 2.1 시그널 6종
**파일:** `backend/app/features/structural.py` (신규)

일간 피처와 **독립적인** 중기/구조적 시그널 6개를 계산. 각 시그널은 **-1.0 ~ +1.0** 범위의 정규화 점수 (UP 기여 +, DOWN 기여 -).

| # | 시그널 | 계산 방법 | 근거 |
|---|--------|----------|------|
| 1 | `weekly_trend` | 일봉 5년 데이터를 weekly resample → weekly MA5/MA20 cross 방향 | 주간 추세 = 중기 관점 |
| 2 | `range_position` | `(current - low_52w) / (high_52w - low_52w) * 2 - 1` | 고점 근처(+1)는 과열, 저점 근처(-1)는 반등 여력 |
| 3 | `mid_momentum` | 60일/120일 가격 변화율 평균 → tanh 정규화 | 중기 방향성 |
| 4 | `macro_regime` | VIX/10Y/DXY 조합: risk-on(+1, VIX<20 & yield 안정) / risk-off(-1) 분류 | 전체 시장 레짐 |
| 5 | `analyst_consensus` | `analyst.upside_pct / 30`으로 정규화 (±30% 기준 ±1.0 clip) | 이미 수집 중 |
| 6 | `institutional_flow` | `institutional.total_pct` 45% 기준 편차 + `insider.net_shares_90d` 부호 | 스마트머니 흐름 |

### 2.2 Week 3/4 예측 계산

단순 가중합 (ML 모델 훈련 없음). 가중치는 해석 가능성 우선:

```python
WEIGHTS = {
    "weekly_trend": 0.25,
    "range_position": -0.15,  # 고점 근처면 하방 압력(역가중)
    "mid_momentum": 0.20,
    "macro_regime": 0.20,
    "analyst_consensus": 0.10,
    "institutional_flow": 0.10,
}

def compute_structural_prediction(signals: dict, current_price: float, week: int) -> dict:
    score = sum(signals[k] * w for k, w in WEIGHTS.items())  # -1.0 ~ +1.0
    up_probability = round(50 + score * 30, 1)  # 20% ~ 80% 범위로 clip
    direction = "UP" if score >= 0 else "DOWN"
    # 범위 폭은 주차에 따라 확장 (불확실성 반영)
    range_pct = 0.06 if week == 3 else 0.08  # ±6% / ±8%
    return {
        "direction": direction,
        "up_probability": up_probability,
        "range_low": round(current_price * (1 - range_pct), 2),
        "range_high": round(current_price * (1 + range_pct), 2),
    }
```

`price_target` (point)은 제외. "3주 후 정확히 얼마"라는 허위 정밀도 제거.

### 2.3 기존 ML 모델 처리

[trainer.py:18](backend/app/ml/trainer.py#L18) `WEEKS`를 `[1, 2]`로 축소하여 week3/4 XGBoost 모델 학습·저장·로드를 완전히 제거한다. `/app/data/models/` 의 기존 `*_week3.json`, `*_week4.json` 파일은 구현 시점에 일괄 삭제 (사용 경로가 없어지므로 dead state).

`/predict` 응답의 week3/4 자리엔 `compute_structural_prediction` 결과를 그대로 넣는다 (포맷은 4.1 참조).

---

## Component 3: Confluence Layer (신규)

### 3.1 단순 계산

```python
def compute_confluence(w1, w2, w3, w4) -> dict:
    dirs = [w1["direction"], w2["direction"], w3["direction"], w4["direction"]]
    up = dirs.count("UP")
    down = dirs.count("DOWN")
    aligned = max(up, down)  # 4주 × 2방향이므로 aligned ∈ {2, 3, 4}
    majority = "UP" if up >= down else "DOWN"

    if aligned == 4:
        badge, tone = "강한 확증", "strong"
    elif aligned == 3:
        badge, tone = "대체로 일치", "moderate"
    else:  # aligned == 2, 2-2 split
        badge, tone = "혼조 — 되돌림 경계", "mixed"

    return {
        "aligned_count": aligned,
        "total": 4,
        "majority_direction": majority,
        "badge": badge,
        "tone": tone,
        "per_week": dirs,
    }
```

`tone`은 UI 색상 매핑 키로 쓰인다 (5.1 참조).

### 3.2 AI 설명 페르소나 (신규)
**파일:** `backend/app/debate/orchestrator.py` 수정, `personas.py`에 신규 추가

`CONFLUENCE_EXPLAINER` 페르소나:

```python
CONFLUENCE_EXPLAINER = {
    "id": "confluence",
    "role": "통합 분석가",
    "system": """You are integrating short-term (week 1-2) and structural (week 3-4)
predictions. Given each week's direction and the confluence tone, explain in 1 Korean
paragraph WHY they align or diverge.

If aligned: name the event-based short-term driver AND the structural factor that supports it.
If diverged: explain the likely scenario (e.g., "단기 반등 후 구조적 약세로 회귀")

Respond ONLY with this JSON:
{"explanation": "한 문단. 2~3문장."}
"""
}
```

Judge 호출 전 단계에서 1번 호출. `debate.confluence.explanation`에 저장.

GPT 비용 추가 = 종목당 1 call/주 (주간 캐시 그대로), 10종목 = 주당 10 call 추가. 미미.

---

## Component 4: API Response Schema

### 4.1 변경된 `PredictionResult.prediction`

```typescript
// 기존
prediction: {
  week1: { direction, confidence, price_target, price_low, price_high },
  week2: { direction, confidence, price_target, price_low, price_high },
  week3: { direction, confidence, price_target, price_low, price_high },  // 제거
  week4: { direction, confidence, price_target, price_low, price_high },  // 제거
}

// 변경 후
prediction: {
  week1: { direction, confidence, price_target, price_low, price_high },  // 유지
  week2: { direction, confidence, price_target, price_low, price_high },  // 유지
  week3: { direction, up_probability, range_low, range_high },            // 신규 포맷
  week4: { direction, up_probability, range_low, range_high },            // 신규 포맷
}
```

### 4.2 신규 최상위 필드

```typescript
confluence: {
  aligned_count: 3,
  total: 4,
  majority_direction: "UP" | "DOWN",
  badge: "강한 확증" | "대체로 일치" | "혼조 — 되돌림 경계",
  tone: "strong" | "moderate" | "mixed",
  per_week: ["UP", "UP", "UP", "DOWN"],
  explanation: "단기 이벤트(실적 D-5)와 주간 추세 모두 상승을 지지하나...",
}

upcoming_events: [
  { type: "FOMC", date: "2026-04-28", days_until: 5 },
  { type: "earnings", date: "2026-05-03", days_until: 10, ticker: "AAPL" },
]
```

### 4.3 프론트 타입 업데이트
**파일:** `frontend/lib/api.ts`

`WeekPrediction`을 union type으로:

```typescript
export interface WeekPredictionPoint {
  direction: "UP" | "DOWN";
  confidence: number;
  price_target: number;
  price_low: number;
  price_high: number;
}

export interface WeekPredictionRange {
  direction: "UP" | "DOWN";
  up_probability: number;
  range_low: number;
  range_high: number;
}

export interface PredictionBlock {
  week1: WeekPredictionPoint;
  week2: WeekPredictionPoint;
  week3: WeekPredictionRange;
  week4: WeekPredictionRange;
}
```

---

## Component 5: UI Changes

### 5.1 메인 카드 (`PredictionSection.tsx`)

기존 verdict 배지 옆에 **confluence 배지** 병기:

```
[매수 76%] [4/4 일치 ✓]  +8.2% 2W
```

`tone`에 따라 색상:
- `strong` → 녹색 체크
- `moderate` → 연두
- `mixed` → 주황 (경계)

### 5.2 상세 페이지 — WeeklyCards 분리

**파일:** `frontend/components/WeeklyCards.tsx` 수정

Week 1/2 섹션 ("단기 예측"):
- 기존 스타일 유지 (price_target 큼지막하게)
- "이벤트 근거" 뱃지 (있으면) — "FOMC D-5"

Week 3/4 섹션 ("구조적 확증"):
- 다른 시각적 스타일 — 점 타겟 없음
- 범위 바 그래프 (range_low~range_high 시각화)
- 상단에 "UP 확률 65%" 큰 숫자
- "이건 가격 예측이 아닌 추세 확증입니다" 설명 툴팁

### 5.3 Confluence 섹션 (상세 페이지 신규)

헤더 직하단에 새 섹션:

```
┌─────────────────────────────────────────────┐
│  📊 주차별 방향 종합                         │
│  [UP][UP][UP][DOWN]  → 3/4 일치              │
│                                              │
│  단기 이벤트(실적 D-5)와 주간 추세 모두      │
│  상승을 지지하나, 4주차에는 52주 고점        │
│  근처로 기술적 과열 신호. 2주 내 차익실현    │
│  주의.                                       │
└─────────────────────────────────────────────┘
```

---

## Component 6: Caching / Performance

**주간 캐시 유지** ([predict.py:46](backend/app/routers/predict.py#L46)): confluence 설명이 종목당 1 GPT 호출 추가되지만 주 1회라 미미.

**구조적 시그널 계산**은 순수 pandas 연산 (GPT/외부 API 호출 0) → 빠름, 캐시 불필요.

**이벤트 캘린더 조회**는 정적 리스트라 I/O 없음.

---

## Implementation Order

의존성 고려한 순차:

1. **Event calendar 모듈** — `collectors/event_calendar.py` + `upcoming_events()` 함수 + 테스트
2. **Structural signals 모듈** — `features/structural.py` + 6 시그널 계산 + 테스트
3. **Predictor 통합** — `predict.py`에서 week3/4를 structural 결과로 교체, API 응답 구조 변경
4. **Confluence 계산** — `compute_confluence()` + API 응답에 confluence 필드 추가
5. **Confluence 설명 페르소나** — `personas.py` + orchestrator 통합
6. **Week1/2 이벤트 주입** — `debate/engine.py`의 프롬프트 context에 upcoming_events 추가
7. **프론트 타입 업데이트** — `api.ts` union type
8. **WeeklyCards 분리 렌더** — week3/4 다른 시각 스타일
9. **메인 카드 confluence 배지** — `PredictionSection.tsx`
10. **상세 페이지 confluence 섹션** — 신규 컴포넌트

각 단계는 이전에 의존하지만, 1~2는 병렬, 3 이후는 순차.

## Validation / Testing

- **Unit**: event_calendar 날짜 파싱, structural signals 개별 계산, confluence 매핑 규칙
- **Integration**: `/predict/AAPL` 응답 구조 스냅샷 비교 (기존 계약 안 깨지는지) — week3/4 필드 key 변경이 프론트 breaking change이므로 반드시 양쪽 동시 배포
- **UI**: 4/4 일치, 3/4 일치, 2/2 혼조, 전환 신호 4가지 시나리오에 대한 수동 눈검수
- **Smoke**: 10종목 워밍 후 응답 전수 확인 — 이벤트 캘린더 주입이 페르소나 응답에 실제 반영되는지

## Open Risks / Mitigations

- **R1. 이벤트 날짜 하드코딩의 유지보수 부담** — 2026년은 현재 스펙에 확정, 2027년 연말에 1회 리스트 추가 필요. README/CLAUDE.md에 유지보수 노트 남김.
- **R2. 구조적 가중치 튜닝 부재** — 초기 가중치(WEIGHTS)는 heuristic. 배포 후 백테스트 기능 추가하여 주차별 히트율 측정 시 재조정.
- **R3. UI 정보 과잉** — 4주 예측 + confluence + 이벤트 태그로 시각 복잡도 상승. 5.2/5.3 구현 시 실물 눈검수로 단계적 조정.
- **R4. 2/2 혼조가 기본값이 될 수도** — 구조적 시그널이 단기와 자주 상충하면 "혼조" 배지만 반복적으로 노출될 위험. 배포 후 10종목 × 수주 데이터 보고 가중치(WEIGHTS) 재조정 또는 aligned 3 판정 완화 여부 판단.
