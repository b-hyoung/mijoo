import type { PredictionResult } from "@/lib/api";

interface Props {
  confluence: NonNullable<PredictionResult["confluence"]>;
  size?: "sm" | "md";
}

const TONE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  strong:   { color: "var(--up)",   bg: "rgba(45,212,160,0.12)", border: "rgba(45,212,160,0.3)" },
  moderate: { color: "#86efac",     bg: "rgba(134,239,172,0.1)", border: "rgba(134,239,172,0.25)" },
  mixed:    { color: "#f5a623",     bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.28)" },
};

export default function ConfluenceBadge({ confluence, size = "sm" }: Props) {
  const s = TONE_STYLES[confluence.tone] ?? TONE_STYLES.mixed;
  const fontSize = size === "sm" ? 11 : 13;
  return (
    <span
      title={confluence.explanation ?? confluence.badge}
      style={{
        fontSize, fontWeight: 700, color: s.color,
        background: s.bg, border: `1px solid ${s.border}`,
        borderRadius: 5, padding: "2px 7px", letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {confluence.aligned_count}/{confluence.total} 일치
    </span>
  );
}
