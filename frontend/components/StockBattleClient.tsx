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

// Related category pairs — displayed together in 2-col grid.
// 마지막에 혼자 남는 "감정/심리" 는 full-width 로 렌더.
const CATEGORY_PAIRS: string[][] = [
  ["AI 판정", "예측 여력"],
  ["기술적", "옵션/흐름"],
  ["펀더멘털", "이벤트"],
  ["감정/심리"],
];

function CategoryCards({
  grouped, left, right,
}: {
  grouped: Record<string, BattleRow[]>;
  left: string; right: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {CATEGORY_PAIRS.map((pair, idx) => (
        <div
          key={idx}
          className="battle-pair"
          style={{
            display: "grid",
            gridTemplateColumns: pair.length === 2 ? "1fr 1fr" : "1fr",
            gap: 12,
          }}>
          {pair
            .filter(c => grouped[c])
            .map(c => (
              <CategoryCard
                key={c}
                category={c}
                rows={grouped[c]}
                left={left}
                right={right}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function CategoryCard({
  category, rows, left, right,
}: {
  category: string;
  rows: BattleRow[];
  left: string; right: string;
}) {
  const lScore = rows.reduce((s, r) => s + r.leftScore, 0);
  const rScore = rows.reduce((s, r) => s + r.rightScore, 0);
  const diff = lScore - rScore;
  const winnerSide: "left" | "right" | "tie" =
    Math.abs(diff) < 0.01 ? "tie" : diff > 0 ? "left" : "right";

  const winnerBg =
    winnerSide === "tie"
      ? "var(--surface)"
      : winnerSide === "left"
        ? "linear-gradient(180deg, rgba(45,212,160,0.05) 0%, transparent 100%)"
        : "linear-gradient(180deg, rgba(45,212,160,0.05) 0%, transparent 100%)";

  return (
    <div style={{
      background: winnerBg,
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Category header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: "var(--text-3)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {category}
        </span>
        <span style={{
          flex: 1, textAlign: "right",
          fontSize: 12,
        }}>
          {winnerSide === "tie" ? (
            <span style={{ color: "var(--text-3)" }}>박빙 {lScore.toFixed(1)} : {rScore.toFixed(1)}</span>
          ) : (
            <>
              <b style={{ color: "var(--up)", fontWeight: 800 }}>
                {winnerSide === "left" ? left : right}
              </b>
              <span style={{ color: "var(--text-3)", marginLeft: 6 }}>
                +{Math.abs(diff).toFixed(1)}
              </span>
            </>
          )}
        </span>
      </div>

      {/* Rows */}
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, auto) 18px minmax(0, auto)",
            gap: 8, padding: "7px 14px",
            borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
            fontSize: 12, alignItems: "center",
          }}>
            <span style={{ color: "var(--text-3)", minWidth: 0,
                           overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={r.note}>
              {r.metric}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: r.winner === "left" ? "var(--up)" : "var(--text-2)",
              fontWeight: r.winner === "left" ? 700 : 400,
              textAlign: "right",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {r.leftText}
            </span>
            <span style={{ textAlign: "center", fontSize: 10, color: "var(--text-3)" }}>
              {r.winner === "left" ? <span style={{ color: "var(--up)" }}>◀</span> :
               r.winner === "right" ? <span style={{ color: "var(--up)" }}>▶</span> :
               "="}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: r.winner === "right" ? "var(--up)" : "var(--text-2)",
              fontWeight: r.winner === "right" ? 700 : 400,
              textAlign: "left",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {r.rightText}
            </span>
          </div>
        ))}
      </div>
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

