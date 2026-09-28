export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function errorEnvelope(error, scope = null) {
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const retryAfterSeconds = error?.extra?.retryAfterSeconds ?? null;
  return {
    httpStatus: status,
    body: {
      schemaVersion: 1,
      status: "unavailable",
      source: "TDX",
      scope,
      updatedAt: null,
      fetchedAt: null,
      expiresAt: null,
      stale: false,
      partial: false,
      snapshotId: null,
      items: [],
      coverage: { supported: true, returned: 0, total: null },
      pagination: { nextCursor: null },
      error: { code, retryAfterSeconds }
    }
  };
}
