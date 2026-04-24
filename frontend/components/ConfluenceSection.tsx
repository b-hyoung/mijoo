import type { PredictionResult } from "@/lib/api";
import ConfluenceBadge from "./ConfluenceBadge";

interface Props {
  confluence: NonNullable<PredictionResult["confluence"]>;
}

const DIR_COLOR = { UP: "var(--up)", DOWN: "var(--down)" } as const;

export default function ConfluenceSection({ confluence }: Props) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)",
                       letterSpacing: "-0.01em" }}>
          📊 주차별 방향 종합
        </span>
        <ConfluenceBadge confluence={confluence} size="md" />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {confluence.per_week.map((d, i) => (
          <span key={i}
            style={{
              fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
              color: DIR_COLOR[d],
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "2px 6px", letterSpacing: "-0.01em",
            }}>
            W{i + 1} {d === "UP" ? "↑" : "↓"}
          </span>
        ))}
      </div>
      {confluence.explanation && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-2)",
                    lineHeight: 1.7 }}>
          {confluence.explanation}
        </p>
      )}
      {confluence.structural_signals && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer",
                            userSelect: "none", letterSpacing: "0.02em" }}>
            구조 시그널 자세히 (score {confluence.structural_signals.score >= 0 ? "+" : ""}
            {confluence.structural_signals.score.toFixed(3)})
          </summary>
          <div style={{ marginTop: 10, borderTop: "1px solid var(--border)",
                        paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {confluence.structural_signals.rows.map((r) => {
              const pos = r.contribution > 0;
              const color = pos ? "var(--up)" : r.contribution < 0 ? "var(--down)" : "var(--text-3)";
              return (
                <div key={r.key} className="signal-row" style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 70px 60px",
                  alignItems: "center", gap: 8, fontSize: 12,
                }}>
                  <span style={{ color: "var(--text-2)" }}>{r.label}</span>
                  <div className="signal-bar" style={{ position: "relative", height: 6,
                                background: "var(--border)", borderRadius: 3 }}>
                    <div style={{
                      position: "absolute", left: "50%",
                      width: `${Math.min(Math.abs(r.contribution) * 200, 50)}%`,
                      height: "100%", background: color, borderRadius: 3,
                      transform: pos ? "none" : "translateX(-100%)",
                    }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
                                 color: "var(--text-3)", textAlign: "right" }}>
                    {r.value >= 0 ? "+" : ""}{r.value.toFixed(2)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12,
                                 fontWeight: 700, color, textAlign: "right" }}>
                    {r.contribution >= 0 ? "+" : ""}{r.contribution.toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
