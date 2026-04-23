import Link from "next/link";

export default function PredictionHistoryLink({ ticker }: { ticker: string }) {
  return (
    <Link href={`/stock/${ticker}/history`} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0",
      fontSize: 12, color: "var(--text-3)", textDecoration: "none",
      borderTop: "1px solid var(--border)",
    }}>
      <span>예측 기록 보기</span>
      <span style={{ fontSize: 11 }}>→</span>
    </Link>
  );
}
