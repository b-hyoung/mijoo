/* ─── Direction Probability Bar ──────────────────────────────────── */

export default function DirectionBar({ direction, confidence, verdict }: {
  direction: "UP" | "DOWN";
  confidence: number;
  verdict?: string;
}) {
  const upPct = direction === "UP" ? confidence : 100 - confidence;
  const downPct = 100 - upPct;
  const dominant = upPct >= downPct ? "up" : "down";

  return (
    <div style={{ marginTop: 16, padding: "16px 20px", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)" }}>
      {/* Labels + numbers */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "4px 12px", borderRadius: 6,
          background: dominant === "up" ? "rgba(45,212,160,0.12)" : "transparent",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--up)" }}>▲ 상승</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 900, color: "var(--up)",
          }}>{upPct}%</span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "4px 12px", borderRadius: 6,
          background: dominant === "down" ? "rgba(240,104,104,0.12)" : "transparent",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 900, color: "var(--down)",
          }}>{downPct}%</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--down)" }}>하락 ▼</span>
        </div>
      </div>

      {/* Bar */}
      <div style={{
        display: "flex", height: 12, borderRadius: 6, overflow: "hidden",
        background: "var(--border)",
      }}>
        <div style={{
          width: `${upPct}%`,
          background: dominant === "up" ? "var(--up)" : "rgba(45,212,160,0.3)",
          transition: "width 0.3s ease",
          borderRadius: upPct > 95 ? "6px" : "6px 0 0 6px",
        }} />
        <div style={{
          width: `${downPct}%`,
          background: dominant === "down" ? "var(--down)" : "rgba(240,104,104,0.3)",
          transition: "width 0.3s ease",
          borderRadius: downPct > 95 ? "6px" : "0 6px 6px 0",
        }} />
      </div>
    </div>
  );
}
