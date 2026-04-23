export function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function stalenessLevel(iso: string | undefined | null): "fresh" | "stale" | "old" {
  if (!iso) return "old";
  const ageHr = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (ageHr < 24) return "fresh";
  if (ageHr < 72) return "stale";
  return "old";
}
