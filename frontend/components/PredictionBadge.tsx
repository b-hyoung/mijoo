import { WeekPrediction } from "@/lib/api";

interface Props {
  label: string;
  prediction: WeekPrediction;
}

export default function PredictionBadge({ label, prediction }: Props) {
  const isUp = prediction.direction === "UP";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${
        isUp ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
             : "bg-red-950 text-red-400 border border-red-800"
      }`}>
        <span>{isUp ? "📈" : "📉"}</span>
        <span>{isUp ? "상승" : "하락"}</span>
        <span className="text-xs font-normal opacity-70">{prediction.confidence.toFixed(0)}%</span>
      </div>
      <span className="text-xs text-slate-400">
        ${prediction.price_low.toLocaleString()} ~ ${prediction.price_high.toLocaleString()}
      </span>
    </div>
  );
}
