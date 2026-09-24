import { numberOrNull, uniqueById } from "./common.js";

export function normalizeFreewaySections(items) {
  return uniqueById(items.map((x) => {
    const id = String(x.SectionID || "");
    if (!id) return null;
    return {
      id,
      roadId: x.RoadID || null,
      roadName: x.RoadName || null,
      direction: x.RoadDirection || null,
      name: x.SectionName || [x.Start, x.End].filter(Boolean).join(" → ") || id,
      startMile: numberOrNull(x.StartMile),
      endMile: numberOrNull(x.EndMile),
      lengthKm: numberOrNull(x.Distance)
    };
  }).filter(Boolean));
}

export function normalizeFreewayLive(items) {
  return uniqueById(items.map((x) => {
    const id = String(x.SectionID || "");
    if (!id) return null;
    let speed = numberOrNull(x.TravelSpeed);
    if (speed === 250 || (speed != null && speed < 0)) speed = null;
    return {
      id,
      roadName: x.RoadName || null,
      direction: x.RoadDirection || null,
      speedKph: speed,
      travelTimeSeconds: numberOrNull(x.TravelTime),
      congestionCode: numberOrNull(x.CongestionLevel),
      closed: Boolean(x.IsClosed || x.Closed),
      sourceUpdatedAt: x.DataCollectTime || null
    };
  }).filter(Boolean));
}

export function normalizeXueshan(sectionItems, liveItems) {
  const sections = new Map(normalizeFreewaySections(sectionItems).map((x) => [x.id, x]));
  return normalizeFreewayLive(liveItems).map((live) => {
    const section = sections.get(live.id);
    if (!section) return null;
    const label = `${section.roadName || ""} ${section.name || ""}`;
    if (!/(國道5|國5|Freeway 5|National Highway 5)/i.test(label)) return null;
    if (!/(雪山|坪林|頭城|石碇)/.test(label)) return null;
    return { ...live, ...section, speedKph: live.speedKph, sourceUpdatedAt: live.sourceUpdatedAt };
  }).filter(Boolean);
}
