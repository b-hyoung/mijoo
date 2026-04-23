import Link from "next/link";
import { Suspense } from "react";
import PredictionSection from "./PredictionSection";

interface Props {
  ticker: string;
  currentPrice: number | null;
}

function Skeleton() {
  return (
    <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 22, background: "var(--surface-2)", borderRadius: 4, width: "45%" }} />
      <div style={{ height: 12, background: "var(--surface-2)", borderRadius: 3, width: "70%" }} />
    </div>
  );
}

export default function StockCard({ ticker, currentPrice }: Props) {
  return (
    <Link href={`/stock/${ticker}`} className="stock-card-link" style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: 16, height: "100%",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{ticker}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {currentPrice != null ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </span>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <Suspense fallback={<Skeleton />}>
            <PredictionSection ticker={ticker} />
          </Suspense>
        </div>
      </div>
    </Link>
  );
}
