import { fetchStockList, fetchCurrentPrice } from "@/lib/api";
import StockCard from "@/components/StockCard";
import WarmingBanner from "@/components/WarmingBanner";
import AccuracyDashboard from "@/components/AccuracyDashboard";
import FullBuyPick from "@/components/FullBuyPick";
import StockBattle from "@/components/StockBattle";

async function StockCardWithPrice({ ticker }: { ticker: string }) {
  const currentPrice = await fetchCurrentPrice(ticker);
  return <StockCard ticker={ticker} currentPrice={currentPrice} />;
}

export default async function DashboardPage() {
  let tickers: string[] = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","COST","NFLX"];
  try {
    const list = await fetchStockList();
    tickers = list.tickers;
  } catch {}

  return (
    <div>
      <WarmingBanner />
      <StockBattle />
      <FullBuyPick />
      <AccuracyDashboard />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.03em" }}>
            종목 예측 현황
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>AI 분석 기반 2주·4주 방향 예측</p>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          {tickers.length}개 종목
        </span>
      </div>

      <div className="grid-home" style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
      }}>
        {tickers.slice(0, 12).map(ticker => (
          <StockCardWithPrice key={ticker} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
