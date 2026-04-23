"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isSettings = pathname === "/settings";
  const isStock = pathname.startsWith("/stock/");
  const isHistory = pathname.endsWith("/history");
  const ticker = isStock ? pathname.split("/")[2]?.toUpperCase() : null;

  const navLink = (href: string, label: string, active: boolean) => (
    <Link href={href} style={{
      fontSize: 12, textDecoration: "none",
      padding: "5px 12px", borderRadius: 6,
      color: active ? "var(--text)" : "var(--text-3)",
      background: active ? "var(--surface-2)" : "transparent",
    }}>
      {label}
    </Link>
  );

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
    }}>
      <nav style={{
        maxWidth: 1400, margin: "0 auto", padding: "0 var(--sp-32)",
        height: 48, display: "flex", alignItems: "center",
      }}>
        {/* Logo */}
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 8,
          textDecoration: "none", marginRight: "auto",
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isHome ? "var(--brand)" : "var(--text-3)",
          }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", letterSpacing: "-0.02em" }}>
            PREDICTOR
          </span>
        </Link>

        {/* Center breadcrumb */}
        {isStock && ticker && (
          <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 6, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            <Link href="/" style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}>종목</Link>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>/</span>
            {isHistory ? (
              <>
                <Link href={`/stock/${ticker}`} style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}>{ticker}</Link>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>/</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>기록</span>
              </>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{ticker}</span>
            )}
          </div>
        )}

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {navLink("/", "대시보드", isHome)}
          {navLink("/weekly", "주간리포트", pathname === "/weekly")}
          {isStock && ticker && navLink(`/stock/${ticker}/history`, "기록", isHistory)}
          {navLink("/settings", "설정", isSettings)}
        </div>
      </nav>
    </header>
  );
}
