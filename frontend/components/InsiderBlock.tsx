import type { InsiderData } from "@/lib/api";

/* ─── Insider ─────────────────────────────────────────────────────── */
export default function InsiderBlock({ insider }: { insider: InsiderData }) {
  const net = insider.net_shares_90d;
  const c = net > 0 ? "var(--up)" : net < 0 ? "var(--down)" : "var(--text-3)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: c }}>
          {net > 0 ? "순매수" : net < 0 ? "순매도" : "중립"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
          {net > 0 ? "+" : ""}{net.toLocaleString()}주
        </span>
      </div>
      {insider.recent.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            color: t.type === "매수" ? "var(--up)" : "var(--down)",
            background: t.type === "매수" ? "var(--up-bg)" : "var(--down-bg)",
          }}>{t.type}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{t.date}</span>
          <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.insider}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>{t.shares.toLocaleString()}주</span>
          {t.value > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              ${(t.value / 1e6).toFixed(1)}M
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
