import Link from "next/link";
import { PredictionResult } from "@/lib/api";
import PredictionBadge from "./PredictionBadge";

interface Props {
  data: PredictionResult;
}

export default function StockCard({ data }: Props) {
  const debate = data.debate;
  const isUp = debate ? debate.direction === "UP" : data.prediction.week2.direction === "UP";
  const confidence = debate ? debate.confidence : data.prediction.week2.confidence;

  return (
    <Link href={`/stock/${data.ticker}`}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors cursor-pointer h-full">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">{data.ticker}</h2>
            <p className="text-slate-400 text-sm">${data.current_price.toLocaleString()}</p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${
            isUp ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                 : "bg-red-950 text-red-400 border border-red-800"
          }`}>
            <span>{isUp ? "📈" : "📉"}</span>
            <span>{isUp ? "상승" : "하락"}</span>
            <span className="text-xs opacity-70">{confidence}%</span>
          </div>
        </div>

        {debate?.summary && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">
            {debate.summary}
          </p>
        )}

        <div className="flex gap-4 mb-3">
          <PredictionBadge label="2주 후" prediction={data.prediction.week2} />
          <PredictionBadge label="4주 후" prediction={data.prediction.week4} />
        </div>

        <div className="flex gap-3 text-xs text-slate-500 border-t border-slate-800 pt-3">
          {data.short_float_pct !== undefined && (
            <span>공매도 {data.short_float_pct.toFixed(1)}%</span>
          )}
          {data.order_flow?.is_accumulation && (
            <span className="text-amber-400">⚡ 매집</span>
          )}
          {data.order_flow && (
            <span>매수 {data.order_flow.buy_dominance_pct.toFixed(0)}%</span>
          )}
        </div>
      </div>
    </Link>
  );
}
