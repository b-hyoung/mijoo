# Enhanced Data Sources for Stock Prediction

## Goal
기존 6개 데이터 소스에 매크로 지표, 옵션 데이터, 실적 캘린더, 뉴스 확대, 이상 징후 엔진을 추가하여 예측 정확도와 근거 다양성을 대폭 개선한다.

## Architecture Overview
B+C 하이브리드 접근법: Phase별 순차 진행하되, 각 Phase 완료 시 바로 효과 체감 가능.

```
Phase 1: 매크로 (VIX, 금리, DXY) — ML 피처 + 토론 + UI
Phase 2: 옵션 + 이상징후 + 실적캘린더 — 연계되므로 함께
Phase 3: 뉴스 30일 확대 + 중요도 필터 — 독립적
```

---

## Phase 1: 매크로 지표

### 데이터 수집
**파일:** `backend/app/collectors/macro_collector.py`

3개 지표를 yfinance에서 5년 일별 데이터로 수집:
- **VIX** (`^VIX`) — 공포지수. 30+ 시장 불안
- **10Y 국채 금리** (`^TNX`) — 성장주 할인율. 상승 시 나스닥 압박
- **달러 인덱스** (`DX-Y.NYB`) — 강달러 시 해외매출 비중 큰 종목 불리

```python
def fetch_macro_history(period: str = "5y") -> pd.DataFrame:
    """VIX, 10Y Treasury, DXY를 5년 일별로 가져온다.
    Returns: DataFrame with columns [vix, treasury_10y, dxy], indexed by date.
    주말/공휴일 빈 날은 ffill로 직전 값 채움."""

def fetch_macro_latest() -> dict:
    """당일 매크로 값 + 20일 변화율.
    Returns: {
        vix, vix_20d_change,
        treasury_10y, treasury_10y_20d_change,
        dxy, dxy_20d_change
    }"""
```

### ML 피처 확장
**파일:** `backend/app/ml/trainer.py` 수정

FEATURE_COLS 11개 → 17개:
```python
# 기존 11개
"ma5", "ma20", "ma60", "rsi", "macd", "macd_signal",
"bb_upper", "bb_lower", "volume_ratio", "obv", "sentiment"

# 매크로 +6개
"vix", "vix_20d_change",
"treasury_10y", "treasury_10y_20d_change",
"dxy", "dxy_20d_change"
```

가격 DataFrame에 매크로 DataFrame을 날짜 기준 left join. 주말 빈 값은 ffill.

### 토론 컨텍스트
**파일:** `backend/app/debate/engine.py` 수정

`build_context()`에 매크로 섹션 추가:
```
MACRO ENVIRONMENT:
- VIX: 18.5 (20-day change: -12.3%) — Market calm
- 10Y Treasury: 4.32% (20-day change: +5.1%) — Rising pressure on growth stocks
- Dollar Index: 104.2 (20-day change: +1.8%) — Strong dollar
```

### 페르소나
**파일:** `backend/app/debate/personas.py` 전면 교체

8개(도메인×bull/bear) → 5개(역할 기반):

| ID | 역할 | 입력 데이터 |
|---|---|---|
| `fundamental` | 펀더멘털 분석가 | 실적, 애널리스트 목표가, 내부자, 기관 보유 |
| `technical` | 테크니컬 분석가 | RSI, MACD, MA, 볼린저, 거래량, OBV |
| `macro` | 매크로 전략가 | VIX, 10Y금리, DXY, 변화율 |
| `options` | 옵션 트레이더 | P/C ratio, IV rank, 이상거래 |
| `risk` | 리스크 매니저 | 공매도, 이상징후 점수, 어닝 임박 여부 |

각 페르소나 출력 형식:
```json
{
  "direction": "UP",
  "confidence": 72,
  "argument": "근거 3줄 (한국어)"
}
```

bull/bear 사전 배정 없음. 각자 자기 영역 데이터를 보고 솔직하게 방향+신뢰도 판단.

### UI
상세 페이지에 매크로 지표 리스트 추가 (기술적 신호 아래):
```
VIX     18.5   ▼ -12.3% (20일)     안정
10Y금리  4.32%  ▲ +5.1% (20일)     상승 압박
DXY     104.2  ▲ +1.8% (20일)     강달러
```

### API 응답
`GET /predict/{ticker}` 응답에 `macro` 필드 추가:
```json
"macro": {
  "vix": 18.5,
  "vix_20d_change": -12.3,
  "treasury_10y": 4.32,
  "treasury_10y_20d_change": 5.1,
  "dxy": 104.2,
  "dxy_20d_change": 1.8
}
```

