const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface WeekPrediction {
  direction: "UP" | "DOWN";
  confidence: number;
  price_low: number;
  price_high: number;
  price_target: number;
}

export interface PredictionResult {
  ticker: string;
  current_price: number;
  sentiment_score: number;
  prediction: {
    week2: WeekPrediction;
    week4: WeekPrediction;
  };
}

export interface StockList {
  tickers: string[];
}

export async function fetchPrediction(ticker: string): Promise<PredictionResult> {
  const res = await fetch(`${API_BASE}/predict/${ticker}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Failed to fetch prediction for ${ticker}`);
  return res.json();
}

export async function fetchStockList(): Promise<StockList> {
  const res = await fetch(`${API_BASE}/stocks/list`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to fetch stock list");
  return res.json();
}

export async function addCustomTicker(ticker: string): Promise<void> {
  await fetch(`${API_BASE}/stocks/custom/${ticker}`, { method: "POST" });
}

export async function removeCustomTicker(ticker: string): Promise<void> {
  await fetch(`${API_BASE}/stocks/custom/${ticker}`, { method: "DELETE" });
}
