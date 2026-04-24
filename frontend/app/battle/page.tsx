import StockBattle from "@/components/StockBattle";

export const metadata = {
  title: "주식 사기 대결 (베타 0.1) — Nasdaq Predictor",
};

export default function BattlePage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>
            ⚔️ 주식 사기 대결
          </h1>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: "var(--brand)",
            background: "rgba(104,117,245,0.1)",
            border: "1px solid rgba(104,117,245,0.3)",
            borderRadius: 4, padding: "2px 7px",
            letterSpacing: "0.04em",
          }}>
            BETA 0.1
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6, lineHeight: 1.6 }}>
          두 종목을 골라 20+ 지표를 나란히 비교하고 항목별 우세를 체크합니다.
          최종 종합 점수로 1~2주 관점에서 어느 쪽이 더 유리한지 판정합니다.
          <br />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            ※ 재미용이에요. 실제 투자 결정은 본인 책임.
          </span>
        </p>
      </div>

      <StockBattle />
    </div>
  );
}