### 모델 재학습
기존 11피처 모델과 호환 안 됨. Phase 1 배포 시:
1. `/app/data/models/` 전체 삭제
2. `predictions` 테이블 클리어
3. 서버 재시작 → warming이 17피처로 전체 재학습

---

## Phase 2: 옵션 + 이상징후 + 실적 캘린더

### 2-A: 실적 캘린더

**파일:** `backend/app/collectors/earnings_collector.py`

```python
def fetch_earnings_data(ticker: str) -> dict:
    """다음 어닝 날짜 + 최근 4분기 EPS/매출 서프라이즈.
    Returns: {
        next_date: "2026-04-25",
        days_until: 16,
        history: [
            {
                quarter: "Q1 2026",
                eps_expected: 0.82, eps_actual: 0.92, eps_surprise_pct: 12.2,
                revenue_expected: 38.1e9, revenue_actual: 39.2e9, revenue_surprise_pct: 2.9
            },
            ... (최근 4분기)
        ]
    }"""
```

데이터 소스: `yf.Ticker(ticker).calendar` (다음 어닝), `yf.Ticker(ticker).earnings_history` (과거 서프라이즈).

beat/miss 판정: EPS와 매출 둘 다 기준. 가이던스는 뉴스 30일 필터에서 간접 반영.

토론 반영:
- 어닝 7일 이내 → 컨텍스트에 "⚠ 어닝 임박" 경고
- 어닝 직후 3일 이내 → 서프라이즈 방향 반영
- 연속 beat 4분기+ → 긍정 가중치

### 2-B: 옵션 데이터

**파일:** `backend/app/collectors/options_collector.py`

```python
def fetch_options_data(ticker: str, earnings_date: str | None = None) -> dict:
    """옵션 체인에서 P/C ratio, IV rank, 이상 거래 추출.
    
    만기 선택 로직 (B+C 하이브리드):
    - 어닝 30일 이내 & 어닝 직후 만기 존재 → 어닝 만기 사용
    - 그 외 → 최근 만기 + 월물(30일 뒤) 평균
    
    Returns: {
        pc_ratio: 0.28,
        iv_rank: 92,
        unusual_activity: 12.3,
        unusual_side: "CALL",
        data_source: "earnings" | "nearest+monthly",
        expiry_used: "2026-04-25"
    }"""
```

피처 계산:
- `pc_ratio`: 선택된 만기의 총 풋 거래량 ÷ 총 콜 거래량
- `iv_rank`: 현재 ATM IV를 HV(20일 역사적 변동성) 대비 비율로 계산. IV/HV > 1.5이면 고IV. 0~100 스케일로 정규화 (HV는 가격 데이터에서 계산 가능, 별도 API 불필요)
- `unusual_activity`: 개별 행사가 중 평소 대비 최대 거래량 배수
- `unusual_side`: 이상 거래가 콜인지 풋인지

옵션은 ML 피처에 넣지 않음. 이상징후 엔진 + 옵션 트레이더 페르소나 전용.

### 2-C: 이상 징후 엔진

**파일:** `backend/app/anomaly.py` (신규)

```python
def calculate_anomaly_score(
    price_df: pd.DataFrame,
    options_data: dict,
    insider_data: dict,
    institutional_data: dict,
    order_flow: dict
) -> dict:
    """6개 신호를 체크하여 0~100 이상징후 점수 + 방향 산출.
    
    Returns: {
        score: 72,
        direction: "UP",
        level: "주의",         # 0~30 정상, 31~50 관심, 51~70 주의, 71~100 경고
        signals: [
            { name: "콜옵션 이상 거래", score: 20, direction: "UP", detail: "평소 대비 12.3x" },
            { name: "IV 급등", score: 20, direction: "UP", detail: "IV rank 92%" },
            ...
        ]
    }"""
```

신호별 점수 및 방향 로직:

| 신호 | 최대 점수 | 발동 조건 | ▲ 상승 | ▼ 하락 |
|------|----------|----------|--------|--------|
| 거래량 급증 + 횡보 | 25 | 20일 가격변동 < 3% + 거래량 1.5x+ | 매수 우위 > 55% | 매도 우위 > 55% |
| 옵션 IV 급등 | 20 | IV rank 80%+ | 콜 IV > 풋 IV | 풋 IV > 콜 IV |
| 옵션 이상 거래 | 20 | 특정 행사가 평소 대비 10x+ | 콜 쪽 폭증 | 풋 쪽 폭증 |
| 내부자 방향 전환 | 15 | 직전 분기 대비 순매수↔순매도 전환 | 순매도→순매수 | 순매수→순매도 |
| 기관 보유 급변 | 10 | 분기 change_pct > 10% | +10% 이상 증가 | -10% 이상 감소 |
| P/C ratio 극단 | 10 | 0.3 이하 또는 1.5 이상 | 0.3 이하 (콜 과열) | 1.5 이상 (풋 과열) |

