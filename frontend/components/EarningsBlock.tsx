import type { EarningsData } from "@/lib/api";

/* ─── Earnings Block ─────────────────────────────────────────────── */
export default function EarningsBlock({ earnings }: { earnings: EarningsData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {earnings.next_date && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>다음 어닝</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{earnings.next_date}</span>
            {earnings.days_until != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: earnings.days_until <= 7 ? "var(--down)" : "var(--text-3)" }}>
                {earnings.days_until}일 후{earnings.days_until <= 7 ? " ⚠" : ""}
              </span>
            )}
          </div>
        </div>
      )}
      {earnings.history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {earnings.history.slice(0, 4).map((q, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{q.quarter}</span>
              <div style={{ display: "flex", gap: 10 }}>
                {q.eps_surprise_pct != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: q.eps_surprise_pct > 0 ? "var(--up)" : "var(--down)" }}>
                    EPS {q.eps_surprise_pct > 0 ? "+" : ""}{q.eps_surprise_pct.toFixed(1)}%
                  </span>
                )}
                {q.revenue_surprise_pct != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: q.revenue_surprise_pct > 0 ? "var(--up)" : "var(--down)" }}>
                    매출 {q.revenue_surprise_pct > 0 ? "+" : ""}{q.revenue_surprise_pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
