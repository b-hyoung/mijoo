import { fetchStockList, fetchPrediction } from "@/lib/api";
import StockCard from "@/components/StockCard";

export default async function DashboardPage() {
  let tickers: string[] = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "COST", "NFLX"];
  try {
    const list = await fetchStockList();
    tickers = list.tickers;
  } catch {}

  const predictions = await Promise.allSettled(
    tickers.slice(0, 12).map(t => fetchPrediction(t))
  );
  const successful = predictions
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">종목 예측 현황</h2>
        <span className="text-sm text-slate-500">{successful.length > 0 ? `${successful.length}개 종목` : "백엔드 연결 필요"}</span>
      </div>
      {successful.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-2">백엔드 서버가 실행되지 않았습니다</p>
          <p className="text-sm">cd backend && uvicorn app.main:app --reload</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {successful.map((data: any) => (
          <StockCard key={data.ticker} data={data} />
        ))}
      </div>
    </div>
  );
}
