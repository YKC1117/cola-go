const rawBase = String(process.env.BASE_URL || "");
const base = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
const origin = process.env.ORIGIN || "https://ykc1117.github.io";
const city = process.env.SMOKE_CITY || "Tainan";
const evCity = process.env.SMOKE_EV_CITY || city;
const delayMs = Number(process.env.SMOKE_DELAY_MS || 16000);

if (!base.startsWith("https://")) {
  console.error("BASE_URL must be the deployed HTTPS staging Worker URL");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const expect = options.expect || 200;
  const response = await fetch(base + path, { headers: { Origin: origin, Accept: "application/json" } });
  let body;
  try { body = await response.json(); } catch { throw new Error(path + ": response was not JSON (HTTP " + response.status + ")"); }
  if (response.status !== expect) throw new Error(path + ": expected HTTP " + expect + ", got " + response.status + ": " + JSON.stringify(body).slice(0, 500));
  if (options.tdxData) {
    if (!["live", "static", "stale"].includes(body.status)) throw new Error(path + ": unexpected data status " + JSON.stringify(body.status));
    if (body.source !== "TDX") throw new Error(path + ": expected source=TDX");
    if (!Array.isArray(body.items)) throw new Error(path + ": items must be an array");
    if (typeof body.stale !== "boolean") throw new Error(path + ": stale must be boolean");
    if (!Object.hasOwn(body, "updatedAt") || !Object.hasOwn(body, "fetchedAt")) throw new Error(path + ": updatedAt/fetchedAt missing");
  }
  console.log("PASS " + path + " HTTP " + response.status + " status=" + (body.status ?? "n/a") + " items=" + (Array.isArray(body.items) ? body.items.length : "n/a"));
  return body;
}

async function main() {
  const health = await request("/api/v1/health");
  if (health.tdxEnabled !== true) throw new Error("staging Worker reports tdxEnabled=false; set Secrets and intentionally enable staging before real-data smoke");
  await request("/api/v1/capabilities");
  const dataRoutes = [
    "/api/parking/" + encodeURIComponent(city) + "/lots?limit=10",
    "/api/parking/" + encodeURIComponent(city) + "/availability?limit=10",
    "/api/ev/" + encodeURIComponent(evCity) + "/stations?limit=10",
    "/api/ev/" + encodeURIComponent(evCity) + "/connectors?limit=10",
    "/api/ev/" + encodeURIComponent(evCity) + "/status?limit=10",
    "/api/highway/traffic?limit=10",
    "/api/highway/cctv?limit=10"
  ];
  for (let index = 0; index < dataRoutes.length; index += 1) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    await request(dataRoutes[index], { tdxData: true });
  }
  console.log("PASS staging smoke: real Worker responses satisfy the public contract");
}

main().catch((error) => {
  console.error("FAIL staging smoke:", error.message);
  process.exit(1);
});
