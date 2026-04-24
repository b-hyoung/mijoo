import type { PredictionResult } from "./api";

export type BattleRow = {
  /** 카테고리 헤더용 label */
  category: string;
  /** 항목 이름 (표 왼쪽) */
  metric: string;
  /** 왼쪽 티커 값 (표시용) */
  leftText: string;
  /** 오른쪽 티커 값 (표시용) */
  rightText: string;
  /** 왼쪽 점수 */
  leftScore: number;
  /** 오른쪽 점수 */
  rightScore: number;
  /** 0 이면 동률, >0 left 우세, <0 right 우세 */
  winner: "left" | "right" | "tie";
  /** 보조 설명 (툴팁) */
  note?: string;
};

export type BattleProfile = {
  ticker: string;
  currentPrice: number;
  verdict: string;
  confidence: number;
  prediction: PredictionResult;
  hitRate: number;
};

const DEFAULT_HIT = 0.5;

function safe<T>(v: T | null | undefined, fallback: T): T {
  return v == null ? fallback : v;
}

function row(
  category: string,
  metric: string,
  leftVal: number, leftText: string,
  rightVal: number, rightText: string,
  invert = false,
  note?: string,
): BattleRow {
  // 높을수록 좋은 지표면 그대로, 낮을수록 좋은 지표면 invert
  const L = invert ? -leftVal : leftVal;
  const R = invert ? -rightVal : rightVal;
  const diff = L - R;
  let winner: "left" | "right" | "tie";
  if (Math.abs(diff) < 1e-6) winner = "tie";
  else winner = diff > 0 ? "left" : "right";
  // 점수로 변환 (우세면 +1, 열세면 0, 동률 +0.5)
  const leftScore = winner === "left" ? 1 : winner === "tie" ? 0.5 : 0;
  const rightScore = winner === "right" ? 1 : winner === "tie" ? 0.5 : 0;
  return { category, metric, leftText, rightText, leftScore, rightScore, winner, note };
}

function flagRow(
  category: string,
  metric: string,
  leftFlag: boolean, leftText: string,
  rightFlag: boolean, rightText: string,
  note?: string,
): BattleRow {
  return row(category, metric, leftFlag ? 1 : 0, leftText, rightFlag ? 1 : 0, rightText, false, note);
}

function fmtPct(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
}

function verdictScore(v: string, conf: number): number {
  if (v === "매수") return conf;
  if (v === "매도") return -conf;
  return 0;
}

