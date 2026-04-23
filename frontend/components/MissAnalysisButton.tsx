"use client";

import { useState } from "react";
import { fetchMissAnalysis, MissAnalysis, USE_SNAPSHOT } from "@/lib/api";

interface Props {
  ticker: string;
  missCount: number;
}

export default function MissAnalysisButton({ ticker, missCount }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MissAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!data) {
      setLoading(true);
      const r = await fetchMissAnalysis(ticker);
      setData(r);
      setLoading(false);
    }
  }

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    const r = await fetchMissAnalysis(ticker, true);
    setData(r);
    setLoading(false);
  }

  if (missCount === 0) return null;

  return (
    <>
      <button
        onClick={handleToggle}
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-3)",
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        {open ? "접기 ▴" : "왜 빗나갔나 ▾"}
      </button>
      {open && (
        <div style={{
          gridColumn: "1 / -1",
          marginTop: 6, marginBottom: 6,
          padding: "14px 18px",
          background: "rgba(240,104,104,0.05)",
          border: "1px solid rgba(240,104,104,0.15)",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.65,
        }}>
          {loading && <span style={{ color: "var(--text-3)" }}>분석 중...</span>}
          {!loading && data && data.miss_count > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between",
                            alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>
                  📉 {ticker} · {data.miss_count}회 연속 빗나감
                  {" "}({data.predicted_direction} 예측 → 실제 {data.actual_direction})
                </span>
                {!USE_SNAPSHOT && (
                  <button onClick={handleRefresh}
                    style={{
                      fontSize: 10, color: "var(--text-3)",
                      background: "transparent", border: "none",
                      cursor: "pointer", padding: 0,
                    }}>
                    {data.cached ? "재분석" : "최신"}
                  </button>
                )}
              </div>

              {data.summary && (
                <p style={{ margin: "0 0 10px", color: "var(--text-2)" }}>
                  {data.summary}
                </p>
              )}

              {data.drivers && data.drivers.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700,
                                color: "var(--text-3)",
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                marginBottom: 4 }}>
                    근거를 무너뜨린 요인
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
                    {data.drivers.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}

              {data.advice && (
                <div style={{
                  fontSize: 11,
                  background: "rgba(255,255,255,0.03)",
                  padding: "8px 12px", borderRadius: 6,
                  color: "var(--text-2)",
                  borderLeft: "2px solid var(--brand, #8ab4f8)",
                }}>
                  💡 <b>다음 예측에서</b>: {data.advice}
                </div>
              )}

              {data.misses && data.misses.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 10, color: "var(--text-3)",
                                    cursor: "pointer", userSelect: "none" }}>
                    빗나간 예측 {data.misses.length}건 보기
                  </summary>
                  <div style={{ marginTop: 8, display: "flex",
                                flexDirection: "column", gap: 6 }}>
                    {data.misses.map((m, i) => (
                      <div key={i} style={{
                        fontSize: 11, color: "var(--text-3)",
                        fontFamily: "var(--font-mono)",
                      }}>
                        {m.predicted_at.slice(0, 10)} · 예측 {m.predicted_direction}
                        {" "}· 실제 {m.change_pct >= 0 ? "+" : ""}{m.change_pct.toFixed(1)}%
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {!loading && data && data.miss_count === 0 && (
            <span style={{ color: "var(--text-3)" }}>분석할 miss 없음.</span>
          )}
          {!loading && !data && (
            <span style={{ color: "var(--down)" }}>분석 로드 실패.</span>
          )}
        </div>
      )}
    </>
  );
}
