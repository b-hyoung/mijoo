"use client";

import { useEffect, useRef, useState } from "react";
import type { BattleProfile } from "@/lib/battle";

interface Props {
  value: string;
  tickers: string[];
  entries: Record<string, BattleProfile>;
  disabled?: string;       // 다른 쪽이 이미 고른 ticker — 선택 불가
  onChange: (ticker: string) => void;
  label?: string;          // 좌/우 표시
}

const VERDICT_COLOR: Record<string, string> = {
  "매수": "var(--up)",
  "매도": "var(--down)",
  "관망": "#f5a623",
};

export default function TickerPickerGrid({
  value, tickers, entries, disabled, onChange, label,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click outside / Escape to close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = entries[value];
  const currentVerdictColor = current ? VERDICT_COLOR[current.verdict] || "var(--text-3)" : "var(--text-3)";

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          background: "var(--surface-2)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          color: "var(--text)",
          padding: "10px 14px",
          borderRadius: 8,
          cursor: "pointer",
          minHeight: 48, minWidth: 120,
          fontFamily: "inherit",
          transition: "border-color 0.15s",
        }}
      >
        {label && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)",
                         letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {label}
          </span>
        )}
        {current && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: currentVerdictColor, flex: "0 0 auto",
          }} />
        )}
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)",
                       transform: open ? "rotate(180deg)" : "none",
                       transition: "transform 0.15s" }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          minWidth: 280,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(80px, 1fr))",
            gap: 6,
          }}>
            {tickers.map(t => {
              const e = entries[t];
              const v = e?.verdict || "관망";
              const color = VERDICT_COLOR[v] || "var(--text-3)";
              const isSelected = t === value;
              const isDisabled = t === disabled;
              return (
                <button
                  key={t}
                  disabled={isDisabled}
                  onClick={() => { onChange(t); setOpen(false); }}
                  title={e ? `${v} ${e.confidence}%` : t}
                  style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 4,
                    background: isSelected ? "rgba(104,117,245,0.15)" : "var(--surface-2)",
                    border: `1px solid ${isSelected ? "var(--brand)" : "var(--border)"}`,
                    borderRadius: 8,
                    padding: "10px 6px",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    opacity: isDisabled ? 0.35 : 1,
                    minHeight: 60,
                    fontFamily: "inherit",
                    color: "var(--text)",
                    transition: "border-color 0.15s, background 0.15s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: color,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em" }}>
                      {t}
                    </span>
                  </div>
                  {e && (
                    <span style={{
                      fontSize: 10, color: "var(--text-3)",
                      fontFamily: "var(--font-mono)", lineHeight: 1,
                    }}>
                      {v} {e.confidence}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{
            marginTop: 10, paddingTop: 8,
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 12, flexWrap: "wrap",
            fontSize: 10, color: "var(--text-3)",
          }}>
            <Legend color={VERDICT_COLOR["매수"]} label="매수" />
            <Legend color={VERDICT_COLOR["매도"]} label="매도" />
            <Legend color={VERDICT_COLOR["관망"]} label="관망" />
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span>{label}</span>
    </span>
  );
}
