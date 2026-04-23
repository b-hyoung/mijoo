import type { InstitutionalData } from "@/lib/api";

/* ─── Institutional ───────────────────────────────────────────────── */
export default function InstitutionalBlock({ institutional }: { institutional: InstitutionalData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {institutional.total_pct != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>기관 보유</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{institutional.total_pct}%</span>
        </div>
      )}
      {institutional.top_holders.map((h, i) => {
        const prevShares = (h.shares && h.change_pct) ? Math.round(h.shares / (1 + h.change_pct / 100)) : null;
        const diff = (h.shares && prevShares) ? h.shares - prevShares : null;
        return (
          <div key={i} style={{ padding: "5px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", minWidth: 14, textAlign: "right" }}>{i + 1}</span>
              <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
              {h.pct_held != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{h.pct_held}%</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 22, marginTop: 2 }}>
              {h.shares != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>{(h.shares / 1e6).toFixed(1)}M주</span>
              )}
              {h.change_pct != null && h.change_pct !== 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  color: h.change_pct > 0 ? "var(--up)" : "var(--down)",
                }}>
                  {h.change_pct > 0 ? "+" : ""}{h.change_pct}%
                  {diff != null ? ` (${diff > 0 ? "+" : ""}${(diff / 1e6).toFixed(1)}M)` : ""}
                </span>
              )}
              {h.date_reported && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginLeft: "auto" }}>{h.date_reported} 기준</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
