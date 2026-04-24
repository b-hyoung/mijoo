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

      {/* Category cards */}
      <CategoryCards grouped={grouped} left={left} right={right} />

      <p style={{ margin: "10px 4px 0", fontSize: 10, color: "var(--text-3)" }}>
        ※ 재미용 비교입니다. 지표별 우세를 단순 가중 합산한 결과이며 실제 투자 결정엔 신중하세요.
      </p>
    </div>
  );
}

function CategoryCards({
  grouped, left, right,
}: {
  grouped: Record<string, BattleRow[]>;
  left: string; right: string;
}) {
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const categoryKeys = Object.keys(grouped);

  return (
    <div>
      {/* Expand/collapse all */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          onClick={() => setAllOpen(allOpen === true ? false : true)}
          style={{
            fontSize: 11, color: "var(--text-3)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6, padding: "4px 10px",
            cursor: "pointer", fontFamily: "inherit",
          }}>
          {allOpen === true ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {categoryKeys.map(category => (
          <CategoryCard
            key={category}
            category={category}
            rows={grouped[category]}
            left={left}
            right={right}
            forceOpen={allOpen}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  category, rows, left, right, forceOpen,
}: {
  category: string;
  rows: BattleRow[];
  left: string; right: string;
  forceOpen: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen !== null ? forceOpen : open;

  const lScore = rows.reduce((s, r) => s + r.leftScore, 0);
  const rScore = rows.reduce((s, r) => s + r.rightScore, 0);
  const diff = lScore - rScore;
  const winnerSide: "left" | "right" | "tie" =
    Math.abs(diff) < 0.01 ? "tie" : diff > 0 ? "left" : "right";

  const winnerColor =
    winnerSide === "tie" ? "var(--text-3)" : "var(--up)";
  const winnerBg =
    winnerSide === "tie"
      ? "var(--surface)"
      : winnerSide === "left"
        ? "linear-gradient(90deg, rgba(45,212,160,0.07) 0%, transparent 60%)"
        : "linear-gradient(90deg, transparent 40%, rgba(45,212,160,0.07) 100%)";

  return (
    <div style={{
      background: winnerBg,
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 10,
          background: "transparent",
          border: "none",
          padding: "12px 16px",
          cursor: "pointer",
          color: "var(--text)",
          fontFamily: "inherit",
          minHeight: 48,
        }}>
        <span style={{
          fontSize: 12, fontWeight: 800, color: "var(--text)",
          letterSpacing: "-0.01em",
        }}>
          {category}
        </span>
        <span style={{
          flex: 1, textAlign: "right",
          fontSize: 12, color: "var(--text-3)",
        }}>
          {winnerSide === "tie" ? (
            <span>박빙 · {lScore.toFixed(1)} : {rScore.toFixed(1)}</span>
          ) : (
            <span>
              <b style={{ color: winnerColor, fontWeight: 800 }}>
                {winnerSide === "left" ? left : right}
              </b>
              {" "}
              <span style={{ color: "var(--text-3)" }}>
                +{Math.abs(diff).toFixed(1)} · {lScore.toFixed(1)} : {rScore.toFixed(1)}
              </span>
            </span>
          )}
        </span>
        <span style={{
          fontSize: 11, color: "var(--text-3)",
          transform: isOpen ? "rotate(180deg)" : "none",
          transition: "transform 0.15s",
        }}>▾</span>
      </button>

      {isOpen && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto 22px",
              gap: 10, padding: "8px 16px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
              fontSize: 12, alignItems: "center",
            }}>
              <span style={{ color: "var(--text-3)" }} title={r.note}>
                {r.metric}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: r.winner === "left" ? "var(--up)" : "var(--text-2)",
                fontWeight: r.winner === "left" ? 700 : 400,
                textAlign: "right", minWidth: 60,
              }}>
                {r.leftText}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: r.winner === "right" ? "var(--up)" : "var(--text-2)",
                fontWeight: r.winner === "right" ? 700 : 400,
                textAlign: "right", minWidth: 60,
              }}>
                {r.rightText}
              </span>
              <span style={{ textAlign: "center", fontSize: 11 }}>
                {r.winner === "left" ? <span style={{ color: "var(--up)" }}>◀</span> :
                 r.winner === "right" ? <span style={{ color: "var(--up)" }}>▶</span> :
                 <span style={{ color: "var(--text-3)" }}>=</span>}
              </span>
            </div>
          ))}
        </div>
      )}
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

