import { dataUrl, USE_SNAPSHOT, readSnapshotOnServer } from "./dataSource";

export { USE_SNAPSHOT };

// Server-side (including build time) fetch helper. In snapshot mode we
// read the JSON off disk so static export works without a running server.
async function getJSON<T>(snapshotRel: string, apiPath: string, cache: "no-store" | { next?: { revalidate: number } } = "no-store"): Promise<T | null> {
  if (USE_SNAPSHOT && typeof window === "undefined") {
    return readSnapshotOnServer<T>(snapshotRel);
  }
  const url = USE_SNAPSHOT ? `/data/${snapshotRel}` : `${apiPath}`;
  const opts = typeof cache === "string" ? { cache } : cache;
  try {
    const res = await fetch(url, opts as RequestInit);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface WeekPredictionPoint {
  direction: "UP" | "DOWN";
  confidence: number;
  price_low: number;
  price_high: number;
  price_target: number;
}

export interface WeekPredictionRange {
  direction: "UP" | "DOWN";
  up_probability: number;
  range_low: number;
  range_high: number;
}

export type WeekPrediction = WeekPredictionPoint | WeekPredictionRange;

export function isPointPrediction(w: WeekPrediction): w is WeekPredictionPoint {
  return "price_target" in w;
}

export interface DebatePersona {
  id: string;
  role?: string;
  domain?: string;
  stance?: string;
  direction?: "UP" | "DOWN";
  confidence?: number;
  argument: string;
}

export interface DebateResult {
  direction: "UP" | "DOWN";
  confidence: number;
  verdict?: "매수" | "관망" | "매도";
  summary: string;
  bull_points?: string[];
  bear_points?: string[];
  stock_bull?: string[];
  stock_bear?: string[];
  market_bull?: string[];
  market_bear?: string[];
  weekly_outlook?: Record<string, string>;
  key_news?: { headline: string; summary: string }[];
  debate_rounds: number;
  personas?: DebatePersona[];
}

export interface OrderFlow {
  buy_dominance_pct: number;
  obv_trend: "UP" | "DOWN";
  is_accumulation: boolean;
}

export interface AnalystData {
  target_mean: number | null;
  target_high: number | null;
  target_low: number | null;
  upside_pct: number | null;
  num_analysts: number | null;
  recommendation: string;
}

export interface InsiderTransaction {
  date: string;
  insider: string;
  title: string;
  type: "매수" | "매도" | "기타";
  shares: number;
  value: number;
}

export interface InsiderData {
  recent: InsiderTransaction[];
  net_shares_90d: number;
}

export interface InstitutionalHolder {
  name: string;
  pct_held: number | null;
  shares: number | null;
  change_pct?: number;
  date_reported?: string;
}

export interface InstitutionalData {
  top_holders: InstitutionalHolder[];
  total_pct: number | null;
}

export interface Signals {
  rsi: number;
  macd_cross: "BULLISH" | "BEARISH";
  ma_trend: "BULLISH" | "BEARISH";
  bb_position: number;
  volume_ratio: number;
}

export interface MacroData {
  vix: number | null;
  vix_20d_change: number | null;
  treasury_10y: number | null;
  treasury_10y_20d_change: number | null;
  dxy: number | null;
  dxy_20d_change: number | null;
}

export interface OptionsData {
  pc_ratio: number | null;
  iv_rank: number | null;
  unusual_activity: number | null;
  unusual_side: string | null;
  data_source: string;
  expiry_used: string | null;
}

export interface EarningsQuarter {
  quarter: string;
  eps_expected: number | null;
  eps_actual: number | null;
  eps_surprise_pct: number | null;
  revenue_expected: number | null;
  revenue_actual: number | null;
  revenue_surprise_pct: number | null;
}

export interface EarningsData {
  next_date: string | null;
  days_until: number | null;
  history: EarningsQuarter[];
}

export interface AnomalySignal {
  name: string;
  score: number;
  direction: string | null;
  detail: string;
}

export interface AnomalyData {
  score: number;
  direction: string | null;
  level: string;
  signals: AnomalySignal[];
}

export interface InsiderClusterData {
  buyers_30d: number;
  trades_30d: number;
  total_value_30d: number;
  cluster_detected: boolean;
  c_level_buy: boolean;
  last_buy_date: string | null;
  recent: {
    filing_date: string;
    trade_date: string;
    insider: string;
    title: string;
    trade_type: string;
    price: number;
    qty: number;
    value: number;
  }[];
  source: string;
}

export interface RedditMentionsData {
  mentions: number;
  dollar_mentions: number;
  scanned_posts: number;
  latest_title: string | null;
  latest_at: string | null;
}

export interface PredictionResult {
  ticker: string;
  current_price: number;
  sentiment_score: number;
  short_float_pct?: number;
  short_change?: string;
  order_flow?: OrderFlow;
  news_headlines?: { title: string; url: string }[];
  signals?: Signals;
  analyst?: AnalystData;
  insider?: InsiderData;
  institutional?: InstitutionalData;
  macro?: MacroData;
  options?: OptionsData;
  earnings?: EarningsData;
  insider_cluster?: InsiderClusterData;
  reddit?: RedditMentionsData;
  anomaly?: AnomalyData;
  prediction: {
    week1: WeekPredictionPoint;
    week2: WeekPredictionPoint;
    week3: WeekPredictionRange;
    week4: WeekPredictionRange;
  };
  debate?: DebateResult;
  predicted_at?: string;
  confluence?: {
    aligned_count: number;
    total: number;
    majority_direction: "UP" | "DOWN";
    badge: "강한 확증" | "대체로 일치" | "혼조 — 되돌림 경계";
    tone: "strong" | "moderate" | "mixed";
    per_week: ("UP" | "DOWN")[];
    explanation?: string;
    structural_signals?: {
      score: number;
      rows: {
        key: string;
        label: string;
        value: number;
        weight: number;
        contribution: number;
      }[];
    };
  };
  upcoming_events?: {
    type: "FOMC" | "CPI" | "NFP" | "earnings";
    date: string;
    days_until: number;
    ticker?: string;
  }[];
}

export interface StockList {
  tickers: string[];
}

export async function fetchPrediction(ticker: string): Promise<PredictionResult> {
  const data = await getJSON<PredictionResult>(
    `predict/${ticker}.json`,
    `http://localhost:8000/predict/${ticker}`,
  );
  if (!data) throw new Error(`Failed to fetch prediction for ${ticker}`);
  return data;
}

export async function fetchStockList(): Promise<StockList> {
  const data = await getJSON<StockList>("stocks.json", "http://localhost:8000/stocks/list");
  if (!data) throw new Error("Failed to fetch stock list");
  return data;
}

export async function addCustomTicker(ticker: string): Promise<void> {
  if (USE_SNAPSHOT) return; // write ops disabled in snapshot mode
  await fetch(dataUrl(`stocks/custom/${ticker}`), { method: "POST" });
}

export async function removeCustomTicker(ticker: string): Promise<void> {
  if (USE_SNAPSHOT) return;
  await fetch(dataUrl(`stocks/custom/${ticker}`), { method: "DELETE" });
}

export interface DayFlow {
  date: string;
  buy_volume: number;
  sell_volume: number;
  obv: number;
  is_accumulation: boolean;
}

export async function fetchHistory(ticker: string, days: number = 30): Promise<DayFlow[]> {
  const data = await getJSON<{ history: any[] }>(
    `history/${ticker}.json`,
    `http://localhost:8000/history/${ticker}?days=${days}`,
    { next: { revalidate: 3600 } },
  );
  if (!data?.history) return [];
  const rows = USE_SNAPSHOT ? data.history.slice(-days) : data.history;
  return rows.map((d: any) => ({
    date: d.date.slice(5),
    buy_volume: d.buy_volume,
    sell_volume: d.sell_volume,
    obv: d.obv,
    is_accumulation: d.is_accumulation,
  }));
}

export interface WarmingStatus {
  warming: boolean;
  cached_count: number;
  total: number;
  last_warmed_at: string | null;
}

export async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  const data = await getJSON<{ history: any[] }>(
    `history/${ticker}.json`,
    `http://localhost:8000/history/${ticker}?days=1`,
  );
  if (!data?.history) return null;
  const last = data.history[data.history.length - 1];
  return last?.close ?? null;
}

export async function translateTexts(texts: string[]): Promise<string[]> {
  if (USE_SNAPSHOT) return texts; // no server to translate on; pass through
  try {
    const res = await fetch(dataUrl("translate/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) return texts;
    const data = await res.json();
    return data.translations ?? texts;
  } catch {
    return texts;
  }
}

export interface PredictionHistoryEntry {
  id: number;
  predicted_at: string;
  age_hours: number;
  current_price_at_prediction: number;
  verdict: string | null;
  direction: string | null;
  confidence: number | null;
  summary: string | null;
  week1: WeekPrediction | null;
  week2: WeekPrediction | null;
  week3: WeekPrediction | null;
  week4: WeekPrediction | null;
  weekly_outlook: Record<string, string> | null;
}

export async function fetchPredictionHistory(ticker: string, limit: number = 10): Promise<PredictionHistoryEntry[]> {
  const data = await getJSON<{ history: PredictionHistoryEntry[] }>(
    `prediction-history/${ticker}.json`,
    `http://localhost:8000/prediction-history/${ticker}?limit=${limit}`,
  );
  const rows = data?.history ?? [];
  return USE_SNAPSHOT ? rows.slice(0, limit) : rows;
}

export interface AccuracyRecent {
  date: string;
  predicted_direction: "UP" | "DOWN";
  actual_direction: "UP" | "DOWN";
  price_at_prediction: number;
  current_price: number;
  actual_pct: number;
  expected_pct: number | null;
  status: "miss" | "hit" | "exceed";
  correct: boolean;
}

export interface AccuracyTickerStat {
  ticker: string;
  total: number;
  correct: number;   // hit or exceed (direction matched)
  exceed: number;
  hit_rate: number;
  current_price: number | null;
  recent: AccuracyRecent[];
}

export interface AccuracyResult {
  window_days: number;
  overall: { total: number; correct: number; exceed: number; hit_rate: number };
  tickers: AccuracyTickerStat[];
}

export async function fetchAccuracy(): Promise<AccuracyResult | null> {
  return getJSON<AccuracyResult>("accuracy.json", "http://localhost:8000/stats/accuracy");
}

export interface MissAnalysis {
  ticker: string;
  analyzed_at?: string;
  miss_count: number;
  predicted_direction?: "UP" | "DOWN";
  actual_direction?: "UP" | "DOWN";
  drivers?: string[];
  advice?: string;
  summary?: string;
  misses?: {
    predicted_at: string;
    predicted_direction: "UP" | "DOWN";
    actual_direction: "UP" | "DOWN";
    price_at: number;
    current_price: number;
    change_pct: number;
    reasoning: string;
  }[];
  cached?: boolean;
  message?: string;
}

export async function fetchMissAnalysis(ticker: string, force = false): Promise<MissAnalysis | null> {
  // Snapshot mode: force is ignored (no server to regenerate)
  const apiPath = `http://localhost:8000/stats/miss-analysis/${ticker}${force ? "?force=true" : ""}`;
  return getJSON<MissAnalysis>(`miss-analysis/${ticker}.json`, apiPath);
}

export async function fetchStatus(): Promise<WarmingStatus> {
  // Status (warming progress) is meaningless in snapshot mode — no live server.
  if (USE_SNAPSHOT) return { warming: false, cached_count: 0, total: 0, last_warmed_at: null };
  try {
    const res = await fetch(dataUrl("status"), { cache: "no-store" });
    if (!res.ok) return { warming: false, cached_count: 0, total: 0, last_warmed_at: null };
    return res.json();
  } catch {
    return { warming: false, cached_count: 0, total: 0, last_warmed_at: null };
  }
}
