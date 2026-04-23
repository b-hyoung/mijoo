"use client";

import { useState } from "react";

interface Persona {
  id: string;
  role?: string;
  direction?: string;
  confidence?: number;
  argument: string;
}

function PersonaCard({ persona }: { persona: Persona }) {
  const isUp = persona.direction === "UP";
  const color = isUp ? "var(--up)" : "var(--down)";
  const bg = isUp ? "var(--up-bg)" : "var(--down-bg)";
  const border = isUp ? "var(--up-border)" : "var(--down-border)";
  const raw = persona.argument ?? "";
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\*\*/g, "").replace(/#{1,3}\s*/g, "").trim())
    .filter((l) => l.length > 0);

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {persona.role ?? persona.id}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color }}>
            {isUp ? "▲" : "▼"} {persona.confidence ?? "?"}%
          </span>
        </div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {lines.map((line, i) => (
          <li key={i} style={{ display: "flex", gap: 7, fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>
            <span style={{ color, flexShrink: 0, marginTop: 1 }}>•</span>
            <span>{line.replace(/^[•\-]\s*/, "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  personas: Persona[];
}

export default function DebateAccordion({ personas }: Props) {
  const [open, setOpen] = useState(true);

  if (!personas || personas.length === 0) return null;

  const upCount = personas.filter(p => p.direction === "UP").length;
  const downCount = personas.filter(p => p.direction === "DOWN").length;

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "1px solid var(--border)",
          borderRadius: 6, padding: "6px 12px",
          fontSize: 12, color: "var(--text-3)", cursor: "pointer",
          fontFamily: "inherit",
          width: "100%", justifyContent: "space-between",
        }}
      >
        <span>
          <span style={{ color: "var(--up)", marginRight: 4 }}>▲ {upCount}</span>
          <span style={{ color: "var(--text-3)", margin: "0 6px" }}>vs</span>
          <span style={{ color: "var(--down)", marginRight: 4 }}>▼ {downCount}</span>
          <span>전문가 의견</span>
        </span>
        <span style={{ fontSize: 10 }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, marginTop: 10 }}>
          {personas.map(p => <PersonaCard key={p.id} persona={p} />)}
        </div>
      )}
    </div>
  );
}
