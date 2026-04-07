"use client";

import { DayFlow } from "@/lib/api";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";

interface Props {
  data: DayFlow[];
}

export default function OrderFlowChart({ data }: Props) {
  const maxVol = Math.max(...data.map(d => Math.max(d.buy_volume, d.sell_volume)));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-300">1개월 매수/매도 흐름</h3>
        <div className="flex gap-4 text-xs text-slate-500">
          <span><span className="text-emerald-400">■</span> 매수</span>
          <span><span className="text-red-400">■</span> 매도</span>
          <span><span className="text-amber-400">—</span> OBV</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
          <YAxis yAxisId="vol" hide domain={[0, maxVol * 1.2]} />
          <YAxis yAxisId="obv" hide />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Bar yAxisId="vol" dataKey="buy_volume" name="매수" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.is_accumulation ? "#10b981" : "#34d399"}
                opacity={entry.is_accumulation ? 1 : 0.7}
              />
            ))}
          </Bar>
          <Bar yAxisId="vol" dataKey="sell_volume" name="매도" fill="#f87171" opacity={0.7} radius={[2, 2, 0, 0]} />
          <Line yAxisId="obv" type="monotone" dataKey="obv" stroke="#fbbf24" dot={false} strokeWidth={1.5} name="OBV" />
        </ComposedChart>
      </ResponsiveContainer>
      {data.some(d => d.is_accumulation) && (
        <div className="mt-3 flex justify-center">
          <span className="bg-amber-950 border border-amber-700 text-amber-400 text-xs px-3 py-1 rounded-full">
            ⚡ 조용한 매집 구간 감지
          </span>
        </div>
      )}
    </div>
  );
}
