import { fetchPrediction } from "@/lib/api";
import { formatRelativeTime, stalenessLevel } from "@/lib/time";
import ConfluenceBadge from "./ConfluenceBadge";

interface Props { ticker: string; }

export default async function PredictionSection({ ticker }: Props) {
  let data = null;
  try { data = await fetchPrediction(ticker); } catch {}

  if (!data) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>예측 대기 중</p>
    );
  }

  const debate = data.debate;
  const v = debate?.verdict;
  const isBuy  = v === "매수";
  const isSell = v === "매도";
  const confidence = debate ? debate.confidence : data.prediction.week2.confidence;

  // Week2 change %
  const w2 = data.prediction.week2 ?? data.prediction.week1;
  const changePct = w2 ? ((w2.price_target - data.current_price) / data.current_price * 100) : null;
  const isUp = w2?.direction === "UP";

  const verdictColor = isBuy ? "var(--up)" : isSell ? "var(--down)" : "#f5a623";
  const verdictBg = isBuy ? "rgba(45,212,160,0.1)" : isSell ? "rgba(240,104,104,0.1)" : "rgba(245,166,35,0.08)";
  const verdictBorder = isBuy ? "rgba(45,212,160,0.25)" : isSell ? "rgba(240,104,104,0.25)" : "rgba(245,166,35,0.2)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Verdict + confidence + 2W change */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {v ? (
          <span style={{
            fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em",
            color: verdictColor,
            background: verdictBg,
            border: `1px solid ${verdictBorder}`,
            borderRadius: 5,
            padding: "2px 8px",
          }}>
            {v} {confidence}%
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: isUp ? "var(--up)" : "var(--down)" }}>
            {isUp ? "상승" : "하락"} {confidence}%
          </span>
        )}
        {changePct !== null && (
          <>
            <div style={{ height: 12, width: 1, background: "var(--border)" }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
              color: isUp ? "var(--up)" : "var(--down)",
            }}>
              {isUp ? "+" : ""}{changePct.toFixed(1)}%
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>2W</span>
          </>
        )}
        {data.confluence && <ConfluenceBadge confluence={data.confluence} size="sm" />}
      </div>

      {/* Summary (truncated) */}
      {debate?.summary && (
        <p style={{
          fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, margin: 0,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {debate.summary}
        </p>
      )}

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {data.short_float_pct !== undefined && data.short_float_pct > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
            공매도 {data.short_float_pct.toFixed(1)}%
          </span>
        )}
        {data.order_flow?.is_accumulation && (
          <span style={{ fontSize: 10, color: "var(--up)" }}>매집</span>
        )}
        {data.predicted_at && (() => {
          const s = stalenessLevel(data.predicted_at);
          const color = s === "fresh" ? "var(--text-3)" : s === "stale" ? "#f5a623" : "var(--down)";
          return (
            <span
              suppressHydrationWarning
              title={new Date(data.predicted_at).toLocaleString("ko-KR")}
              style={{ fontSize: 10, color, marginLeft: "auto" }}
            >
              {formatRelativeTime(data.predicted_at)}
            </span>
          );
        })()}
      </div>
    </div>
  );
}
