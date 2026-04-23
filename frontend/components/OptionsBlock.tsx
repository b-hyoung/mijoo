import type { OptionsData } from "@/lib/api";

/* ─── Options Block ──────────────────────────────────────────────── */
export default function OptionsBlock({ options }: { options: OptionsData }) {
  const rows: { label: string; value: string; status: "up" | "down" | "neutral" }[] = [];

  if (options.pc_ratio != null) {
    const st: "up" | "down" | "neutral" = options.pc_ratio < 0.5 ? "up" : options.pc_ratio > 1.2 ? "down" : "neutral";
    rows.push({ label: "P/C Ratio", value: String(options.pc_ratio), status: st });
  }
  if (options.iv_rank != null) {
    const st: "up" | "down" | "neutral" = options.iv_rank >= 80 ? "down" : options.iv_rank <= 20 ? "up" : "neutral";
    rows.push({ label: "IV Rank", value: `${options.iv_rank}%`, status: st });
  }
  if (options.unusual_activity != null) {
    rows.push({ label: "이상 거래", value: `${options.unusual_activity}x ${options.unusual_side ?? ""}`, status: options.unusual_side === "CALL" ? "up" : "down" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{r.label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: r.status === "up" ? "var(--up)" : r.status === "down" ? "var(--down)" : "var(--text-2)" }}>{r.value}</span>
        </div>
      ))}
      {options.expiry_used && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
          만기 {options.expiry_used} ({options.data_source})
        </span>
      )}
    </div>
  );
}
