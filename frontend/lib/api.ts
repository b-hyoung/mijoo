const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface WeekPrediction {
  direction: "UP" | "DOWN";
  confidence: number;
  price_low: number;
  price_high: number;
  price_target: number;
}

export interface DebateResult {
  direction: "UP" | "DOWN";
  confidence: number;
  summary: string;
  debate_rounds: number;
}

export interface OrderFlow {
  buy_dominance_pct: number;
  obv_trend: "UP" | "DOWN";
  is_accumulation: boolean;
}

export interface PredictionResult {
  ticker: string;
  current_price: number;
  sentiment_score: number;
  short_float_pct?: number;
  order_flow?: OrderFlow;
  prediction: {
    week2: WeekPrediction;
    week4: WeekPrediction;
  };
  debate?: DebateResult;
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

export interface DayFlow {
  date: string;
  buy_volume: number;
  sell_volume: number;
  obv: number;
  is_accumulation: boolean;
}

export async function fetchHistory(ticker: string, days: number = 30): Promise<DayFlow[]> {
  try {
    const res = await fetch(`${API_BASE}/history/${ticker}?days=${days}`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.history.map((d: any) => ({
      date: d.date.slice(5), // "MM-DD" format
      buy_volume: d.buy_volume,
      sell_volume: d.sell_volume,
      obv: d.obv,
      is_accumulation: d.is_accumulation
    }));
  } catch {
    return [];
  }
}
