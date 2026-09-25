import { numberOrNull, uniqueById } from "./common.js";

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeCctv(items) {
  return uniqueById(items.map((x) => {
    const id = String(x.CCTVID || x.CCTVId || "");
    if (!id) return null;
    const streamUrl = safeHttpUrl(x.VideoStreamURL || x.StreamURL);
    const imageUrl = safeHttpUrl(x.ImageURL || x.ImageUrl);
    return {
      id,
      roadName: x.RoadName || null,
      direction: x.RoadDirection || null,
      name: x.LocationDescription || x.LocationMile || id,
      lat: numberOrNull(x.PositionLat),
      lon: numberOrNull(x.PositionLon),
      imageUrl,
      streamUrl,
      imageRefreshSeconds: numberOrNull(x.ImageRefreshInterval),
      displayPolicy: streamUrl || imageUrl ? "metadata-link" : "metadata-only"
    };
  }).filter(Boolean));
}
