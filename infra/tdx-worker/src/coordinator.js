import { DurableObject } from "cloudflare:workers";
import { AppError, errorEnvelope } from "./errors.js";
import { numericEnv } from "./config.js";
import { requestToken, fetchTdxPages, withOneAuthRefresh } from "./tdx.js";
import { normalizeRoute } from "./normalize/index.js";
import { classifySnapshot, snapshotEnvelope } from "./cache.js";
import { assertBudget } from "./budget.js";

function iso(ms) {
  return new Date(ms).toISOString();
}

function currentMonth(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function statusForKind(kind) {
  return ["parkingLive", "chargingAvailability", "freewayLive"].includes(kind) ? "live" : "static";
}

export class TdxCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.refreshInflight = new Map();
    this.tokenInflight = null;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          key TEXT PRIMARY KEY,
          body TEXT NOT NULL,
          fetched_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          stale_until INTEGER NOT NULL
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS auth (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          credential_version TEXT NOT NULL
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS minute_budget (
          bucket INTEGER PRIMARY KEY,
          calls INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS upstream_calls (
          called_at INTEGER NOT NULL
        )
      `);
      this.sql.exec(`CREATE INDEX IF NOT EXISTS upstream_calls_time ON upstream_calls(called_at)`);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS month_budget (
          month TEXT PRIMARY KEY,
          calls INTEGER NOT NULL DEFAULT 0,
          bytes INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    });
  }

  row(sql, ...params) {
    return this.sql.exec(sql, ...params).toArray()[0] || null;
  }

  loadSnapshot(key) {
    return this.row("SELECT * FROM snapshots WHERE key = ?", key);
  }

  saveSnapshot(key, envelope, ttl) {
    const fetchedAt = Date.parse(envelope.fetchedAt);
    const expiresAt = fetchedAt + ttl.fresh * 1000;
    const staleUntil = fetchedAt + ttl.stale * 1000;
    const body = JSON.stringify(envelope);
    const maxSnapshotBytes = 1800000;
    const bytes = new TextEncoder().encode(body).byteLength;
    if (bytes > maxSnapshotBytes) {
      throw new AppError(502, "UPSTREAM_SCHEMA_INVALID", "Normalized snapshot exceeds safe Durable Object row size");
    }
    this.sql.exec(
      `INSERT INTO snapshots(key, body, fetched_at, expires_at, stale_until)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         body = excluded.body,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at,
         stale_until = excluded.stale_until`,
      key, body, fetchedAt, expiresAt, staleUntil
    );
  }

  staleEnvelope(row) {
    return snapshotEnvelope(row, true);
  }

  freshEnvelope(row) {
    return snapshotEnvelope(row, false);
  }

  getCooldownUntil() {
    const row = this.row("SELECT value FROM meta WHERE key = 'cooldown_until'");
    return row ? Number(row.value) : 0;
  }

  setCooldown(seconds) {
    const until = Date.now() + Math.max(1, Number(seconds || 60)) * 1000;
    this.sql.exec(
      `INSERT INTO meta(key, value) VALUES('cooldown_until', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(until)
    );
  }

  getAuthCooldownUntil() {
    const row = this.row("SELECT value FROM meta WHERE key = 'auth_cooldown_until'");
    return row ? Number(row.value) : 0;
  }

  setAuthCooldown(seconds) {
    const until = Date.now() + Math.max(1, Number(seconds || 60)) * 1000;
    this.sql.exec(
      `INSERT INTO meta(key, value) VALUES('auth_cooldown_until', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(until)
    );
  }

  budgetState() {
    const now = Date.now();
    this.sql.exec("DELETE FROM upstream_calls WHERE called_at <= ?", now - 120000);
    const recent = this.row("SELECT COUNT(*) AS calls FROM upstream_calls WHERE called_at > ?", now - 60000);
    const month = this.row("SELECT calls, bytes FROM month_budget WHERE month = ?", currentMonth());
    return { now, callsThisMinute: Number(recent?.calls || 0), monthCalls: Number(month?.calls || 0),
      monthBytes: Number(month?.bytes || 0), cooldownUntil: this.getCooldownUntil() };
  }

  assertCanAttemptData() {
    assertBudget({ ...this.budgetState(),
      callsPerMinute: Math.max(1, numericEnv(this.env, "TDX_CALLS_PER_MINUTE", 4)),
      monthlyPointBudget: Math.max(0.1, numericEnv(this.env, "TDX_MONTHLY_POINT_BUDGET", 2.4)) });
  }

  reserveUpstreamCall() {
    const state = this.budgetState();
    const callsPerMinute = Math.max(1, numericEnv(this.env, "TDX_CALLS_PER_MINUTE", 4));
    const monthlyPointBudget = Math.max(0.1, numericEnv(this.env, "TDX_MONTHLY_POINT_BUDGET", 2.4));
    const reservedBytes = Math.max(0, numericEnv(this.env, "MAX_UPSTREAM_BYTES", 2097152));
    assertBudget({ ...state, monthBytes: state.monthBytes + reservedBytes, callsPerMinute, monthlyPointBudget });
    this.sql.exec("INSERT INTO upstream_calls(called_at) VALUES(?)", state.now);
    this.sql.exec(
      `INSERT INTO month_budget(month, calls, bytes) VALUES(?, 1, ?)
       ON CONFLICT(month) DO UPDATE SET calls = calls + 1, bytes = bytes + excluded.bytes`,
      currentMonth(), reservedBytes
    );
  }

  recordBytes(bytes) {
    const reservedBytes = Math.max(0, numericEnv(this.env, "MAX_UPSTREAM_BYTES", 2097152));
    const delta = Math.max(0, Number(bytes || 0)) - reservedBytes;
    this.sql.exec(
      `INSERT INTO month_budget(month, calls, bytes) VALUES(?, 0, ?)
       ON CONFLICT(month) DO UPDATE SET bytes = MAX(0, bytes + excluded.bytes)`,
      currentMonth(), delta
    );
  }

  async getAccessToken(force = false) {
    const version = String(this.env.TDX_CREDENTIAL_VERSION || "1");
    if (!force) {
      const row = this.row("SELECT token, expires_at, credential_version FROM auth WHERE id = 1");
      if (row && row.credential_version === version && Number(row.expires_at) - Date.now() > 300000) {
        return row.token;
      }
    }

    if (this.tokenInflight) return this.tokenInflight;

    const authCooldownUntil = this.getAuthCooldownUntil();
    if (authCooldownUntil > Date.now()) {
      throw new AppError(503, "UPSTREAM_AUTH_FAILED", "TDX authentication cooldown active", {
        retryAfterSeconds: Math.max(1, Math.ceil((authCooldownUntil - Date.now()) / 1000))
      });
    }

    this.tokenInflight = (async () => {
      let result;
      try {
        result = await requestToken(this.env);
      } catch (error) {
        if (error instanceof AppError && error.extra?.authCooldown) this.setAuthCooldown(error.extra.retryAfterSeconds || 60);
        throw error;
      }
      const expiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
      this.sql.exec(
        `INSERT INTO auth(id, token, expires_at, credential_version)
         VALUES(1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           token = excluded.token,
           expires_at = excluded.expires_at,
           credential_version = excluded.credential_version`,
        result.token, expiresAt, version
      );
      return result.token;
    })();

    try {
      return await this.tokenInflight;
    } finally {
      this.tokenInflight = null;
    }
  }

  async fetchOne(spec, token) {
    return fetchTdxPages({
      env: this.env,
      token,
      path: spec.path,
      paginate: spec.paginate !== false,
      beforeRequest: () => this.reserveUpstreamCall(),
      onUsage: ({ bytes }) => this.recordBytes(bytes)
    });
  }

  async fetchWithAuth(spec) {
    this.assertCanAttemptData();
    return withOneAuthRefresh({
      getToken: (force) => this.getAccessToken(force),
      request: (token) => this.fetchOne(spec, token)
    });
  }

  async refresh(kind, scope, upstream, ttl) {
    let raw;
    if (upstream.multi) {
      raw = {};
      for (const part of upstream.multi) raw[part.name] = await this.fetchWithAuth(part);
    } else {
      raw = await this.fetchWithAuth(upstream);
    }

    const items = normalizeRoute(kind, raw, scope);
    const fetchedAt = new Date().toISOString();
    const sourceUpdatedAt = upstream.multi
      ? Object.values(raw).map((x) => x.sourceUpdatedAt).filter(Boolean).sort().at(-1) || null
      : raw.sourceUpdatedAt || null;

    const envelope = {
      schemaVersion: 1,
      status: statusForKind(kind),
      source: "TDX",
      scope: scope || (kind.startsWith("freeway") ? "freeway" : null),
      updatedAt: sourceUpdatedAt,
      fetchedAt,
      expiresAt: iso(Date.parse(fetchedAt) + ttl.fresh * 1000),
      stale: false,
      partial: false,
      snapshotId: crypto.randomUUID(),
      items,
      coverage: { supported: true, returned: items.length, total: items.length },
      pagination: { nextCursor: null },
      error: null
    };

    this.saveSnapshot(upstream.key, envelope, ttl);
    return envelope;
  }

  async refreshShared(kind, scope, upstream, ttl) {
    const key = upstream.key;
    if (this.refreshInflight.has(key)) return this.refreshInflight.get(key);

    const pending = this.refresh(kind, scope, upstream, ttl);
    this.refreshInflight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.refreshInflight.delete(key);
    }
  }

  async getResource({ kind, scope, upstream, ttl }) {
    const row = this.loadSnapshot(upstream.key);
    const state = classifySnapshot(row);

    if (state === "fresh") return { ok: true, envelope: this.freshEnvelope(row) };

    if (String(this.env.TDX_ENABLED).toLowerCase() !== "true") {
      if (state === "stale") return { ok: true, envelope: this.staleEnvelope(row) };
      return { ok: false, ...errorEnvelope(new AppError(503, "UPSTREAM_UNAVAILABLE", "TDX upstream is disabled"), scope) };
    }

    try {
      const envelope = await this.refreshShared(kind, scope, upstream, ttl);
      return { ok: true, envelope };
    } catch (error) {
      if (error instanceof AppError && error.extra?.cooldown) {
        this.setCooldown(error.extra.retryAfterSeconds || 60);
      }
      if (state === "stale") return { ok: true, envelope: this.staleEnvelope(row) };
      return { ok: false, ...errorEnvelope(error, scope) };
    }
  }
}
