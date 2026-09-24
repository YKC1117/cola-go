import { describe, expect, it } from "vitest";
import { classifySnapshot } from "../src/cache.js";
import { assertBudget, pointEstimate } from "../src/budget.js";

describe("snapshot freshness", () => {
  it("distinguishes missing, fresh, stale and expired", () => {
    const now=1_000_000;
    expect(classifySnapshot(null,now)).toBe("missing");
    expect(classifySnapshot({expires_at:now+1,stale_until:now+2},now)).toBe("fresh");
    expect(classifySnapshot({expires_at:now-1,stale_until:now+2},now)).toBe("stale");
    expect(classifySnapshot({expires_at:now-2,stale_until:now-1},now)).toBe("expired");
  });
});

describe("TDX budget protection", () => {
  it("calculates request and byte points together", () => {
    expect(pointEstimate(1500,150*1024*1024)).toBeCloseTo(2,5);
  });

  it("blocks minute budget exhaustion", () => {
    expect(()=>assertBudget({
      callsThisMinute:4,callsPerMinute:4,monthCalls:0,monthBytes:0,
      monthlyPointBudget:2.4,cooldownUntil:0,now:1000
    })).toThrowError(/minute budget/);
  });

  it("blocks monthly point exhaustion", () => {
    expect(()=>assertBudget({
      callsThisMinute:0,callsPerMinute:4,monthCalls:3600,monthBytes:0,
      monthlyPointBudget:2.4,cooldownUntil:0,now:1000
    })).toThrowError(/Monthly TDX budget/);
  });

  it("honors global cooldown", () => {
    try {
      assertBudget({
        callsThisMinute:0,callsPerMinute:4,monthCalls:0,monthBytes:0,
        monthlyPointBudget:2.4,cooldownUntil:61_000,now:1000
      });
      throw new Error("expected cooldown");
    } catch (error) {
      expect(error.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(error.extra.retryAfterSeconds).toBe(60);
    }
  });
});
