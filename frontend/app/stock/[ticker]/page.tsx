import { fetchPrediction, fetchHistory, DebateResult } from "@/lib/api";
import { formatRelativeTime, stalenessLevel } from "@/lib/time";
import ConfluenceSection from "@/components/ConfluenceSection";
import OrderFlowChart from "@/components/OrderFlowChart";
import DebateAccordion from "@/components/DebateAccordion";
import PredictionHistoryLink from "@/components/PredictionHistoryLink";
import WeeklyCards from "@/components/WeeklyCards";
import SignalsList from "@/components/SignalsList";
import MacroIndicators from "@/components/MacroIndicators";
import AnomalyCard from "@/components/AnomalyCard";
import OptionsBlock from "@/components/OptionsBlock";
import EarningsBlock from "@/components/EarningsBlock";
import AnalystBlock from "@/components/AnalystBlock";
import InsiderBlock from "@/components/InsiderBlock";
import InstitutionalBlock from "@/components/InstitutionalBlock";
import DirectionBar from "@/components/DirectionBar";
import NewsAccordion from "@/components/NewsAccordion";

/* ─── Verdict ─────────────────────────────────────────────────────── */
function Verdict({ debate }: { debate: DebateResult | undefined }) {
  const v = debate?.verdict;
  if (!v) return null;
  const isBuy  = v === "매수";
  const isSell = v === "매도";
  const color  = isBuy ? "var(--up)" : isSell ? "var(--down)" : "#f5a623";
  const bg = isBuy ? "rgba(45,212,160,0.1)" : isSell ? "rgba(240,104,104,0.1)" : "rgba(245,166,35,0.1)";
  const border = isBuy ? "rgba(45,212,160,0.3)" : isSell ? "rgba(240,104,104,0.3)" : "rgba(245,166,35,0.3)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "6px 14px", flex: "0 0 auto" }}>
      <span style={{ fontSize: 20, fontWeight: 900, color, letterSpacing: "-0.03em" }}>{v}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 900, color }}>
        {debate?.confidence}%
      </span>
    </div>
  );
}

