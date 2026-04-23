"use client";

import { useState, useEffect } from "react";
import { fetchStockList, addCustomTicker, removeCustomTicker } from "@/lib/api";

const DEFAULT_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
  "META", "TSLA", "AVGO", "COST", "NFLX"
];

export default function SettingsPage() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    try {
      const list = await fetchStockList();
      setTickers(list.tickers.sort());
    } catch {
      setTickers(DEFAULT_TICKERS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      setMessage({ text: `${ticker} 이미 있음`, ok: false });
      return;
    }
    await addCustomTicker(ticker);
    setMessage({ text: `${ticker} 추가됨`, ok: true });
    setInput("");
    await load();
  }

  async function handleRemove(ticker: string) {
    if (DEFAULT_TICKERS.includes(ticker)) {
      setMessage({ text: `${ticker}는 기본 종목이라 제거 불가`, ok: false });
      return;
    }
    await removeCustomTicker(ticker);
    setMessage({ text: `${ticker} 제거됨`, ok: true });
    await load();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", letterSpacing: "-0.03em" }}>설정</h2>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>종목 목록을 관리합니다</p>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>종목 관리</h3>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{tickers.length}개 종목</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setMessage(null); }}
            onKeyDown={handleKeyDown}
            placeholder="티커 입력 (예: AMD)"
            style={{
              flex: 1,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--text)",
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={e => (e.target.style.borderColor = "var(--brand)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
          <button
            onClick={handleAdd}
            style={{
              background: "var(--brand)",
              border: "none",
              borderRadius: 7,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            추가
          </button>
        </div>

        {message && (
          <p style={{ fontSize: 12, color: message.ok ? "var(--up)" : "var(--down)", margin: 0 }}>
            {message.text}
          </p>
        )}

        {loading ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ height: 28, width: 60, background: "var(--surface-2)", borderRadius: 6 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tickers.map(ticker => {
              const isDefault = DEFAULT_TICKERS.includes(ticker);
              return (
                <div
                  key={ticker}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: isDefault ? "var(--surface-2)" : "var(--brand-bg)",
                    border: `1px solid ${isDefault ? "var(--border)" : "var(--brand)"}`,
                    color: isDefault ? "var(--text-2)" : "var(--brand)",
                  }}
                >
                  <span>{ticker}</span>
                  {!isDefault && (
                    <button
                      onClick={() => handleRemove(ticker)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-3)", fontSize: 14, lineHeight: 1,
                        padding: 0, display: "flex", alignItems: "center",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = "var(--down)")}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = "var(--text-3)")}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
          회색 = 기본 종목 (제거 불가) · 파란색 = 추가 종목 (× 클릭으로 제거)
        </p>
      </div>
    </div>
  );
}
