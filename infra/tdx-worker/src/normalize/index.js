import { normalizeParkingBasic, normalizeParkingAvailability } from "./parking.js";
import {
  normalizeChargingStations, normalizeChargingPoints, normalizeChargingConnectors, normalizeChargingAvailability
} from "./charging.js";
import { normalizeFreewaySections, normalizeFreewayLive, normalizeXueshan } from "./freeway.js";
import { normalizeCctv } from "./cctv.js";

export function normalizeRoute(kind, raw, scope) {
  const city = scope?.startsWith("city:") ? scope.slice(5) : null;
  switch (kind) {
    case "parkingBasic": return normalizeParkingBasic(raw.items, city);
    case "parkingLive": return normalizeParkingAvailability(raw.items, city);
    case "chargingStations": return normalizeChargingStations(raw.items, city);
    case "chargingPoints": return normalizeChargingPoints(raw.items, city);
    case "chargingConnectors": return normalizeChargingConnectors(raw.items, city);
    case "chargingAvailability": return normalizeChargingAvailability(raw.items, city);
    case "freewaySections": return normalizeFreewaySections(raw.items);
    case "freewayLive": return normalizeFreewayLive(raw.items);
    case "freewayCctv": return normalizeCctv(raw.items);
    case "xueshanLive": return normalizeXueshan(raw.sections.items, raw.live.items);
    default: return [];
  }
}
