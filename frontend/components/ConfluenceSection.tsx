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
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)",
                    lineHeight: 1.7 }}>
          {confluence.explanation}
        </p>
      )}
    </div>
  );
}
