// Two-mode data source:
//   - "api"      : fetch live from local backend (dev)
//   - "snapshot" : read pre-generated JSON files from /data (prod / Vercel)
//
// Controlled by NEXT_PUBLIC_DATA_SOURCE. Default "api" for local dev.
// Set NEXT_PUBLIC_DATA_SOURCE=snapshot in Vercel env vars.

export const USE_SNAPSHOT =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "snapshot";

const API_BASE =
  typeof window === "undefined"
    ? process.env.INTERNAL_API_URL ?? "http://localhost:8000"
    : "http://localhost:8000";

/** Server-side snapshot read: during build there is no HTTP server, so we
 *  read the JSON file directly from /frontend/public/data. Returns null
 *  if the file does not exist. Only call this from server components or
 *  build-time helpers. */
export async function readSnapshotOnServer<T = unknown>(relPath: string): Promise<T | null> {
  if (!USE_SNAPSHOT || typeof window !== "undefined") return null;
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "public", "data", relPath);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/** Map a backend path to either live URL or a static JSON path.
 *
 *   dataUrl("predict/AAPL")        → /data/predict/AAPL.json    (snapshot)
 *                                   → http://localhost:8000/predict/AAPL (api)
 *   dataUrl("stats/accuracy")      → /data/accuracy.json            (snapshot)
 *                                   → http://localhost:8000/stats/accuracy (api)
 */
export function dataUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  if (!USE_SNAPSHOT) return `${API_BASE}/${clean}`;

  // Snapshot path rewrites. Keep parallel to export_snapshots.py
  if (clean === "stats/accuracy") return "/data/accuracy.json";
  if (clean === "stocks/list") return "/data/stocks.json";
  // e.g. "predict/AAPL" → "/data/predict/AAPL.json"
  // Strip any ?query=... suffix (e.g. history/AAPL?days=30 → history/AAPL)
  const [barePath] = clean.split("?");
  // history needs ?days=30 snapshot; export only dumps one version so drop query
  if (barePath.startsWith("history/")) {
    return `/data/${barePath}.json`;
  }
  if (barePath.startsWith("prediction-history/")) {
    return `/data/${barePath}.json`;
  }
  if (barePath.startsWith("stats/miss-analysis/")) {
    const ticker = barePath.replace("stats/miss-analysis/", "");
    return `/data/miss-analysis/${ticker}.json`;
  }
  return `/data/${barePath}.json`;
}
