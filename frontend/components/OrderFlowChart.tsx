"use client";

import { useEffect, useRef, useState } from "react";
import { DayFlow } from "@/lib/api";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Cell } from "recharts";

interface Props {
  data: DayFlow[];
  isAccumulation?: boolean;
}

export default function OrderFlowChart({ data, isAccumulation }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    function measure() {
      if (ref.current) setWidth(ref.current.clientWidth - 40);
    }
    measure();
    // 약간 딜레이 — 레이아웃 잡힌 후 재측정
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", measure); };
  }, []);

  if (!data || data.length === 0) {
    return (
      <div ref={ref} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
          1개월 매수/매도 흐름
        </h3>
        <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--text-3)" }}>데이터를 가져올 수 없습니다</p>
      </div>
    );
  }

  const maxVol = Math.max(...data.map(d => Math.max(d.buy_volume, d.sell_volume)));
  const hasAccumulation = isAccumulation ?? false;

  const recent5 = data.slice(-5);
  const sellDominantDays = recent5.filter(d => d.sell_volume > d.buy_volume).length;
  const obvDropping = data.length >= 2 && data[data.length - 1].obv < data[Math.max(0, data.length - 6)].obv;
  const hasSellPressure = sellDominantDays >= 4 && obvDropping;

  return (
    <div ref={ref} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
          1개월 매수/매도 흐름
        </h3>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-3)" }}>
          <span><span style={{ color: "var(--up)" }}>■</span> 매수</span>
          <span><span style={{ color: "var(--down)" }}>■</span> 매도</span>
          <span><span style={{ color: "#f5a623" }}>—</span> OBV</span>
        </div>
      </div>
      {width > 0 ? (
        <ComposedChart width={width} height={140} data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="vol" hide domain={[0, maxVol * 1.2]} />
          <YAxis yAxisId="obv" hide />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, borderRadius: 6 }}
            labelStyle={{ color: "var(--text-2)" }}
            itemStyle={{ color: "var(--text-2)" }}
          />
          <Bar yAxisId="vol" dataKey="buy_volume" name="매수" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill="#2dd4a0" opacity={entry.is_accumulation ? 1 : 0.5} />
            ))}
          </Bar>
          <Bar yAxisId="vol" dataKey="sell_volume" name="매도" fill="#f06868" opacity={0.5} radius={[2, 2, 0, 0]} />
          <Line yAxisId="obv" type="monotone" dataKey="obv" stroke="#f5a623" dot={false} strokeWidth={1.5} name="OBV" />
        </ComposedChart>
      ) : (
        <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>차트 로딩중...</span>
        </div>
      )}
      {hasAccumulation && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <span style={{
            background: "rgba(45,212,160,0.1)", border: "1px solid rgba(45,212,160,0.3)",
            color: "var(--up)", fontSize: 11, padding: "4px 12px", borderRadius: 20,
          }}>
            ⚡ 조용한 매집 구간 감지
          </span>
        </div>
      )}
      {hasSellPressure && !hasAccumulation && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <span style={{
            background: "rgba(240,104,104,0.1)", border: "1px solid rgba(240,104,104,0.3)",
            color: "var(--down)", fontSize: 11, padding: "4px 12px", borderRadius: 20,
          }}>
            ⚠ 매도 압력 증가 감지
          </span>
        </div>
      )}
    </div>
  );
}