export function compareTickers(left: BattleProfile, right: BattleProfile): { rows: BattleRow[]; leftTotal: number; rightTotal: number } {
  const rows: BattleRow[] = [];
  const L = left.prediction;
  const R = right.prediction;

  // ─── AI 판정 ──────────────────────────────
  rows.push(row(
    "AI 판정", "판정 + 신뢰도",
    verdictScore(left.verdict, left.confidence), `${left.verdict} ${left.confidence}%`,
    verdictScore(right.verdict, right.confidence), `${right.verdict} ${right.confidence}%`,
  ));
  rows.push(row(
    "AI 판정", "방향 일치 (4주 중)",
    safe(L.confluence?.aligned_count, 0), `${safe(L.confluence?.aligned_count, 0)}/4`,
    safe(R.confluence?.aligned_count, 0), `${safe(R.confluence?.aligned_count, 0)}/4`,
  ));
  rows.push(row(
    "AI 판정", "과거 적중률",
    left.hitRate, `${Math.round(left.hitRate * 100)}%`,
    right.hitRate, `${Math.round(right.hitRate * 100)}%`,
  ));

  // ─── 예측 여력 ──────────────────────────────
  const lw2 = L.prediction.week2;
  const rw2 = R.prediction.week2;
  const lw2pct = lw2 ? ((lw2.price_target - L.current_price) / L.current_price) * 100 : 0;
  const rw2pct = rw2 ? ((rw2.price_target - R.current_price) / R.current_price) * 100 : 0;
  rows.push(row(
    "예측 여력", "2주 목표 수익률",
    lw2pct, fmtPct(lw2pct),
    rw2pct, fmtPct(rw2pct),
  ));

  const lUpside = safe(L.analyst?.upside_pct, 0);
  const rUpside = safe(R.analyst?.upside_pct, 0);
  rows.push(row(
    "예측 여력", "애널리스트 Upside",
    lUpside, `${lUpside.toFixed(1)}%`,
    rUpside, `${rUpside.toFixed(1)}%`,
    false,
    `${L.analyst?.num_analysts || "?"}명 / ${R.analyst?.num_analysts || "?"}명`,
  ));

  // ─── 기술적 지표 ──────────────────────────────
  const lRsi = safe(L.signals?.rsi, 50);
  const rRsi = safe(R.signals?.rsi, 50);
  // RSI는 중간(50)에 가까울수록 중립. 과매도(30 이하) 반등 여력은 좋지만 사도 될 만큼 아닌 경우도. 단순히 "20~55" 구간은 매수에 유리하다고 가정
  const lRsiScore = lRsi < 30 ? 2 : lRsi < 55 ? 1 : lRsi > 70 ? -2 : 0;
  const rRsiScore = rRsi < 30 ? 2 : rRsi < 55 ? 1 : rRsi > 70 ? -2 : 0;
  rows.push(row(
    "기술적", "RSI",
    lRsiScore, `${lRsi.toFixed(0)} ${lRsi < 30 ? "(과매도)" : lRsi > 70 ? "(과매수)" : ""}`,
    rRsiScore, `${rRsi.toFixed(0)} ${rRsi < 30 ? "(과매도)" : rRsi > 70 ? "(과매수)" : ""}`,
  ));
  rows.push(flagRow(
    "기술적", "MACD",
    L.signals?.macd_cross === "BULLISH", L.signals?.macd_cross === "BULLISH" ? "골든크로스" : "데드크로스",
    R.signals?.macd_cross === "BULLISH", R.signals?.macd_cross === "BULLISH" ? "골든크로스" : "데드크로스",
  ));
  rows.push(flagRow(
    "기술적", "이동평균 추세",
    L.signals?.ma_trend === "BULLISH", L.signals?.ma_trend === "BULLISH" ? "상승" : "하락",
    R.signals?.ma_trend === "BULLISH", R.signals?.ma_trend === "BULLISH" ? "상승" : "하락",
  ));

  // 주간 추세 (structural_signals)
  const findSig = (p: PredictionResult, key: string): number => {
    const rows = p.confluence?.structural_signals?.rows ?? [];
    const found = rows.find(r => r.key === key);
    return found?.value ?? 0;
  };
  const lWeekly = findSig(L, "weekly_trend");
  const rWeekly = findSig(R, "weekly_trend");
  rows.push(row(
    "기술적", "주간 추세",
    lWeekly, lWeekly > 0.3 ? "강한 상승" : lWeekly > 0 ? "상승" : lWeekly > -0.3 ? "약한 하락" : "하락",
    rWeekly, rWeekly > 0.3 ? "강한 상승" : rWeekly > 0 ? "상승" : rWeekly > -0.3 ? "약한 하락" : "하락",
  ));
  const lRange = findSig(L, "range_position");
  const rRange = findSig(R, "range_position");
  // 52주 위치는 중간이 좋음 (너무 고점이면 과열, 너무 저점이면 약세) → 중간(0) 가까울수록 점수 높게
  const lRangeScore = -Math.abs(lRange); // 중간(0)일수록 0, 양끝일수록 -1
  const rRangeScore = -Math.abs(rRange);
  rows.push(row(
    "기술적", "52주 위치",
    lRangeScore, lRange > 0.7 ? "고점 근처" : lRange < -0.7 ? "저점 근처" : "중간대",
    rRangeScore, rRange > 0.7 ? "고점 근처" : rRange < -0.7 ? "저점 근처" : "중간대",
  ));

  // 중기 모멘텀
  const lMid = findSig(L, "mid_momentum");
  const rMid = findSig(R, "mid_momentum");
  rows.push(row(
    "기술적", "중기 모멘텀",
    lMid, lMid > 0.3 ? "강한 상승" : lMid > 0 ? "상승" : "하락",
    rMid, rMid > 0.3 ? "강한 상승" : rMid > 0 ? "상승" : "하락",
  ));

  // ─── 옵션 / 스마트머니 ──────────────────────────────
  const lPc = L.options?.pc_ratio;
  const rPc = R.options?.pc_ratio;
  if (lPc != null && rPc != null) {
    // P/C는 낮을수록 콜 우세 = 매수자에게 유리 (invert)
    rows.push(row(
      "옵션/흐름", "P/C 비율",
      lPc, `${lPc.toFixed(2)} ${lPc < 0.5 ? "(콜 우세)" : lPc > 1.0 ? "(풋 우세)" : ""}`,
      rPc, `${rPc.toFixed(2)} ${rPc < 0.5 ? "(콜 우세)" : rPc > 1.0 ? "(풋 우세)" : ""}`,
      true,
    ));
  }
  const lIv = L.options?.iv_rank;
  const rIv = R.options?.iv_rank;
  if (lIv != null && rIv != null) {
    // IV rank 낮으면 옵션이 "싸다"는 의미 (50 기준, 낮을수록 유리)
    rows.push(row(
      "옵션/흐름", "IV rank",
      lIv, `${lIv}% ${lIv < 30 ? "(옵션 싸)" : lIv > 70 ? "(큰 변동 예상)" : ""}`,
      rIv, `${rIv}% ${rIv < 30 ? "(옵션 싸)" : rIv > 70 ? "(큰 변동 예상)" : ""}`,
      true,
    ));
  }
  // Buy dominance (order flow)
  const lBuy = safe(L.order_flow?.buy_dominance_pct, 50);
  const rBuy = safe(R.order_flow?.buy_dominance_pct, 50);
  rows.push(row(
    "옵션/흐름", "매수 비중",
    lBuy, `${lBuy.toFixed(0)}%`,
    rBuy, `${rBuy.toFixed(0)}%`,
  ));
  rows.push(flagRow(
    "옵션/흐름", "매집 감지",
    !!L.order_flow?.is_accumulation, L.order_flow?.is_accumulation ? "감지" : "없음",
    !!R.order_flow?.is_accumulation, R.order_flow?.is_accumulation ? "감지" : "없음",
  ));

  // ─── 펀더멘털 ──────────────────────────────
  const lInsider = safe(L.insider?.net_shares_90d, 0);
  const rInsider = safe(R.insider?.net_shares_90d, 0);
  rows.push(row(
    "펀더멘털", "내부자 90일 순매수",
    lInsider, `${lInsider >= 0 ? "+" : ""}${lInsider.toLocaleString()}주`,
    rInsider, `${rInsider >= 0 ? "+" : ""}${rInsider.toLocaleString()}주`,
  ));
  const lInst = safe(L.institutional?.total_pct, null);
  const rInst = safe(R.institutional?.total_pct, null);
  if (lInst != null && rInst != null) {
    rows.push(row(
      "펀더멘털", "기관 보유 비중",
      lInst, `${lInst.toFixed(1)}%`,
      rInst, `${rInst.toFixed(1)}%`,
    ));
  }

  // 실적 시즌 이벤트 (가까울수록 risky — invert)
  const lEd = L.earnings?.days_until;
  const rEd = R.earnings?.days_until;
  if (lEd != null && rEd != null) {
    // 7일 이내 실적은 risk factor → 먼 쪽이 유리 (invert)
    const lScoreDays = lEd <= 7 ? -1 : 1;
    const rScoreDays = rEd <= 7 ? -1 : 1;
    rows.push(row(
      "이벤트", "실적까지 남은 일수",
      lScoreDays, `D-${lEd}${lEd <= 7 ? " (임박)" : ""}`,
      rScoreDays, `D-${rEd}${rEd <= 7 ? " (임박)" : ""}`,
    ));
  }

  // 지난 실적 EPS 비트 연속 (earnings.history)
  const beats = (p: PredictionResult): number => {
    const h = p.earnings?.history ?? [];
    let streak = 0;
    for (const q of h) {
      if ((q.eps_surprise_pct ?? 0) > 0) streak++;
      else break;
    }
    return streak;
  };
  const lBeats = beats(L);
  const rBeats = beats(R);
  rows.push(row(
    "이벤트", "실적 연속 EPS 비트",
    lBeats, `${lBeats}분기`,
    rBeats, `${rBeats}분기`,
  ));

  // ─── 감정/심리 ──────────────────────────────
  const lSent = safe(L.sentiment_score, 0);
  const rSent = safe(R.sentiment_score, 0);
  rows.push(row(
    "감정/심리", "뉴스 감정 점수",
    lSent, lSent.toFixed(2),
    rSent, rSent.toFixed(2),
  ));
  const lShort = safe(L.short_float_pct, 0);
  const rShort = safe(R.short_float_pct, 0);
  // 공매도 높은 건 스퀴즈 가능성 (약한 긍정). 높을수록 +
  rows.push(row(
    "감정/심리", "공매도 비중",
    lShort, `${lShort.toFixed(1)}%`,
    rShort, `${rShort.toFixed(1)}%`,
  ));
  // Anomaly
  const lAnom = safe(L.anomaly?.score, 0);
  const rAnom = safe(R.anomaly?.score, 0);
  const lAnomScore = (L.anomaly?.direction === "UP" ? 1 : -1) * lAnom;
  const rAnomScore = (R.anomaly?.direction === "UP" ? 1 : -1) * rAnom;
  rows.push(row(
    "감정/심리", "이상징후 스코어",
    lAnomScore, lAnom > 0 ? `${lAnom} ${L.anomaly?.direction ?? ""}` : "없음",
    rAnomScore, rAnom > 0 ? `${rAnom} ${R.anomaly?.direction ?? ""}` : "없음",
  ));

  const leftTotal = rows.reduce((s, r) => s + r.leftScore, 0);
  const rightTotal = rows.reduce((s, r) => s + r.rightScore, 0);
  return { rows, leftTotal, rightTotal };
}
