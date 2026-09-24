import { TdxCoordinator } from "./coordinator.js";
import { capabilitiesResponse } from "./capabilities.js";
import { AppError, errorEnvelope } from "./errors.js";
import { makePublicCacheKey, publicCacheSeconds } from "./cache.js";
import { matchRoute, upstreamSpec } from "./routes.js";
import { projectXueshanFromNormalized } from "./normalize/freeway.js";
import { numericEnv, TTL } from "./config.js";

export { TdxCoordinator };

const clientBuckets = new Map();

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins(env).has(origin)) throw new AppError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed");
  return {
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function coarseRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const bucket = Math.floor(now / 60000);
  const key = `${ip}:${bucket}`;
  const count = Number(clientBuckets.get(key) || 0) + 1;
  clientBuckets.set(key, count);
  if (clientBuckets.size > 4000) {
    for (const entry of clientBuckets.keys()) if (!entry.endsWith(`:${bucket}`)) clientBuckets.delete(entry);
  }
  if (count > 120) throw new AppError(429, "CLIENT_RATE_LIMITED", "Too many requests");
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

function withCors(response, headers) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  return result;
}

function pageEnvelope(envelope, url) {
  const limitRaw = url.searchParams.get("limit");
  const cursorRaw = url.searchParams.get("cursor");
  const limit = limitRaw == null ? 500 : Number(limitRaw);
  const offset = cursorRaw == null ? 0 : Number(cursorRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new AppError(400, "INVALID_QUERY", "limit must be an integer from 1 to 1000");
  if (!Number.isInteger(offset) || offset < 0) throw new AppError(400, "INVALID_QUERY", "cursor must be a non-negative integer");

  const items = Array.isArray(envelope.items) ? envelope.items : [];
  const end = Math.min(items.length, offset + limit);
  return {
    ...envelope,
    items: items.slice(offset, end),
    coverage: { ...envelope.coverage, returned: Math.max(0, end - offset), total: items.length },
    pagination: { nextCursor: end < items.length ? String(end) : null }
  };
}

async function getCoordinatorResource(env, route) {
  const stub = env.TDX_COORDINATOR.getByName("global");
  return stub.getResource({
    kind: route.kind,
    scope: route.scope || (route.kind.startsWith("freeway") ? "freeway" : null),
    upstream: upstreamSpec(route),
    ttl: route.ttl
  });
}

async function getXueshan(env) {
  const stub = env.TDX_COORDINATOR.getByName("global");
  const sectionsRoute = { kind: "freewaySections", scope: "freeway", ttl: TTL.freewaySections };
  const liveRoute = { kind: "freewayLive", scope: "freeway", ttl: TTL.freewayLive };
  const [sections, live] = await Promise.all([
    stub.getResource({ ...sectionsRoute, upstream: upstreamSpec(sectionsRoute) }),
    stub.getResource({ ...liveRoute, upstream: upstreamSpec(liveRoute) })
  ]);
  if (!sections.ok) return sections;
  if (!live.ok) return live;

  const items = projectXueshanFromNormalized(sections.envelope.items, live.envelope.items);
  const stale = Boolean(sections.envelope.stale || live.envelope.stale);
  return {
    ok: true,
    envelope: {
      schemaVersion: 1,
      status: stale ? "stale" : "live",
      source: "TDX",
      scope: "freeway:xueshan",
      updatedAt: [sections.envelope.updatedAt, live.envelope.updatedAt].filter(Boolean).sort().at(-1) || null,
      fetchedAt: [sections.envelope.fetchedAt, live.envelope.fetchedAt].filter(Boolean).sort().at(-1) || null,
      expiresAt: live.envelope.expiresAt,
      stale,
      partial: false,
      snapshotId: `${sections.envelope.snapshotId}:${live.envelope.snapshotId}`,
      items,
      coverage: { supported: true, returned: items.length, total: items.length },
      pagination: { nextCursor: null },
      error: null
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    let cors = {};
    try {
      cors = corsHeaders(request, env);
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== "GET") throw new AppError(405, "METHOD_NOT_ALLOWED", "Only GET is supported");

      coarseRateLimit(request);

      if (url.pathname === "/api/v1/health") {
        return jsonResponse({
          ok: true,
          service: "cola-go-tdx",
          env: env.APP_ENV || "unknown",
          tdxEnabled: String(env.TDX_ENABLED).toLowerCase() === "true"
        }, 200, cors);
      }
      if (url.pathname === "/api/v1/capabilities") {
        return jsonResponse(capabilitiesResponse(), 200, cors);
      }

      const routeUrl = new URL(url);
      const limit = routeUrl.searchParams.get("limit");
      const cursor = routeUrl.searchParams.get("cursor");
      routeUrl.searchParams.delete("limit");
      routeUrl.searchParams.delete("cursor");
      const route = matchRoute(routeUrl);

      const cacheKey = makePublicCacheKey(request);
      const edgeCache = caches.default;
      const cached = await edgeCache.match(cacheKey);
      if (cached) return withCors(cached, cors);

      const result = route.kind === "xueshanLive"
        ? await getXueshan(env)
        : await getCoordinatorResource(env, route);

      if (!result.ok) {
        return jsonResponse(result.body, result.httpStatus || 503, cors);
      }

      const pagingUrl = new URL(url);
      if (limit != null) pagingUrl.searchParams.set("limit", limit);
      if (cursor != null) pagingUrl.searchParams.set("cursor", cursor);
      const body = pageEnvelope(result.envelope, pagingUrl);

      const maxPublicBytes = numericEnv(env, "MAX_PUBLIC_BYTES", 524288);
      const encoded = JSON.stringify(body);
      if (new TextEncoder().encode(encoded).byteLength > maxPublicBytes) {
        throw new AppError(502, "UPSTREAM_SCHEMA_INVALID", "Public response exceeds configured size; reduce limit");
      }

      const response = new Response(encoded, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": body.stale ? "no-store" : `public, max-age=${publicCacheSeconds(route)}`,
          "x-cola-cache": "miss",
          "x-content-type-options": "nosniff"
        }
      });

      if (!body.stale) ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
      return withCors(response, cors);
    } catch (error) {
      const result = errorEnvelope(error);
      return jsonResponse(result.body, result.httpStatus, cors);
    }
  }
};