/* ─── Section divider ─────────────────────────────────────────────── */
function Section({ label, children, noBorder }: { label: string; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div style={{ paddingTop: noBorder ? 0 : 24, borderTop: noBorder ? "none" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--brand)" }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>{label}</p>
      </div>
      {children}
    </div>
  );
}

/* ─── Static params (for output: 'export') ────────────────────────── */
export async function generateStaticParams() {
  try {
    const { fetchStockList } = await import("@/lib/api");
    const list = await fetchStockList();
    return list.tickers.map((ticker) => ({ ticker }));
  } catch {
    return [{ ticker: "AAPL" }];
  }
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const [data, orderFlow] = await Promise.all([
    fetchPrediction(ticker).catch(() => null),
    fetchHistory(ticker, 30),
  ]);

  if (!data) {
    return <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-3)" }}>{ticker} 데이터를 가져올 수 없습니다.</div>;
  }

  const personas    = data.debate?.personas ?? [];
  const headlines   = data.news_headlines ?? [];
  const debate      = data.debate;
  const keyNews = Array.isArray(debate?.key_news) ? debate.key_news : [];

  // 종목 vs 시장 (백엔드에서 분류, fallback으로 키워드 분류)
  const MARKET_KW = ["VIX", "vix", "국채", "금리", "시장", "달러", "DXY", "매크로", "연준", "Fed", "인플레이션", "경기", "글로벌", "treasury", "불확실성", "변동성"];
  const isMarket = (pt: string) => MARKET_KW.some(kw => pt.includes(kw));

  const rawStockBull = (debate as any)?.stock_bull;
  const rawStockBear = (debate as any)?.stock_bear;
  const rawMarketBull = (debate as any)?.market_bull;
  const rawMarketBear = (debate as any)?.market_bear;

  const bullPts = Array.isArray(debate?.bull_points) ? debate.bull_points : [];
  const bearPts = Array.isArray(debate?.bear_points) ? debate.bear_points : [];

  const stockBull = Array.isArray(rawStockBull) && rawStockBull.length > 0 ? rawStockBull : bullPts.filter(pt => !isMarket(pt));
  const stockBear = Array.isArray(rawStockBear) && rawStockBear.length > 0 ? rawStockBear : bearPts.filter(pt => !isMarket(pt));
  const marketBull = Array.isArray(rawMarketBull) && rawMarketBull.length > 0 ? rawMarketBull : bullPts.filter(pt => isMarket(pt));
  const marketBear = Array.isArray(rawMarketBear) && rawMarketBear.length > 0 ? rawMarketBear : bearPts.filter(pt => isMarket(pt));
  const hasSidebar = (data.analyst?.target_mean != null) || (data.insider && data.insider.recent.length > 0) || (data.earnings?.next_date != null) || (data.options?.pc_ratio != null);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 24px", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.05em" }}>{ticker}</h1>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: "var(--text)" }}>
            ${data.current_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          {data.predicted_at && (() => {
            const s = stalenessLevel(data.predicted_at);
            const color = s === "fresh" ? "var(--text-3)" : s === "stale" ? "#f5a623" : "var(--down)";
            return (
              <span
                suppressHydrationWarning
                title={`분석 시각: ${new Date(data.predicted_at).toLocaleString("ko-KR")}`}
                style={{ fontSize: 12, color }}
              >
                분석 {formatRelativeTime(data.predicted_at)}
              </span>
            );
          })()}
        </div>
        <Verdict debate={debate} />
      </div>

      {/* Upcoming events strip */}
      {data.upcoming_events && data.upcoming_events.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {data.upcoming_events.map((e, i) => (
            <span key={i}
              title={e.date}
              style={{
                fontSize: 11, fontWeight: 700, color: "var(--text-2)",
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "3px 8px", letterSpacing: "-0.01em",
              }}>
              {e.type === "earnings" ? "실적" : e.type} D-{e.days_until}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {debate?.summary && (
        <div style={{ paddingBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 15, color: "var(--text-2)", lineHeight: 1.7, maxWidth: 800 }}>{debate.summary}</p>
        </div>
      )}

      {data.confluence && (
        <div style={{ paddingBottom: 16 }}>
          <ConfluenceSection confluence={data.confluence} />
        </div>
      )}

      {data.anomaly && data.anomaly.score > 30 && (
        <AnomalyCard anomaly={data.anomaly} />
      )}

      {/* 2-col layout */}
      <div className="grid-sidebar" style={{
        display: "grid", gridTemplateColumns: hasSidebar ? "1fr 320px" : "1fr",
        gap: 32, alignItems: "start",
      }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data.prediction && (
            <Section label="주차별 예측" noBorder>
              {debate?.verdict === "관망" && (
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                  AI 분석가 의견이 엇갈려 관망 판정. 아래 가격은 ML 모델 기반 예측이며 참고용입니다.
                </p>
              )}
              <WeeklyCards prediction={data.prediction} currentPrice={data.current_price} />

              {/* 상승/하락 확률 바 */}
              {debate?.confidence != null && (
                <DirectionBar direction={debate.direction} confidence={debate.confidence} verdict={debate.verdict} />
              )}

              {/* 종목 + 시장 분석 카드 */}
              {(bullPts.length > 0 || bearPts.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 16, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {/* 종목 상승 */}
                  <div style={{ background: "var(--surface)", padding: "16px 20px" }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: "var(--up)", letterSpacing: "0.04em" }}>{ticker} 상승 근거</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {stockBull.length > 0 ? stockBull.map((pt, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--up)", flexShrink: 0, fontWeight: 700 }}>+</span><span>{pt}</span>
                        </div>
                      )) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>특이사항 없음</span>}
                    </div>
                  </div>
                  {/* 종목 하락 */}
                  <div style={{ background: "var(--surface)", padding: "16px 20px", borderLeft: "1px solid var(--border)" }}>
                    <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: "var(--down)", letterSpacing: "0.04em" }}>{ticker} 하락 근거</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {stockBear.length > 0 ? stockBear.map((pt, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
                          <span style={{ color: "var(--down)", flexShrink: 0, fontWeight: 700 }}>-</span><span>{pt}</span>
                        </div>
                      )) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>특이사항 없음</span>}
                    </div>
                  </div>
                  {/* 시장 */}
                  {(marketBull.length > 0 || marketBear.length > 0) && (
                    <>
                      <div style={{ background: "rgba(255,255,255,0.02)", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em" }}>시장 호재</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {marketBull.length > 0 ? marketBull.map((pt, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
                              <span style={{ color: "var(--up)", flexShrink: 0 }}>+</span><span>{pt}</span>
                            </div>
                          )) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>특이사항 없음</span>}
                        </div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.02)", padding: "14px 20px", borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>
                        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em" }}>시장 악재</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {marketBear.length > 0 ? marketBear.map((pt, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
                              <span style={{ color: "var(--down)", flexShrink: 0 }}>-</span><span>{pt}</span>
                            </div>
                          )) : <span style={{ fontSize: 12, color: "var(--text-3)" }}>특이사항 없음</span>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Section>
          )}
          {data.signals && (
            <Section label="기술적 신호">
              <SignalsList signals={data.signals} orderFlow={data.order_flow} sentimentScore={data.sentiment_score} shortFloat={data.short_float_pct} shortChange={data.short_change} />
            </Section>
          )}
          {data.macro && (
            <Section label="매크로 환경">
              <MacroIndicators macro={data.macro} />
            </Section>
          )}
          <div style={{ paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <OrderFlowChart data={orderFlow} isAccumulation={data.order_flow?.is_accumulation} />
          </div>
        </div>

        {/* Sidebar */}
        {hasSidebar && (
          <div className="sidebar-border" style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", paddingLeft: 24, minWidth: 0, overflow: "hidden" }}>
            {data.earnings && data.earnings.next_date && (
              <Section label="실적 캘린더" noBorder>
                <EarningsBlock earnings={data.earnings} />
              </Section>
            )}
            {(keyNews.length > 0 || headlines.length > 0) && (
              <Section label="주요 뉴스">
                <NewsAccordion keyNews={keyNews} headlines={headlines} />
              </Section>
            )}
            {data.analyst?.target_mean != null ? (
              <Section label="애널리스트"><AnalystBlock analyst={data.analyst} /></Section>
            ) : (
              <Section label="애널리스트">
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>데이터를 가져올 수 없습니다</span>
              </Section>
            )}
            {data.options && data.options.pc_ratio != null && (
              <Section label="옵션 흐름">
                <OptionsBlock options={data.options} />
              </Section>
            )}
            {data.insider && data.insider.recent.length > 0 && <Section label="내부자 (90일)"><InsiderBlock insider={data.insider} /></Section>}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        <PredictionHistoryLink ticker={ticker} />
        <DebateAccordion personas={personas} />
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingBottom: 24, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-3)" }}>
          <a href="/" style={{ color: "var(--text-3)", textDecoration: "none" }}>대시보드</a>
          <a href="/weekly" style={{ color: "var(--text-3)", textDecoration: "none" }}>주간리포트</a>
          <a href={`/stock/${ticker}/history`} style={{ color: "var(--text-3)", textDecoration: "none" }}>예측기록</a>
          <a href="/settings" style={{ color: "var(--text-3)", textDecoration: "none" }}>설정</a>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>AI 예측은 투자 조언이 아닙니다. 참고용으로만 활용하세요.</span>
      </footer>
    </div>
  );
}
