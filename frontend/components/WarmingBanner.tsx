"use client";

import { useEffect, useState } from "react";
import { fetchStatus, WarmingStatus } from "@/lib/api";

export default function WarmingBanner() {
  const [status, setStatus] = useState<WarmingStatus | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function check() {
      const s = await fetchStatus();
      setStatus(s);
      if (!s.warming) clearInterval(interval);
    }
    check();
    interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!status?.warming) return null;

  const pct = status.total > 0 ? Math.round((status.cached_count / status.total) * 100) : 0;

  return (
    <div className="warming-banner">
      <style>{`
        .warming-banner { background: var(--brand-bg); border: 1px solid var(--brand); border-radius: 8px; padding: 10px 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
        .warming-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--brand); border-top-color: transparent; animation: wspin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes wspin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="warming-spinner" />
      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
        초기 분석 중
        <span style={{ color: "var(--brand)", fontWeight: 600, margin: "0 4px" }}>{status.cached_count}/{status.total}</span>
        ({pct}%) — 처음 실행 시 수 분 소요됩니다
      </span>
    </div>
  );
}
