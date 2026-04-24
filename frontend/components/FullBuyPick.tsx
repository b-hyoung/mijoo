import { fetchAccuracy, fetchPrediction, fetchStockList } from "@/lib/api";

/**
 * "풀매수 / 풀매도 드가자" 재미용 픽. 기반:
 *  - debate.verdict + debate.confidence  (근거 레이어)
 *  - confluence.tone / aligned_count      (근거 레이어)
 *  - 과거 적중률 hit_rate                 (근거 레이어)
 *
 * 감성은 문구에서만.
 */

type TradingPlan = {
  entryWhen: string;        // "지금 바로" | "이벤트 후" | "다음 주 초"
  entryPrice: number;
  targetPrice: number;
  targetPct: number;
  targetHorizonWeeks: number;
  stopPrice: number;
  stopPct: number;
  keyEvent: string | null;  // "실적 D-5" 등
};

type Candidate = {
  ticker: string;
  verdict: string;
  confidence: number;
  tone: string;
  aligned: number;
  hitRate: number;
  score: number;
  reasons: string[];
  plan: TradingPlan | null;
};

const BUY_TAGLINES = [
  "드가자!!! 🚀",
  "이거 안 사면 배 아픔 😤",
  "풀매수 타이밍 🔥",
  "ALL IN",
  "지금 안 사면 나중에 후회 ㄹㅇ",
];

const SELL_TAGLINES = [
  "탈출하세요 🏃",
  "풀매도 드가자 💸",
  "손절 각 ⚠️",
  "지금이라도 내리세요",
  "불난 집 구경 🔥",
];

function pickTag(seed: string, pool: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

async function gatherCandidates(): Promise<Candidate[]> {
  let tickers: string[] = [];
  try {
    const list = await fetchStockList();
    tickers = list.tickers;
  } catch {
    return [];
  }

  const accuracy = await fetchAccuracy();
  const hitMap = new Map<string, number>();
  accuracy?.tickers.forEach(t => hitMap.set(t.ticker, t.hit_rate));

  const results: Candidate[] = [];
  for (const ticker of tickers) {
    try {
      const p = await fetchPrediction(ticker);
      const debate = p.debate;
      if (!debate) continue;
      const verdict = debate.verdict || "관망";
      const confidence = debate.confidence || 0;
      const tone = p.confluence?.tone || "mixed";
      const aligned = p.confluence?.aligned_count || 0;
      const hitRate = hitMap.get(ticker) ?? 0.5;

      // 점수 (근거 기반)
      //  - verdict 매수/매도 → 큰 가중
      //  - confidence 높을수록
      //  - confluence strong → 보너스
      //  - 과거 hit_rate 높을수록
      let score = 0;
      if (verdict === "매수") score += 30;
      else if (verdict === "매도") score -= 30;
      score += (confidence - 50) * 0.6;  // 50% 중립
      if (tone === "strong") score += aligned * 3;
      else if (tone === "moderate") score += aligned;
      score += (hitRate - 0.5) * 30;

      const reasons: string[] = [];
      reasons.push(`${verdict} ${confidence}%`);
      reasons.push(`${aligned}/4 일치`);
      reasons.push(`최근 적중률 ${Math.round(hitRate * 100)}%`);

      // Trading plan (buy/sell 양쪽에서 쓰임)
      let plan: TradingPlan | null = null;
      const w1 = p.prediction.week1;
      const w2 = p.prediction.week2;
      const currentPrice = p.current_price;
      if (w1 && w2 && currentPrice) {
        // Key event within next 10 days (events list already sorted by days_until)
        const events = p.upcoming_events || [];
        const nearEvent = events.find(e => e.days_until <= 10);
        const keyEvent = nearEvent
          ? `${nearEvent.type === "earnings" ? "실적" : nearEvent.type} D-${nearEvent.days_until}`
          : null;

        // Entry timing
        let entryWhen = "지금 바로";
        if (nearEvent) {
          if (nearEvent.type === "earnings" && nearEvent.days_until <= 7) {
            entryWhen = "실적 발표 후";
          } else if ((nearEvent.type === "FOMC" || nearEvent.type === "CPI") && nearEvent.days_until <= 3) {
            entryWhen = "이벤트 발표 후";
          }
        }

        // Target: week2 가격 타겟 (2주 지평)
        const targetPrice = w2.price_target;
        const targetPct = ((targetPrice - currentPrice) / currentPrice) * 100;

        // Stop: week1 price_low가 가장 가까운 지지선, 또는 현재가 -3%
        const stopCandidate = Math.max(w1.price_low, currentPrice * 0.97);
        const stopPct = ((stopCandidate - currentPrice) / currentPrice) * 100;

        plan = {
          entryWhen,
          entryPrice: currentPrice,
          targetPrice: Math.round(targetPrice * 100) / 100,
          targetPct: Math.round(targetPct * 10) / 10,
          targetHorizonWeeks: 2,
          stopPrice: Math.round(stopCandidate * 100) / 100,
          stopPct: Math.round(stopPct * 10) / 10,
          keyEvent,
        };
      }

      results.push({
        ticker,
        verdict,
        confidence,
        tone,
        aligned,
        hitRate,
        score,
        reasons,
        plan,
      });
    } catch {
      // skip
    }
  }

  return results;
}

function PickCard({
  side, c, tagline,
}: { side: "buy" | "sell"; c: Candidate; tagline: string }) {
  const isBuy = side === "buy";
  const color = isBuy ? "var(--up)" : "var(--down)";
  const bg = isBuy ? "rgba(45,212,160,0.08)" : "rgba(240,104,104,0.08)";
  const border = isBuy ? "rgba(45,212,160,0.25)" : "rgba(240,104,104,0.22)";
  const label = isBuy ? "오늘의 풀매수" : "오늘의 풀매도";
  const icon = isBuy ? "🚀" : "💸";

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 12, padding: "14px 18px",
      display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)",
                       letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {icon} {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <a href={`/stock/${c.ticker}`} style={{
          fontSize: 28, fontWeight: 900, color,
          letterSpacing: "-0.03em", textDecoration: "none",
        }}>
          {c.ticker}
        </a>
        <span style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: "-0.01em" }}>
          {tagline}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {c.reasons.map((r, i) => (
          <span key={i} style={{
            fontSize: 11, color: "var(--text-2)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 4, padding: "2px 8px",
            fontFamily: "var(--font-mono)",
          }}>
            {r}
          </span>
        ))}
      </div>

      {c.plan && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: `1px dashed ${border}`,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "var(--text-3)",
            letterSpacing: "0.06em", marginBottom: 2,
          }}>
            📋 매매 플랜 (재미용)
          </div>
          <PlanRow
            icon={isBuy ? "🟢" : "🔴"}
            label={isBuy ? "진입" : "청산"}
            value={c.plan.entryWhen}
            sub={`현재 $${c.plan.entryPrice.toFixed(2)}`}
          />
          <PlanRow
            icon="🎯"
            label={isBuy ? "목표" : "예상 하단"}
            value={`${c.plan.targetHorizonWeeks}주 뒤 $${c.plan.targetPrice.toFixed(2)}`}
            sub={`${c.plan.targetPct >= 0 ? "+" : ""}${c.plan.targetPct.toFixed(1)}%`}
            subColor={c.plan.targetPct >= 0 ? "var(--up)" : "var(--down)"}
          />
          {isBuy && (
            <PlanRow
              icon="🛑"
              label="손절"
              value={`$${c.plan.stopPrice.toFixed(2)}`}
              sub={`${c.plan.stopPct.toFixed(1)}%`}
              subColor="var(--down)"
            />
          )}
          {c.plan.keyEvent && (
            <PlanRow
              icon="📅"
              label="주의"
              value={c.plan.keyEvent}
              sub={c.plan.entryWhen !== "지금 바로" ? "이벤트 후 재평가" : "변동성 대비"}
              subColor="var(--text-3)"
            />
          )}
        </div>
      )}
    </div>
  );
}

