import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nasdaq Predictor",
  description: "나스닥 대형주 주가 예측 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-slate-950 text-white min-h-screen`}>
        <nav className="border-b border-slate-800 px-6 py-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <h1 className="font-bold text-sky-400">Nasdaq Predictor</h1>
            <a href="/settings" className="text-sm text-slate-400 hover:text-white">설정</a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
