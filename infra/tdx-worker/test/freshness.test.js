import { describe, expect, it } from "vitest";
import { assessLiveFreshness } from "../src/freshness.js";

describe("live source freshness", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");

  it("accepts only when every item has a recent source timestamp", () => {
    const out = assessLiveFreshness([
      { sourceUpdatedAt: "2026-09-25T11:59:00Z" },
      { sourceUpdatedAt: "2026-09-25T11:58:00Z" }
    ], now, 300);
    expect(out.fresh).toBe(true);
  });

  it("rejects one old item even when another item is current", () => {
    const out = assessLiveFreshness([
      { sourceUpdatedAt: "2026-09-25T11:59:30Z" },
      { sourceUpdatedAt: "2026-09-25T11:40:00Z" }
    ], now, 300);
    expect(out).toMatchObject({ fresh: false, reason: "stale-source-time" });
  });

  it("rejects missing source timestamps and empty live datasets", () => {
    expect(assessLiveFreshness([{ sourceUpdatedAt: null }], now, 300).fresh).toBe(false);
    expect(assessLiveFreshness([], now, 300).fresh).toBe(false);
  });
});
