import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Nasdaq Predictor",
  description: "나스닥 대형주 AI 예측 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Nav />
        <main style={{ maxWidth: 1400, margin: "0 auto", padding: "var(--sp-20) var(--sp-32) var(--sp-48)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
