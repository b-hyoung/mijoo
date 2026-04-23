"use client";

import { useState } from "react";

interface NewsItem {
  headline: string;
  summary: string;
}

interface HeadlineItem {
  title: string;
  url: string;
}

export default function NewsAccordion({ keyNews, headlines }: {
  keyNews: NewsItem[];
  headlines: HeadlineItem[];
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const items = keyNews.length > 0
    ? keyNews.slice(0, 5).map(n => ({ title: n.headline, summary: n.summary, url: "" }))
    : headlines.slice(0, 5).map(h => ({ title: h.title, summary: "", url: h.url }));

  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              onClick={() => setOpenIdx(isOpen ? null : i)}
              style={{
                padding: "10px 0",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, flex: 1 }}>
                {item.title}
              </span>
              <span style={{
                fontSize: 10, color: "var(--text-3)", flexShrink: 0, marginTop: 2,
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}>
                ▼
              </span>
            </div>
            {isOpen && (
              <div style={{ paddingBottom: 12 }}>
                {item.summary ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, background: "var(--surface)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    {item.summary}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                    요약 없음
                  </p>
                )}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--brand)", textDecoration: "none", display: "inline-block", marginTop: 6 }}>
                    원문 보기 →
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
