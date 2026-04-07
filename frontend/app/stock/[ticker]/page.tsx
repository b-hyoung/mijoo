import { fetchPrediction, fetchHistory } from "@/lib/api";
import PredictionBadge from "@/components/PredictionBadge";
import OrderFlowChart from "@/components/OrderFlowChart";

export default async function StockDetailPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

  const [data, orderFlow] = await Promise.all([
    fetchPrediction(ticker).catch(() => null),
    fetchHistory(ticker, 30)
  ]);

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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">AI 판정 결과</h3>
        {data.debate && (
          <div className={`flex items-start gap-3 p-3 rounded-lg ${
            data.debate.direction === "UP"
              ? "bg-emerald-950 border border-emerald-800"
              : "bg-red-950 border border-red-800"
          }`}>
            <span className="text-2xl">{data.debate.direction === "UP" ? "📈" : "📉"}</span>
            <div>
              <p className={`font-semibold text-sm ${data.debate.direction === "UP" ? "text-emerald-400" : "text-red-400"}`}>
                {data.debate.direction === "UP" ? "상승" : "하락"} {data.debate.confidence}% 신뢰도
              </p>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{data.debate.summary}</p>
            </div>
          </div>
        )}
        <div className="flex gap-8">
          <PredictionBadge label="2주 후" prediction={data.prediction.week2} />
          <PredictionBadge label="4주 후" prediction={data.prediction.week4} />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
          <div>
            <p className="text-slate-500">뉴스 감성</p>
            <p className={`font-semibold mt-0.5 ${data.sentiment_score > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {data.sentiment_score > 0 ? "+" : ""}{data.sentiment_score.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">공매도 비율</p>
            <p className="font-semibold text-white mt-0.5">{data.short_float_pct?.toFixed(1) ?? "N/A"}%</p>
          </div>
          <div>
            <p className="text-slate-500">매수 우위</p>
            <p className={`font-semibold mt-0.5 ${(data.order_flow?.buy_dominance_pct ?? 50) > 50 ? "text-emerald-400" : "text-red-400"}`}>
              {data.order_flow?.buy_dominance_pct.toFixed(0) ?? "N/A"}%
            </p>
          </div>
        </div>
      </div>
      <OrderFlowChart data={orderFlow} />
    </div>
  );
}
