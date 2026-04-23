import type { AnalystData } from "@/lib/api";

/* ─── Analyst ─────────────────────────────────────────────────────── */
const REC: Record<string, { l: string; c: string }> = {
  "strong_buy": { l: "적극 매수", c: "var(--up)" }, "strong buy": { l: "적극 매수", c: "var(--up)" },
  "buy": { l: "매수", c: "var(--up)" },
  "hold": { l: "보유", c: "var(--text-2)" },
  "sell": { l: "매도", c: "var(--down)" },
  "strong_sell": { l: "적극 매도", c: "var(--down)" }, "strong sell": { l: "적극 매도", c: "var(--down)" },
};

export default function AnalystBlock({ analyst }: { analyst: AnalystData }) {
  const rec = REC[analyst.recommendation?.toLowerCase()] ?? { l: analyst.recommendation, c: "var(--text-2)" };
  const up = (analyst.upside_pct ?? 0) > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: rec.c }}>{rec.l}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{analyst.num_analysts ?? "?"}명</span>
      </div>
      {analyst.target_mean != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            ${analyst.target_mean.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          {analyst.upside_pct != null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: up ? "var(--up)" : "var(--down)" }}>
              {up ? "+" : ""}{analyst.upside_pct}%
            </span>
          )}
        </div>
      )}
      {analyst.target_low != null && analyst.target_high != null && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
          ${analyst.target_low} – ${analyst.target_high}
        </span>
      )}
    </div>
  );
}
