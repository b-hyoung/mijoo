import { fetchPredictionHistory, PredictionHistoryEntry, fetchCurrentPrice, WeekPrediction } from "@/lib/api";
import Link from "next/link";
import MissAnalysisButton from "@/components/MissAnalysisButton";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return iso.slice(0, 16);
  }
}

/** 경과 일수에 맞는 주차 + 예측 데이터 반환 */
function getRelevantWeek(entry: PredictionHistoryEntry, ageDays: number): {
  label: string;
  week: WeekPrediction | null;
  reached: boolean;  // 해당 주차 기간이 지났는지
} {
  if (ageDays >= 28) return { label: "4W", week: entry.week4, reached: true };
  if (ageDays >= 21) return { label: "3W", week: entry.week3, reached: true };
  if (ageDays >= 14) return { label: "2W", week: entry.week2, reached: true };
  if (ageDays >= 7)  return { label: "1W", week: entry.week1, reached: true };
  // 아직 1주도 안 지남
  return { label: "1W", week: entry.week1, reached: false };
}

const COL = "110px 72px 60px 80px 100px 100px 100px 1fr";

export async function generateStaticParams() {
  try {
    const { fetchStockList } = await import("@/lib/api");
    const list = await fetchStockList();
    return list.tickers.map((ticker) => ({ ticker }));
  } catch {
    return [{ ticker: "AAPL" }];
  }
}

export default async function HistoryPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const [history, currentPrice] = await Promise.all([
    fetchPredictionHistory(ticker, 30),
    fetchCurrentPrice(ticker),
  ]);

  // Count misses for this ticker based on current price comparison
  const missCount = currentPrice
    ? history.filter((h) => {
        if (!h.current_price_at_prediction) return false;
        const actualUp = currentPrice > h.current_price_at_prediction;
        const predictedUp = h.direction === "UP";
        return actualUp !== predictedUp;
      }).length
    : 0;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <Link href={`/stock/${ticker}`} style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none" }}>
            ← {ticker}
          </Link>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.03em" }}>
            예측 기록
          </h1>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
          {history.length}건
          {currentPrice && ` · 현재 $${currentPrice.toFixed(2)}`}
        </span>
      </div>

      {missCount > 0 && (
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            이 티커 {missCount}회 빗나감 —
          </span>
          <MissAnalysisButton ticker={ticker} missCount={missCount} />
        </div>
      )}

      {history.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--text-3)", padding: "40px 0", textAlign: "center" }}>
          예측이 쌓이면 여기에 표시됩니다.
        </p>
      ) : (
        <div>
          {/* Table header */}
          <div className="history-header" style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 8, padding: "10px 0",
            borderBottom: "1px solid var(--border)",
            fontSize: 12, color: "var(--text-3)", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span>시점</span>
            <span>판정</span>
            <span>신뢰</span>
            <span>주차</span>
            <span>예측</span>
            <span>당시가격</span>
            <span>현재가격</span>
            <span style={{ textAlign: "right" }}>결과</span>
          </div>

          {/* Rows */}
          {history.map((entry) => {
            const priceAt = entry.current_price_at_prediction;
            const ageDays = entry.age_hours / 24;
            const { label, week, reached } = getRelevantWeek(entry, ageDays);

            // price_target only exists on point predictions (week 1/2).
            // Range predictions (structural week 3/4) don't have a point target.
            const predChangePct = week && priceAt && "price_target" in week
              ? ((week.price_target - priceAt) / priceAt * 100)
              : null;

            const actualChangePct = priceAt && currentPrice
              ? ((currentPrice - priceAt) / priceAt * 100)
              : null;

            const predictedUp = week ? week.direction === "UP" : entry.direction === "UP";
            const actualUp = actualChangePct !== null ? actualChangePct > 0 : null;
            const isCorrect = reached && actualUp !== null ? predictedUp === actualUp : null;

            const verdictColor = entry.verdict === "매수" ? "var(--up)"
              : entry.verdict === "매도" ? "var(--down)"
              : "var(--text-3)";

            return (
              <div key={entry.id} className="history-row" style={{
                display: "grid", gridTemplateColumns: COL,
                gap: 8, padding: "14px 0",
                borderBottom: "1px solid var(--border)",
                alignItems: "center",
              }}>
                <span className="history-date" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                  {formatDate(entry.predicted_at)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: verdictColor }}>
                  {entry.verdict ?? "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                  {entry.confidence ?? "—"}%
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
                  {label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: predictedUp ? "var(--up)" : "var(--down)" }}>
                  {predChangePct !== null ? (predChangePct > 0 ? "+" : "") + predChangePct.toFixed(1) + "%" : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>
                  {priceAt ? `$${priceAt.toFixed(2)}` : "—"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>
                  {currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}
                </span>
                <div className="history-result" style={{ textAlign: "right" }}>
                  {!reached ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                      대기중 ({Math.ceil(7 - ageDays)}일 남음)
                    </span>
                  ) : actualChangePct !== null ? (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
                      color: isCorrect ? "var(--up)" : "var(--down)",
                    }}>
                      {actualChangePct > 0 ? "+" : ""}{actualChangePct.toFixed(1)}%
                      {" "}{isCorrect ? "적중" : "빗나감"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-3)" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
