import { CAPABILITIES, TTL } from "./config.js";

export function capabilitiesResponse() {
  return {
    schemaVersion: 1,
    product: "COLA GO",
    source: "TDX",
    policy: {
      noBrowserSecrets: true,
      noFakeRealtime: true,
      staleIsExplicit: true,
      nationwideUi: true
    },
    coverage: CAPABILITIES,
    cacheTtlSeconds: TTL
  };
}
