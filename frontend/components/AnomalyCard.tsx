import type { AnomalyData } from "@/lib/api";

/* ─── Anomaly Card ───────────────────────────────────────────────── */
export default function AnomalyCard({ anomaly }: { anomaly: AnomalyData }) {
  if (anomaly.score <= 30) return null;
  const isUp = anomaly.direction === "UP";
  const color = isUp ? "var(--up)" : anomaly.direction === "DOWN" ? "var(--down)" : "var(--text-2)";
  const bg = isUp ? "var(--up-bg)" : anomaly.direction === "DOWN" ? "var(--down-bg)" : "var(--surface-2)";
  const border = isUp ? "var(--up-border)" : anomaly.direction === "DOWN" ? "var(--down-border)" : "var(--border)";

  const triggered = anomaly.signals.filter(s => s.score > 0);

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            이상 징후 {anomaly.score}점
          </span>
          {anomaly.direction && (
            <span style={{ fontSize: 12, color }}>{isUp ? "▲ 상승" : "▼ 하락"} 압력</span>
          )}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{anomaly.level}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {triggered.map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "var(--text-2)" }}>{s.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{s.detail}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: s.direction === "UP" ? "var(--up)" : s.direction === "DOWN" ? "var(--down)" : "var(--text-3)" }}>+{s.score}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
