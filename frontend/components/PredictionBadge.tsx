import { WeekPrediction, isPointPrediction } from "@/lib/api";

interface Props {
  label: string;
  prediction: WeekPrediction;
  currentPrice?: number;
}

export default function PredictionBadge({ label, prediction, currentPrice }: Props) {
  const isUp = prediction.direction === "UP";
  const isPoint = isPointPrediction(prediction);

  const changePct = isPoint && currentPrice
    ? ((prediction.price_target - currentPrice) / currentPrice * 100)
    : null;

  const target = isPoint ? prediction.price_target : null;
  const low = isPoint ? prediction.price_low : prediction.range_low;
  const high = isPoint ? prediction.price_high : prediction.range_high;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}{!isPoint && " (확증)"}
      </span>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 10px", borderRadius: 6,
        background: isUp ? "var(--up-bg)" : "var(--down-bg)",
        border: `1px solid ${isUp ? "var(--up-border)" : "var(--down-border)"}`,
        width: "fit-content",
      }}>
        <span style={{ fontSize: 12, color: isUp ? "var(--up)" : "var(--down)" }}>
          {isUp ? "▲" : "▼"}
        </span>
        {changePct !== null ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: isUp ? "var(--up)" : "var(--down)", fontVariantNumeric: "tabular-nums" }}>
            {isUp ? "+" : ""}{changePct.toFixed(1)}%
          </span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: isUp ? "var(--up)" : "var(--down)" }}>
            {isPoint ? (isUp ? "상승" : "하락") : `${isUp ? "상승" : "하락"} ${prediction.up_probability.toFixed(0)}%`}
          </span>
        )}
        {target != null && (
          <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
            → ${target.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
        ${low.toLocaleString()} – ${high.toLocaleString()}
      </span>
    </div>
  );
}
