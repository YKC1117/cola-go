export function makePublicCacheKey(request) {
  const url = new URL(request.url);
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

export function classifySnapshot(row, now = Date.now()) {
  if (!row) return "missing";
  if (now < Number(row.expires_at)) return "fresh";
  if (now < Number(row.stale_until)) return "stale";
  return "expired";
}

export function publicCacheSeconds(route) {
  return Math.max(5, Math.min(Number(route.ttl?.fresh || 30), 300));
}
