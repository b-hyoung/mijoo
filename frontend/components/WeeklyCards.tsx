/* ─── Weekly Cards ────────────────────────────────────────────────── */

import type {
  PredictionResult,
  WeekPredictionPoint,
  WeekPredictionRange,
} from "@/lib/api";

interface Props {
  prediction: PredictionResult["prediction"];
  currentPrice: number;
}

function PointCard({
  label, week, currentPrice, borderRight,
}: { label: string; week: WeekPredictionPoint; currentPrice: number; borderRight: boolean }) {
  const isUp = week.direction === "UP";
  const changePct = ((week.price_target - currentPrice) / currentPrice) * 100;
  const color = isUp ? "var(--up)" : "var(--down)";
  return (
    <div style={{
      background: "var(--surface)",
      padding: "14px 14px 12px",
      borderRight: borderRight ? "1px solid var(--border)" : "none",
    }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.1em" }}>{label}</span>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {isUp ? "+" : ""}{changePct.toFixed(1)}%
        </span>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)", display: "block", marginTop: 6 }}>
        ${week.price_target.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", display: "block", marginTop: 3 }}>
        ${week.price_low.toLocaleString()} – ${week.price_high.toLocaleString()}
      </span>
    </div>
  );
}

function RangeCard({
  label, week, currentPrice, borderRight,
}: { label: string; week: WeekPredictionRange; currentPrice: number; borderRight: boolean }) {
  const isUp = week.direction === "UP";
  const color = isUp ? "var(--up)" : "var(--down)";
  const pos = Math.max(0, Math.min(1, (currentPrice - week.range_low) / (week.range_high - week.range_low)));
  return (
    <div
      title="구조적 확증: 개별 가격 예측이 아니라 중기 추세 확인 신호입니다."
      style={{
        background: "rgba(255,255,255,0.02)",
        padding: "14px 14px 12px",
        borderRight: borderRight ? "1px solid var(--border)" : "none",
      }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.1em" }}>
        {label} <span style={{ opacity: 0.6, fontWeight: 500 }}>(확증)</span>
      </span>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {isUp ? "↑" : "↓"} {week.up_probability.toFixed(0)}%
        </span>
      </div>
      <div style={{ position: "relative", height: 5, background: "var(--border)",
                    borderRadius: 3, marginTop: 10 }}>
        <div style={{
          position: "absolute", left: `${pos * 100}%`, top: -3,
          width: 2, height: 11, background: color,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between",
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: "var(--text-3)", marginTop: 4 }}>
        <span>${week.range_low.toFixed(2)}</span>
        <span>${week.range_high.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function WeeklyCards({ prediction, currentPrice }: Props) {
  return (
    <div className="grid-4-col" style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
      borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)",
    }}>
      <PointCard label="1W" week={prediction.week1} currentPrice={currentPrice} borderRight />
      <PointCard label="2W" week={prediction.week2} currentPrice={currentPrice} borderRight />
      <RangeCard label="3W" week={prediction.week3} currentPrice={currentPrice} borderRight />
      <RangeCard label="4W" week={prediction.week4} currentPrice={currentPrice} borderRight={false} />
    </div>
  );
}
