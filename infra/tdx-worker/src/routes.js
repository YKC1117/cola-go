import {
  ALL_CITIES, PARKING_BASIC_CITIES, PARKING_LIVE_CITIES, EV_CITY_CITIES, TTL
} from "./config.js";
import { AppError } from "./errors.js";

const ROUTES = [
  // Simple public aliases used by COLA GO. Keep the versioned routes below for compatibility.
  { pattern: /^\/api\/parking\/([^/]+)\/lots$/, kind: "parkingBasic", cityIndex: 1, cities: PARKING_BASIC_CITIES, ttl: TTL.parkingBasic },
  { pattern: /^\/api\/parking\/([^/]+)\/availability$/, kind: "parkingLive", cityIndex: 1, cities: PARKING_LIVE_CITIES, ttl: TTL.parkingLive },
  { pattern: /^\/api\/ev\/([^/]+)\/stations$/, kind: "chargingStations", cityIndex: 1, cities: EV_CITY_CITIES, ttl: TTL.chargingStatic },
  { pattern: /^\/api\/ev\/([^/]+)\/connectors$/, kind: "chargingConnectors", cityIndex: 1, cities: EV_CITY_CITIES, ttl: TTL.chargingStatic },
  { pattern: /^\/api\/ev\/([^/]+)\/status$/, kind: "chargingAvailability", cityIndex: 1, cities: EV_CITY_CITIES, ttl: TTL.chargingLive },
  { pattern: /^\/api\/highway\/traffic$/, kind: "freewayLive", ttl: TTL.freewayLive },
  { pattern: /^\/api\/highway\/cctv$/, kind: "freewayCctv", ttl: TTL.cctv },

  { pattern: /^\/api\/v1\/parking\/([^/]+)$/, kind: "parkingBasic", cityIndex: 1, cities: PARKING_BASIC_CITIES, ttl: TTL.parkingBasic },
  { pattern: /^\/api\/v1\/parking\/([^/]+)\/availability$/, kind: "parkingLive", cityIndex: 1, cities: PARKING_LIVE_CITIES, ttl: TTL.parkingLive },
  { pattern: /^\/api\/v1\/charging\/stations$/, kind: "chargingStations", scope: true, ttl: TTL.chargingStatic },
  { pattern: /^\/api\/v1\/charging\/points$/, kind: "chargingPoints", scope: true, ttl: TTL.chargingStatic },
  { pattern: /^\/api\/v1\/charging\/connectors$/, kind: "chargingConnectors", scope: true, ttl: TTL.chargingStatic },
  { pattern: /^\/api\/v1\/charging\/availability$/, kind: "chargingAvailability", scope: true, ttl: TTL.chargingLive },
  { pattern: /^\/api\/v1\/freeway\/sections$/, kind: "freewaySections", ttl: TTL.freewaySections },
  { pattern: /^\/api\/v1\/freeway\/live$/, kind: "freewayLive", ttl: TTL.freewayLive },
  { pattern: /^\/api\/v1\/freeway\/cctv$/, kind: "freewayCctv", ttl: TTL.cctv },
  { pattern: /^\/api\/v1\/tunnel\/xueshan\/live$/, kind: "xueshanLive", ttl: TTL.freewayLive }
];

const KNOWN_QUERY = new Set(["scope", "limit", "cursor"]);

export function validateNoUnknownQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (!KNOWN_QUERY.has(key)) throw new AppError(400, "INVALID_QUERY", "Unsupported query parameter");
  }
}

export function parseScope(value) {
  if (!value) throw new AppError(400, "INVALID_QUERY", "scope is required");
  const [type, raw] = value.split(":");
  if (type !== "city" || !raw) throw new AppError(422, "UNSUPPORTED_SCOPE", "Only city:<TDXCity> is enabled in v1");
  if (!ALL_CITIES.includes(raw)) throw new AppError(422, "UNSUPPORTED_SCOPE", "Unknown city scope");
  if (!EV_CITY_CITIES.includes(raw)) throw new AppError(422, "UNSUPPORTED_SCOPE", "TDX EV City does not list this city");
  return { type, value: raw, canonical: `city:${raw}` };
}

export function matchRoute(url) {
  validateNoUnknownQuery(url);
  for (const route of ROUTES) {
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    let scope = null;
    let city = null;
    if (route.cityIndex) {
      city = decodeURIComponent(match[route.cityIndex]);
      if (!ALL_CITIES.includes(city)) throw new AppError(422, "UNSUPPORTED_SCOPE", "Unknown city");
      if (!route.cities.includes(city)) throw new AppError(422, "UNSUPPORTED_SCOPE", "TDX does not list this city for this dataset");
      scope = `city:${city}`;
    }
    if (route.scope) {
      const parsed = parseScope(url.searchParams.get("scope"));
      city = parsed.value;
      scope = parsed.canonical;
    }
    return { ...route, city, scope };
  }
  throw new AppError(404, "NOT_FOUND", "Route not found");
}

export function upstreamSpec(route) {
  const city = route.city;
  switch (route.kind) {
    case "parkingBasic":
      return { key: `parking:${city}:static`, path: `/v1/Parking/OffStreet/CarPark/City/${city}`, paginate: true };
    case "parkingLive":
      return { key: `parking:${city}:live`, path: `/v1/Parking/OffStreet/ParkingAvailability/City/${city}`, paginate: true };
    case "chargingStations":
      return { key: `ev:station:${city}`, path: `/v1/EV/Station/City/${city}`, paginate: true };
    case "chargingPoints":
      return { key: `ev:point:${city}`, path: `/v1/EV/ChargingPoint/City/${city}`, paginate: true };
    case "chargingConnectors":
      return { key: `ev:connector:${city}`, path: `/v1/EV/Connector/City/${city}`, paginate: true };
    case "chargingAvailability":
      return { key: `ev:availability:${city}`, path: `/v1/EV/ConnectorLiveStatus/City/${city}`, paginate: true };
    case "freewaySections":
      return { key: "freeway:sections", path: "/v2/Road/Traffic/Section/Freeway", paginate: true };
    case "freewayLive":
      return { key: "freeway:live", path: "/v2/Road/Traffic/Live/Freeway", paginate: true };
    case "freewayCctv":
      return { key: "freeway:cctv", path: "/v2/Road/Traffic/CCTV/Freeway", paginate: true };
    case "xueshanLive":
      return {
        key: "tunnel:xueshan:live",
        multi: [
          { name: "sections", path: "/v2/Road/Traffic/Section/Freeway", paginate: true },
          { name: "live", path: "/v2/Road/Traffic/Live/Freeway", paginate: true }
        ]
      };
    default:
      throw new AppError(404, "NOT_FOUND", "Unknown data route");
  }
}
