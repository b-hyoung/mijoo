import { fetchStockList, fetchPrediction, PredictionResult } from "@/lib/api";

async function fetchAll(tickers: string[]): Promise<(PredictionResult | null)[]> {
  return Promise.all(tickers.map(t => fetchPrediction(t).catch(() => null)));
}

export default async function WeeklyPage() {
  let tickers = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","COST","NFLX","KO"];
  try { const list = await fetchStockList(); tickers = list.tickers; } catch {}

  const results = await fetchAll(tickers);

  // 주차 계산
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const month = monday.getMonth() + 1;
  const weekNum = Math.ceil(monday.getDate() / 7);
  const weekLabel = `${monday.getFullYear()}년 ${month}월 ${weekNum}주차`;

  // 분류
  const buys = results.filter(r => r?.debate?.verdict === "매수");
  const sells = results.filter(r => r?.debate?.verdict === "매도");
  const holds = results.filter(r => r?.debate?.verdict === "관망");

  // 시장 환경 (첫 번째 데이터에서)
  const macro = results.find(r => r?.macro)?.macro;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.03em" }}>
          주간 AI 분석 리포트
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-3)", marginTop: 4 }}>{weekLabel} 기준</p>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28 }}>
        <SummaryCard label="매수" count={buys.length} color="var(--up)" bg="rgba(45,212,160,0.08)" />
        <SummaryCard label="매도" count={sells.length} color="var(--down)" bg="rgba(240,104,104,0.08)" />
        <SummaryCard label="관망" count={holds.length} color="#f5a623" bg="rgba(245,166,35,0.08)" />
        <SummaryCard label="총 종목" count={results.filter(Boolean).length} color="var(--text)" bg="var(--surface)" />
      </div>

      {/* 시장 환경 */}
      {macro && (
        <div style={{ marginBottom: 28, padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em" }}>시장 환경</p>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <MacroItem label="VIX" value={macro.vix} change={macro.vix_20d_change} danger={macro.vix != null && macro.vix > 25} />
            <MacroItem label="10Y 국채" value={macro.treasury_10y != null ? `${macro.treasury_10y}%` : null} change={macro.treasury_10y_20d_change} />
            <MacroItem label="달러(DXY)" value={macro.dxy} change={macro.dxy_20d_change} />
          </div>
        </div>
      )}

      {/* 매수 종목 */}
      {buys.length > 0 && (
        <Section title="매수 판정" color="var(--up)" icon="▲">
          {buys.map(r => r && <TickerRow key={r.ticker} data={r} />)}
        </Section>
      )}

      {/* 매도 종목 */}
      {sells.length > 0 && (
        <Section title="매도 판정" color="var(--down)" icon="▼">
          {sells.map(r => r && <TickerRow key={r.ticker} data={r} />)}
        </Section>
      )}

      {/* 관망 종목 */}
      {holds.length > 0 && (
        <Section title="관망 판정" color="#f5a623" icon="●">
          {holds.map(r => r && <TickerRow key={r.ticker} data={r} />)}
        </Section>
      )}
    </div>
  );
}

function SummaryCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 900, color, display: "block" }}>{count}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{label}</span>
    </div>
  );
}

function MacroItem({ label, value, change, danger }: { label: string; value: any; change: number | null; danger?: boolean }) {
  if (value == null) return null;
  const changeColor = change != null ? (change > 0 ? "var(--down)" : "var(--up)") : "var(--text-3)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: danger ? "var(--down)" : "var(--text)" }}>
        {value}
      </span>
      {change != null && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: changeColor }}>
          {change > 0 ? "+" : ""}{change.toFixed(1)}% (20일)
        </span>
      )}
    </div>
  );
}

function Section({ title, color, icon, children }: { title: string; color: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color, fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {children}
      </div>
    </div>
  );
}

function TickerRow({ data }: { data: PredictionResult }) {
  const debate = data.debate;
  const v = debate?.verdict;
  const conf = debate?.confidence ?? 0;
  const direction = debate?.direction ?? "UP";
  const upPct = direction === "UP" ? conf : 100 - conf;
  const downPct = 100 - upPct;

  const w2 = data.prediction?.week2;
  const w4 = data.prediction?.week4;
  const w2Chg = w2 ? ((w2.price_target - data.current_price) / data.current_price * 100) : null;
  // week4 is now a structural range prediction (no point target) — show direction + probability
  const w4Dir = w4?.direction;
  const w4Prob = w4?.up_probability;

  const stockBull = (debate as any)?.stock_bull ?? [];
  const stockBear = (debate as any)?.stock_bear ?? [];
  const marketBear = (debate as any)?.market_bear ?? [];

  const verdictColor = v === "매수" ? "var(--up)" : v === "매도" ? "var(--down)" : "#f5a623";

  return (
    <a href={`/stock/${data.ticker}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "16px 20px", display: "flex", gap: 20, alignItems: "flex-start",
        transition: "border-color 0.15s", cursor: "pointer",
      }}
        onMouseOver={undefined}
      >
        {/* Left: ticker + price + verdict */}
        <div style={{ minWidth: 120 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{data.ticker}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-2)" }}>
              ${data.current_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: v === "매수" ? "rgba(45,212,160,0.1)" : v === "매도" ? "rgba(240,104,104,0.1)" : "rgba(245,166,35,0.08)",
            border: `1px solid ${v === "매수" ? "rgba(45,212,160,0.25)" : v === "매도" ? "rgba(240,104,104,0.25)" : "rgba(245,166,35,0.2)"}`,
            borderRadius: 6, padding: "3px 10px",
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: verdictColor }}>{v} {conf}%</span>
          </div>
        </div>

        {/* Middle: probability bar + 2W/4W */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--up)", minWidth: 35 }}>▲{upPct}%</span>
            <div style={{ flex: 1, display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--border)" }}>
              <div style={{ width: `${upPct}%`, background: upPct >= downPct ? "var(--up)" : "rgba(45,212,160,0.3)" }} />
              <div style={{ width: `${downPct}%`, background: downPct > upPct ? "var(--down)" : "rgba(240,104,104,0.3)" }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--down)", minWidth: 35, textAlign: "right" }}>{downPct}%▼</span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {w2Chg !== null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: w2Chg >= 0 ? "var(--up)" : "var(--down)" }}>
                2W {w2Chg >= 0 ? "+" : ""}{w2Chg.toFixed(1)}%
              </span>
            )}
            {w4Dir && w4Prob != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: w4Dir === "UP" ? "var(--up)" : "var(--down)" }}>
                4W {w4Dir === "UP" ? "↑" : "↓"} {w4Prob.toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* Right: key reasons */}
        <div style={{ flex: 1, minWidth: 200, fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
          {stockBull.slice(0, 1).map((pt: string, i: number) => (
            <div key={`b${i}`} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "var(--up)" }}>+</span><span style={{ color: "var(--text-2)" }}>{pt.length > 60 ? pt.slice(0, 60) + "..." : pt}</span>
            </div>
          ))}
          {stockBear.slice(0, 1).map((pt: string, i: number) => (
            <div key={`s${i}`} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "var(--down)" }}>-</span><span style={{ color: "var(--text-2)" }}>{pt.length > 60 ? pt.slice(0, 60) + "..." : pt}</span>
            </div>
          ))}
          {marketBear.slice(0, 1).map((pt: string, i: number) => (
            <div key={`m${i}`} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "var(--text-3)" }}>!</span><span>{pt.length > 60 ? pt.slice(0, 60) + "..." : pt}</span>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}
