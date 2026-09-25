export function localizedName(value) {
  if (typeof value === "string") return value;
  return value?.Zh_tw || value?.ZhTw || value?.zh_tw || value?.En || null;
}

export function numberOrNull(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function positionOf(value = {}) {
  const lat = numberOrNull(value.PositionLat ?? value.Latitude ?? value.lat);
  const lon = numberOrNull(value.PositionLon ?? value.Longitude ?? value.lon ?? value.lng);
  return { lat, lon };
}

export function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
