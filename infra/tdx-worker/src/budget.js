import { AppError } from "./errors.js";

export function pointEstimate(calls, bytes) {
  return Number(calls || 0) / 1500 + Number(bytes || 0) / (150 * 1024 * 1024);
}

export function assertBudget({ callsThisMinute, callsPerMinute, monthCalls, monthBytes, monthlyPointBudget, cooldownUntil, now = Date.now() }) {
  if (Number(cooldownUntil || 0) > now) {
    const retry = Math.max(1, Math.ceil((Number(cooldownUntil) - now) / 1000));
    throw new AppError(503, "UPSTREAM_UNAVAILABLE", "TDX cooldown active", { retryAfterSeconds: retry });
  }
  if (callsThisMinute >= callsPerMinute) {
    throw new AppError(503, "BUDGET_EXHAUSTED", "Upstream minute budget exhausted", { retryAfterSeconds: 60 });
  }
  if (pointEstimate(monthCalls, monthBytes) >= monthlyPointBudget) {
    throw new AppError(503, "BUDGET_EXHAUSTED", "Monthly TDX budget exhausted", { retryAfterSeconds: 3600 });
  }
}
