import type { NextConfig } from "next";

// Build mode is driven by NEXT_PUBLIC_DATA_SOURCE:
//   - snapshot → fully static export (Vercel / static host)
//   - api (default) → standalone SSR (local dev / self-hosted)
const isSnapshot = process.env.NEXT_PUBLIC_DATA_SOURCE === "snapshot";

const nextConfig: NextConfig = isSnapshot
  ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
  : { output: "standalone" };

export default nextConfig;
