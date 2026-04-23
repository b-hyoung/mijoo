import type { Signals } from "@/lib/api";

const TOOLTIPS: Record<string, string> = {
  "RSI(14)": "상대강도지수. 30 이하면 과매도(반등 가능), 70 이상이면 과매수(하락 가능). 50 근처는 중립.",
  "MACD": "이동평균 수렴확산. 골든크로스(MACD가 시그널 위)면 상승 신호, 데드크로스면 하락 신호.",
  "MA 추세": "단기(5일) vs 중기(20일) 이동평균. 단기 > 중기면 상승 추세, 반대면 하락 추세.",
  "볼린저": "볼린저밴드 내 현재 위치. 0%는 하단(과매도), 100%는 상단(과매수), 50%는 중간.",
  "거래량": "최근 5일 평균 대비 오늘 거래량. 1.5x 이상이면 비정상적으로 활발한 거래.",
  "매수우위": "최근 20일간 매수 vs 매도 비율. 55% 이상이면 매수세 우위, 45% 이하면 매도세 우위.",
  "공매도": "전체 유통주식 대비 공매도 비율. 15% 이상이면 하락 베팅 많음. 2주 지연 데이터.",
  "뉴스감성": "최근 30일 뉴스의 긍정/부정 점수. +1에 가까울수록 긍정적, -1에 가까울수록 부정적.",
};

function SignalRow({ label, value, status }: { label: string; value: string; status: "up" | "down" | "neutral" }) {
  const color = status === "up" ? "var(--up)" : status === "down" ? "var(--down)" : "var(--text-2)";
  const tip = TOOLTIPS[label];
  return (
    <div
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", position: "relative", cursor: tip ? "help" : "default" }}
      title={tip}
    >
      <span style={{ fontSize: 12, color: "var(--text-3)", borderBottom: tip ? "1px dotted var(--text-3)" : "none" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

export default function SignalsList({ signals, orderFlow, sentimentScore, shortFloat, shortChange }: {
  signals: Signals;
  orderFlow?: { buy_dominance_pct: number; is_accumulation: boolean };
  sentimentScore: number;
  shortFloat?: number;
  shortChange?: string;
}) {
  const rsi = signals.rsi;
  const rsiSt: "up" | "down" | "neutral" = rsi < 30 ? "up" : rsi > 70 ? "down" : "neutral";
  const rows: { label: string; value: string; status: "up" | "down" | "neutral" }[] = [
    { label: "RSI(14)", value: `${rsi} · ${rsi < 30 ? "과매도" : rsi > 70 ? "과매수" : "중립"}`, status: rsiSt },
    { label: "MACD", value: signals.macd_cross === "BULLISH" ? "골든크로스" : "데드크로스", status: signals.macd_cross === "BULLISH" ? "up" : "down" },
    { label: "MA 추세", value: signals.ma_trend === "BULLISH" ? "단기 › 중기" : "단기 ‹ 중기", status: signals.ma_trend === "BULLISH" ? "up" : "down" },
    { label: "볼린저", value: `${signals.bb_position}%`, status: signals.bb_position > 70 ? "down" : signals.bb_position < 30 ? "up" : "neutral" },
    { label: "거래량", value: `${signals.volume_ratio}x`, status: signals.volume_ratio > 1.2 ? "up" : signals.volume_ratio < 0.8 ? "down" : "neutral" },
  ];
  if (orderFlow) rows.push({ label: "매수우위", value: `${orderFlow.buy_dominance_pct.toFixed(0)}%`, status: orderFlow.buy_dominance_pct > 55 ? "up" : orderFlow.buy_dominance_pct < 45 ? "down" : "neutral" });
  if (shortFloat != null) {
    const changeStr = shortChange ? ` (${shortChange})` : "";
    rows.push({ label: "공매도", value: `${shortFloat.toFixed(1)}%${changeStr}`, status: shortFloat > 15 ? "down" : shortFloat < 5 ? "up" : "neutral" });
  }
  rows.push({ label: "뉴스감성", value: `${sentimentScore > 0 ? "+" : ""}${sentimentScore.toFixed(2)}`, status: sentimentScore > 0.1 ? "up" : sentimentScore < -0.1 ? "down" : "neutral" });
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
          <SignalRow {...r} />
        </div>
      ))}
    </div>
  );
}
