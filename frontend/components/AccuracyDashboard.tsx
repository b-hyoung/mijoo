import { fetchAccuracy } from "@/lib/api";

export default async function AccuracyDashboard() {
  const data = await fetchAccuracy();
  if (!data || data.overall.total === 0) return null;

  const { overall, tickers, window_days } = data;
  const pct = Math.round(overall.hit_rate * 100);
  const tone = pct >= 70 ? "strong" : pct >= 50 ? "moderate" : "weak";
  const toneColor =
    tone === "strong" ? "var(--up)" :
    tone === "moderate" ? "#f5a623" : "var(--down)";
  const toneBg =
    tone === "strong" ? "rgba(45,212,160,0.10)" :
    tone === "moderate" ? "rgba(245,166,35,0.08)" : "rgba(240,104,104,0.08)";

  // Sort tickers: hit rate desc, then by total
  const sorted = [...tickers].sort((a, b) => {
    if (b.hit_rate !== a.hit_rate) return b.hit_rate - a.hit_rate;
    return b.total - a.total;
  });

  return (
    <details style={{
      marginBottom: 24,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      <summary style={{
        cursor: "pointer", userSelect: "none",
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 14,
        listStyle: "none",
      }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: "var(--text)",
          letterSpacing: "-0.01em",
        }}>
          🎯 최근 {window_days}일 방향 적중률
        </span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
          color: toneColor, background: toneBg,
          border: `1px solid ${toneColor}40`,
          borderRadius: 6, padding: "2px 10px",
        }}>
          {pct}%
        </span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {overall.correct}/{overall.total}건
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>
          자세히 ▾
        </span>
      </summary>

      <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "80px 60px 60px 70px 1fr 80px",
          gap: 10, fontSize: 11, color: "var(--text-3)",
          fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase",
          paddingBottom: 8, borderBottom: "1px solid var(--border)",
        }}>
          <span>티커</span>
          <span style={{ textAlign: "right" }}>적중</span>
          <span style={{ textAlign: "right" }}>총</span>
          <span style={{ textAlign: "right" }}>적중률</span>
          <span>최근 5건</span>
          <span style={{ textAlign: "right" }}>현재가</span>
        </div>
        {sorted.map((t) => {
          const rate = Math.round(t.hit_rate * 100);
          const color =
            rate >= 70 ? "var(--up)" :
            rate >= 50 ? "#f5a623" : "var(--down)";
          return (
            <div key={t.ticker} style={{
              display: "grid",
              gridTemplateColumns: "80px 60px 60px 70px 1fr 80px",
              gap: 10, padding: "10px 0",
              borderBottom: "1px solid var(--border)",
              fontSize: 13, alignItems: "center",
            }}>
              <a href={`/stock/${t.ticker}/history`}
                 style={{ fontWeight: 700, color: "var(--text)",
                          textDecoration: "none" }}>
                {t.ticker}
              </a>
              <span style={{ fontFamily: "var(--font-mono)",
                             textAlign: "right", color: "var(--text-2)" }}>
                {t.correct}
              </span>
              <span style={{ fontFamily: "var(--font-mono)",
                             textAlign: "right", color: "var(--text-3)" }}>
                {t.total}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                             textAlign: "right", color }}>
                {rate}%
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {t.recent.map((r, i) => (
                  <span key={i}
                    title={`${r.date} · 예측 ${r.predicted_direction} · 실제 ${r.actual_direction}`}
                    style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: r.correct ? "var(--up)" : "var(--down)",
                      opacity: 0.85,
                    }}/>
                ))}
              </div>
              <span style={{ fontFamily: "var(--font-mono)",
                             textAlign: "right", fontSize: 12,
                             color: "var(--text-3)" }}>
                {t.current_price != null
                  ? `$${t.current_price.toFixed(2)}`
                  : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