최종 방향: 각 발동된 신호의 (점수 × 방향)을 합산. UP 합 > DOWN 합이면 "UP".

UI 표시: score 31+ 일 때만 카드 표시. 0~30은 정상이므로 숨김.

### UI 추가

**이상징후 카드** (AI 요약 바로 아래, 31점 이상일 때만):
```
⚠ 이상 징후 72점 ▲ 상승 압력
━━━━━━━━━━━━━━━━━━━━━━━━━
콜옵션 이상 거래 (평소 12x)        +20
IV rank 92% (어닝 임박)           +20
거래량 1.8x + 매수 우위 58%       +25
P/C ratio 0.28                    +10
```

**옵션 현황** (기술적 신호 아래):
```
P/C Ratio   0.28    극단적 낙관
IV Rank     92%     상위 8% (변동 임박)
이상 거래    12.3x   콜옵션 쪽
만기 기준    4/25 (어닝 직후)
```

**어닝 캘린더** (사이드바):
```
다음 어닝: 4/25 (16일 후)
Q1 '26  EPS +12% beat  매출 +2.9% beat
Q4 '25  EPS +8% beat   매출 +4.9% beat
Q3 '25  EPS +15% beat  매출 -1.0% miss
Q2 '25  EPS +22% beat  매출 +7.0% beat
```

### API 응답 추가 필드
```json
"options": {
  "pc_ratio": 0.28,
  "iv_rank": 92,
  "unusual_activity": 12.3,
  "unusual_side": "CALL",
  "data_source": "earnings",
  "expiry_used": "2026-04-25"
},
"earnings": {
  "next_date": "2026-04-25",
  "days_until": 16,
  "history": [...]
},
"anomaly": {
  "score": 72,
  "direction": "UP",
  "level": "주의",
  "signals": [...]
}
```

---

## Phase 3: 뉴스 30일 확대 + 중요도 필터

### 수집 변경
**파일:** `backend/app/collectors/news_collector.py` 수정

- 기간: 7일 → 30일
- 최대 기사 수: 20 → 100

### B+C 필터 파이프라인

**Step 1: 키워드 사전 필터 (C)** — API 호출 0회, 즉시 처리

키워드 사전:
```python
IMPACT_KEYWORDS = {
    "earnings": ["earnings", "revenue", "EPS", "beat", "miss", "guidance", "outlook", "forecast", "profit", "loss"],
    "analyst": ["upgrade", "downgrade", "price target", "rating", "overweight", "underweight", "outperform"],
    "corporate": ["CEO", "layoff", "restructure", "merger", "acquisition", "buyback", "dividend", "split"],
    "regulatory": ["lawsuit", "SEC", "FDA", "antitrust", "investigation", "fine", "settlement", "ban"],
    "product": ["launch", "patent", "partnership", "contract", "deal", "AI", "chip", "release"],
    "crisis": ["recall", "hack", "breach", "bankruptcy", "default", "crash", "fraud"],
}
```

100개 → 키워드 매칭 → 30~40개로 축소.

**Step 2: GPT 정밀 필터 (B)** — 10개씩 나눠서 병렬

```python
# 30~40개를 10개씩 나눠서 gpt-4o-mini 병렬 호출 (3~4회)
# 각 기사에 영향도 "상/중/하" 분류
# "상" 등급만 추출 → 5~10개
```

프롬프트:
```
Rate each headline's impact on {ticker} stock price: 상(직접적 가격 영향), 중(간접 관련), 하(무관).
Respond with JSON: {"ratings": ["상", "하", "중", ...]}
```

### 토론 반영
필터된 "상" 등급 5~10개만 토론 컨텍스트에 투입 (기존 20개 무필터 대비 품질 향상).

### UI
- 주요 뉴스: "상" 등급만 한국어 요약 (기존과 동일, 근거 더 좋아짐)
- 전체 헤드라인: 키워드 필터 통과한 30~40개 표시 (하 등급 제외)

---

## 토론 엔진 변경 요약

### orchestrator.py 변경
기존: 8 페르소나 병렬 실행 → 밸런스 체크 → 소수파 재실행
변경: 5 페르소나 병렬 실행 → 밸런스 체크 불필요 (각자 독립 판단)

가중치 로직:
```python
weights = {
    "fundamental": 1.0,
    "technical": 1.0,
    "macro": 1.0,
    "options": 1.0,
    "risk": 1.0,
}
# 상황별 가중치 조정:
if earnings_days_until <= 7:   weights["fundamental"] += 0.5
if anomaly_score >= 50:        weights["risk"] += 0.5
if iv_rank >= 80:              weights["options"] += 0.5
if abs(vix_20d_change) > 20:   weights["macro"] += 0.5
```

