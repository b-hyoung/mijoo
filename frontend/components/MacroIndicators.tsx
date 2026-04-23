import type { MacroData } from "@/lib/api";

/* ─── Macro Indicators ───────────────────────────────────────────── */
export default function MacroIndicators({ macro }: { macro: MacroData }) {
  const rows: { label: string; value: string; change: number | null; status: "up" | "down" | "neutral" }[] = [];

  if (macro.vix != null) {
    const status: "up" | "down" | "neutral" = macro.vix > 25 ? "down" : macro.vix < 15 ? "up" : "neutral";
    rows.push({ label: "VIX", value: String(macro.vix), change: macro.vix_20d_change, status });
  }
  if (macro.treasury_10y != null) {
    const chg = macro.treasury_10y_20d_change ?? 0;
    const status: "up" | "down" | "neutral" = chg > 3 ? "down" : chg < -3 ? "up" : "neutral";
    rows.push({ label: "10Y 금리", value: `${macro.treasury_10y}%`, change: macro.treasury_10y_20d_change, status });
  }
  if (macro.dxy != null) {
    const chg = macro.dxy_20d_change ?? 0;
    const status: "up" | "down" | "neutral" = chg > 2 ? "down" : chg < -2 ? "up" : "neutral";
    rows.push({ label: "달러(DXY)", value: String(macro.dxy), change: macro.dxy_20d_change, status });
  }

  return (
    <div>
      {rows.map((r, i) => {
        const changeColor = r.change != null && r.change > 0 ? "var(--up)" : r.change != null && r.change < 0 ? "var(--down)" : "var(--text-3)";
        return (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{r.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{r.value}</span>
              {r.change != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: changeColor }}>
                  {r.change > 0 ? "+" : ""}{r.change.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
