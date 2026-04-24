"use client";

import { useState, useMemo } from "react";
import { BattleProfile, compareTickers, BattleRow } from "@/lib/battle";
import TickerPickerGrid from "./TickerPickerGrid";

export type BattleEntry = BattleProfile;

interface Props {
  entries: Record<string, BattleProfile>;
  tickers: string[];
}

export default function StockBattleClient({ entries, tickers }: Props) {
  // 기본: 처음 두 개 티커
  const [left, setLeft] = useState<string>(tickers[0]);
  const [right, setRight] = useState<string>(tickers[1] || tickers[0]);

  const leftEntry = entries[left];
  const rightEntry = entries[right];

  const comparison = useMemo(() => {
    if (!leftEntry || !rightEntry || left === right) return null;
    return compareTickers(leftEntry, rightEntry);
  }, [left, right, leftEntry, rightEntry]);

  if (!comparison) {
    return (
      <div style={{ marginBottom: 24 }}>
        <TickerPicker tickers={tickers} entries={entries} left={left} right={right} setLeft={setLeft} setRight={setRight} />
        <p style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0", textAlign: "center" }}>
          서로 다른 두 종목을 골라주세요.
        </p>
      </div>
    );
  }

  const { rows, leftTotal, rightTotal } = comparison;
  const winner = leftTotal > rightTotal ? "left" : rightTotal > leftTotal ? "right" : "tie";
  const winnerTicker = winner === "left" ? left : right;
  const diff = Math.abs(leftTotal - rightTotal);

  // 카테고리별로 그룹핑
  const grouped: Record<string, BattleRow[]> = {};
  rows.forEach(r => {
    (grouped[r.category] ||= []).push(r);
  });

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>⚔️ 주식 사기 대결</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>둘 중 뭐 살지 고민될 때 — 1~2주 관점</span>
      </div>

      <TickerPicker tickers={tickers} entries={entries} left={left} right={right} setLeft={setLeft} setRight={setRight} />

      {/* Verdict bar */}
      <div style={{
        marginTop: 14, marginBottom: 12,
        padding: "12px 16px",
        background: winner === "tie" ? "var(--surface)" : winner === "left"
          ? "linear-gradient(90deg, rgba(45,212,160,0.15) 0%, transparent 100%)"
          : "linear-gradient(90deg, transparent 0%, rgba(45,212,160,0.15) 100%)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        {winner === "tie" ? (
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>🤝 박빙 ({leftTotal} vs {rightTotal})</span>
        ) : (
          <>
            <span style={{ fontSize: 22 }}>🏆</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "var(--up)", letterSpacing: "-0.03em" }}>
              {winnerTicker}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>
              {diff >= 5 ? "확실한 우세" : diff >= 2 ? "약간 우세" : "아슬아슬 우세"}
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
              {leftTotal.toFixed(1)} : {rightTotal.toFixed(1)}
            </span>
          </>
        )}
      </div>

      {/* Comparison table */}
      <div style={{
        overflowX: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          minWidth: 520,
        }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle}>지표</th>
              <th style={{ ...thStyle, textAlign: "center", color: "var(--text)" }}>{left}</th>
              <th style={{ ...thStyle, textAlign: "center", color: "var(--text)" }}>{right}</th>
              <th style={{ ...thStyle, textAlign: "center", width: 70 }}>우세</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, catRows]) => (
              <>
                <tr key={`cat-${category}`}>
                  <td colSpan={4} style={{
                    padding: "10px 14px 4px",
                    fontSize: 10, fontWeight: 700,
                    color: "var(--text-3)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>
                    {category}
                  </td>
                </tr>
                {catRows.map((r, i) => (
                  <tr key={`${category}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdMetricStyle} title={r.note}>{r.metric}</td>
                    <td style={{ ...tdValStyle, fontWeight: r.winner === "left" ? 700 : 400, color: r.winner === "left" ? "var(--up)" : "var(--text-2)" }}>
                      {r.leftText}
                    </td>
                    <td style={{ ...tdValStyle, fontWeight: r.winner === "right" ? 700 : 400, color: r.winner === "right" ? "var(--up)" : "var(--text-2)" }}>
                      {r.rightText}
                    </td>
                    <td style={{ ...tdValStyle, textAlign: "center", fontSize: 11 }}>
                      {r.winner === "left" ? <span style={{ color: "var(--up)" }}>◀</span> :
                       r.winner === "right" ? <span style={{ color: "var(--up)" }}>▶</span> :
                       <span style={{ color: "var(--text-3)" }}>=</span>}
                    </td>
                  </tr>
                ))}
              </>
            ))}
            <tr style={{ background: "var(--surface-2)", fontWeight: 800 }}>
              <td style={{ ...tdMetricStyle, fontWeight: 800 }}>종합 점수</td>
              <td style={{ ...tdValStyle, fontWeight: 800, color: leftTotal > rightTotal ? "var(--up)" : "var(--text-2)" }}>
                {leftTotal.toFixed(1)}
              </td>
              <td style={{ ...tdValStyle, fontWeight: 800, color: rightTotal > leftTotal ? "var(--up)" : "var(--text-2)" }}>
                {rightTotal.toFixed(1)}
              </td>
              <td style={{ ...tdValStyle, textAlign: "center", fontSize: 16 }}>
                {winner === "tie" ? "🤝" : "🏆"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ margin: "8px 4px 0", fontSize: 10, color: "var(--text-3)" }}>
        ※ 재미용 비교입니다. 지표별 우세를 단순 가중 합산한 결과이며 실제 투자 결정엔 신중하세요.
      </p>
    </div>
  );
}

function TickerPicker({
  tickers, entries, left, right, setLeft, setRight,
}: {
  tickers: string[];
  entries: Record<string, BattleProfile>;
  left: string; right: string;
  setLeft: (t: string) => void; setRight: (t: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <TickerPickerGrid
        value={left}
        tickers={tickers}
        entries={entries}
        disabled={right}
        onChange={setLeft}
        label="왼쪽"
      />
      <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-3)", padding: "0 4px" }}>VS</span>
      <TickerPickerGrid
        value={right}
        tickers={tickers}
        entries={entries}
        disabled={left}
        onChange={setRight}
        label="오른쪽"
      />
      <button
        onClick={() => { const t = left; setLeft(right); setRight(t); }}
        title="왼쪽/오른쪽 바꾸기"
        style={{
          marginLeft: 4, fontSize: 13, padding: "8px 14px",
          background: "var(--surface-2)",
          color: "var(--text-2)",
          border: "1px solid var(--border)",
          borderRadius: 8, cursor: "pointer",
          minHeight: 44,
          fontFamily: "inherit",
        }}>
        🔄 바꾸기
      </button>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-3)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const tdMetricStyle: React.CSSProperties = {
  padding: "8px 14px",
  color: "var(--text-2)",
  fontSize: 12,
};

const tdValStyle: React.CSSProperties = {
  padding: "8px 14px",
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