function PlanRow({ icon, label, value, sub, subColor = "var(--text-3)" }: {
  icon: string; label: string; value: string; sub?: string; subColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
      <span style={{ flex: "0 0 auto" }}>{icon}</span>
      <span style={{
        flex: "0 0 auto", width: 42,
        color: "var(--text-3)", fontSize: 11,
      }}>
        {label}
      </span>
      <span style={{ flex: "1 1 auto", color: "var(--text)", fontWeight: 600, minWidth: 0 }}>
        {value}
      </span>
      {sub && (
        <span style={{
          flex: "0 0 auto",
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: subColor, fontWeight: 700,
        }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export default async function FullBuyPick() {
  const candidates = await gatherCandidates();
  if (candidates.length === 0) return null;

  const sortedDesc = [...candidates].sort((a, b) => b.score - a.score);
  const sortedAsc  = [...candidates].sort((a, b) => a.score - b.score);

  const buy = sortedDesc[0];
  const sell = sortedAsc[0];

  // buy가 실제 매수 시그널이어야 하고, sell이 실제 매도/약한 시그널이어야 함
  const showBuy = buy && buy.score > 10;
  const showSell = sell && sell.score < -5;

  if (!showBuy && !showSell) return null;

  const buyTag = buy ? pickTag(buy.ticker, BUY_TAGLINES) : "";
  const sellTag = sell ? pickTag(sell.ticker, SELL_TAGLINES) : "";

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: showBuy && showSell ? "1fr 1fr" : "1fr",
        gap: 12,
      }} className="grid-2-col-mobile">
        {showBuy && <PickCard side="buy" c={buy} tagline={buyTag} />}
        {showSell && <PickCard side="sell" c={sell} tagline={sellTag} />}
      </div>
      <p style={{
        margin: "6px 4px 0", fontSize: 10, color: "var(--text-3)",
        letterSpacing: "-0.01em",
      }}>
        ※ 재미용 픽입니다 — 근거는 AI 판정 + 4주 방향 일치도 + 과거 적중률 기반이지만,
        진짜 풀매수/풀매도는 <b>본인 책임</b>이에요.
      </p>
    </div>
  );
}