### judge.py 변경
기존: bull 논거 vs bear 논거 종합
변경: 5명의 (방향, 신뢰도, 근거) + 가중치 → 종합 판정

Judge 프롬프트에 전달:
```
Analyst opinions:
1. 펀더멘털 분석가 [weight 1.0]: UP 72% — "근거..."
2. 테크니컬 분석가 [weight 1.0]: DOWN 61% — "근거..."
3. 매크로 전략가 [weight 1.5]: DOWN 68% — "근거..."  (VIX 급변으로 가중)
4. 옵션 트레이더 [weight 1.5]: UP 80% — "근거..."  (IV 급등으로 가중)
5. 리스크 매니저 [weight 1.5]: DOWN 55% — "근거..."  (이상징후 50+로 가중)

Synthesize into final verdict considering weights.
```

---

## API 응답 전체 구조 (변경 후)

```json
{
  "ticker": "NVDA",
  "current_price": 182.08,
  "sentiment_score": 0.7,
  "short_float_pct": 0.98,
  "order_flow": { "buy_dominance_pct": 47.8, "obv_trend": "DOWN", "is_accumulation": false },
  "news_headlines": ["..."],
  "signals": { "rsi": 54.6, "macd_cross": "BULLISH", "ma_trend": "BULLISH", "bb_position": 73, "volume_ratio": 1.05 },
  "analyst": { "target_mean": 268.22, "upside_pct": 47.3, "recommendation": "strong_buy", "num_analysts": 56, "..." },
  "insider": { "recent": [...], "net_shares_90d": -1207012 },
  "institutional": { "top_holders": [...], "total_pct": null },

  "macro": {
    "vix": 18.5, "vix_20d_change": -12.3,
    "treasury_10y": 4.32, "treasury_10y_20d_change": 5.1,
    "dxy": 104.2, "dxy_20d_change": 1.8
  },
  "options": {
    "pc_ratio": 0.28, "iv_rank": 92,
    "unusual_activity": 12.3, "unusual_side": "CALL",
    "data_source": "earnings", "expiry_used": "2026-04-25"
  },
  "earnings": {
    "next_date": "2026-04-25", "days_until": 16,
    "history": [
      { "quarter": "Q1 2026", "eps_expected": 0.82, "eps_actual": 0.92, "eps_surprise_pct": 12.2, "revenue_expected": 38.1, "revenue_actual": 39.2, "revenue_surprise_pct": 2.9 }
    ]
  },
  "anomaly": {
    "score": 72, "direction": "UP", "level": "주의",
    "signals": [
      { "name": "콜옵션 이상 거래", "score": 20, "direction": "UP", "detail": "평소 대비 12.3x" }
    ]
  },

  "prediction": { "week1": {...}, "week2": {...}, "week3": {...}, "week4": {...} },
  "debate": {
    "direction": "UP", "confidence": 68, "verdict": "매수",
    "summary": "...", "bull_points": [...], "bear_points": [...],
    "weekly_outlook": {...}, "key_news": [...],
    "personas": [
      { "id": "fundamental", "role": "펀더멘털 분석가", "direction": "UP", "confidence": 72, "argument": "..." },
      { "id": "technical", "role": "테크니컬 분석가", "direction": "DOWN", "confidence": 61, "argument": "..." },
      { "id": "macro", "role": "매크로 전략가", "direction": "DOWN", "confidence": 68, "argument": "..." },
      { "id": "options", "role": "옵션 트레이더", "direction": "UP", "confidence": 80, "argument": "..." },
      { "id": "risk", "role": "리스크 매니저", "direction": "DOWN", "confidence": 55, "argument": "..." }
    ]
  }
}
```

---

## 비용 영향

| 항목 | 현재 | 변경 후 |
|------|------|--------|
| GPT 호출 (예측 1회) | 8 페르소나(mini) + 1 judge(4o) + 1 outlook(mini) + 1 key_news(mini) = 11회 | 5 페르소나(mini) + 1 judge(4o) + 1 outlook(mini) + 1 key_news(mini) + 3~4 뉴스필터(mini) = 11~12회 |
| yfinance 호출 | 5회 (price, analyst, insider, institutional, short) | 8회 (+macro, options, earnings) |
| ML 학습 시간 | 종목당 3~5초 (11피처) | 종목당 4~6초 (17피처) |
| 전체 warming | ~60초 | ~80초 |

GPT 비용은 거의 동일 (페르소나 3개 줄고, 뉴스 필터 3~4개 늘어서 상쇄). yfinance는 무료.
