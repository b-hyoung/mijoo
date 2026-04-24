import { fetchAccuracy, fetchPrediction, fetchStockList } from "@/lib/api";
import StockBattleClient from "./StockBattleClient";
import type { BattleProfile } from "@/lib/battle";

/** Pre-bakes every ticker's full prediction + accuracy into a client-shippable
 *  map. Client component handles selection + table rendering. */
export default async function StockBattle() {
  let tickers: string[] = [];
  try {
    const list = await fetchStockList();
    tickers = list.tickers;
  } catch {
    return null;
  }
  if (tickers.length < 2) return null;

  const accuracy = await fetchAccuracy();
  const hitMap = new Map<string, number>();
  accuracy?.tickers.forEach(t => hitMap.set(t.ticker, t.hit_rate));

  const entries: Record<string, BattleProfile> = {};
  for (const ticker of tickers) {
    try {
      const p = await fetchPrediction(ticker);
      entries[ticker] = {
        ticker,
        currentPrice: p.current_price,
        verdict: p.debate?.verdict || "관망",
        confidence: p.debate?.confidence || 0,
        prediction: p,
        hitRate: hitMap.get(ticker) ?? 0.5,
      };
    } catch {
      // skip
    }
  }

  const ready = Object.keys(entries);
  if (ready.length < 2) return null;

  return <StockBattleClient entries={entries} tickers={ready} />;
}
