import { fetchPrediction } from "@/lib/api";
import PredictionBadge from "@/components/PredictionBadge";
import OrderFlowChart from "@/components/OrderFlowChart";

function generateMockOrderFlow(days: number = 20) {
  return Array.from({ length: days }, (_, i) => {
    const buy = Math.random() * 5e6 + 2e6;
    const sell = Math.random() * 5e6 + 2e6;
    const is_accumulation = buy > sell * 1.4;
    return {
      date: new Date(Date.now() - (days - i) * 86400000).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
      buy_volume: Math.round(buy),
      sell_volume: Math.round(sell),
      obv: i * 1e6 + Math.random() * 5e5,
      is_accumulation,
    };
  });
}

export default async function StockDetailPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  let data: any = null;
  try {
    data = await fetchPrediction(ticker);
  } catch {}
  const orderFlow = generateMockOrderFlow(20);

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>{ticker} 데이터를 가져올 수 없습니다. 백엔드 서버를 확인하세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{ticker}</h2>
        <p className="text-slate-400">${data.current_price.toLocaleString()}</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">예측 결과</h3>
        <div className="flex gap-8">
          <PredictionBadge label="2주 후" prediction={data.prediction.week2} />
          <PredictionBadge label="4주 후" prediction={data.prediction.week4} />
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            뉴스 감성 점수: <span className={data.sentiment_score > 0 ? "text-emerald-400" : "text-red-400"}>
              {data.sentiment_score > 0 ? "+" : ""}{data.sentiment_score.toFixed(2)}
            </span>
          </p>
        </div>
      </div>
      <OrderFlowChart data={orderFlow} />
    </div>
  );
}
