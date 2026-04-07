import Link from "next/link";
import { PredictionResult } from "@/lib/api";
import PredictionBadge from "./PredictionBadge";

interface Props {
  data: PredictionResult;
}

export default function StockCard({ data }: Props) {
  const sentimentLabel = data.sentiment_score > 0.2 ? "긍정적"
    : data.sentiment_score < -0.2 ? "부정적" : "중립";
  const sentimentColor = data.sentiment_score > 0.2 ? "text-emerald-400"
    : data.sentiment_score < -0.2 ? "text-red-400" : "text-slate-400";

  return (
    <Link href={`/stock/${data.ticker}`}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors cursor-pointer">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{data.ticker}</h2>
            <p className="text-slate-400 text-sm">${data.current_price.toLocaleString()}</p>
          </div>
          <span className={`text-xs ${sentimentColor}`}>뉴스 {sentimentLabel}</span>
        </div>
        <div className="flex gap-6">
          <PredictionBadge label="2주 후" prediction={data.prediction.week2} />
          <PredictionBadge label="4주 후" prediction={data.prediction.week4} />
        </div>
      </div>
    </Link>
  );
}
