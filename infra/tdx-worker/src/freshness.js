export function assessLiveFreshness(items, now = Date.now(), maxAgeSeconds = 300) {
  if (!Array.isArray(items) || items.length === 0) return { fresh: false, newest: null, oldest: null, reason: "empty" };
  const times = [];
  for (const item of items) {
    const ms = Date.parse(item?.sourceUpdatedAt || "");
    if (!Number.isFinite(ms)) return { fresh: false, newest: null, oldest: null, reason: "missing-source-time" };
    times.push(ms);
  }
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const maxAgeMs = Math.max(1, Number(maxAgeSeconds || 300)) * 1000;
  if (oldest > now + 600000) return { fresh: false, newest, oldest, reason: "future-source-time" };
  if (now - oldest > maxAgeMs) return { fresh: false, newest, oldest, reason: "stale-source-time" };
  return { fresh: true, newest, oldest, reason: null };
}
