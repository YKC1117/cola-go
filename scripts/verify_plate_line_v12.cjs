const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const edge=fs.readFileSync(path.join(root,"supabase/functions/cola-go-line/index.ts"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002_plate_line_notify.sql"),"utf8");
const config=JSON.parse(fs.readFileSync(path.join(root,"data/line-notify.json"),"utf8"));
const all=edge+"\n"+migration+"\n"+JSON.stringify(config);
const checks=[
  ["webhook verifies X-Line-Signature",edge.includes("x-line-signature")&&edge.includes("verifyLineSignature")&&edge.includes('name:"HMAC"')],
  ["channel credentials are retrieved server-side from Vault",edge.includes('getSecret("line_channel_id")')&&edge.includes('getSecret("line_channel_secret")')&&migration.includes("vault.decrypted_secrets")],
  ["public config enables only the public HTTPS backend URL",config.enabled===true&&config.apiBase==="https://papqrnqbfauwuipjwwdh.supabase.co/functions/v1/cola-go-line"],
  ["stateless access token is issued server-side",edge.includes("/oauth2/v3/token")&&edge.includes("client_secret:channelSecret")&&edge.includes("lineTokenCache")],
  ["pairing code is one-time and short-lived",edge.includes("10*60000")&&edge.includes('is("claimed_at",null)')&&edge.includes("code_hash")],
  ["device bearer token is hashed in subscription storage",edge.includes("device_token_hash")&&edge.includes("await sha256(token)")],
  ["browser origin is restricted to COLA GO GitHub Pages",edge.includes('const SITE_ORIGIN = "https://ykc1117.github.io"')&&edge.includes("ORIGIN_NOT_ALLOWED")],
  ["LINE Basic ID handoff uses official HTTPS oaMessage scheme",edge.includes("https://line.me/R/oaMessage/")&&config.oaId==="@638jxfra"],
  ["notification runner deduplicates events",edge.includes("plate_line_delivery_log")&&migration.includes("primary key (line_user_id,event_key)")],
  ["official plate source is refreshed from MVDIS with a six-hour cache",edge.includes("MVDIS_ANNOUNCE_URL")&&edge.includes("ANNOUNCEMENT_CACHE_TTL_MS = 6*60*60*1000")&&edge.includes("queryOpenByStation")&&edge.includes('"d-5481-p"')&&edge.includes("plate_line_official_cache")],
  ["public plate API serves the MVDIS-backed official cache to COLA GO only",edge.includes('/v1/plate-line/announcements')&&edge.includes("getOfficialAnnouncements(origin)")&&edge.includes("ORIGIN_NOT_ALLOWED")&&edge.includes("fetchMvdisAnnouncements")],
  ["nationwide confirmed plates are grouped by watched number before LINE push",edge.includes("announcementGroups")&&edge.includes("announcementSummaryEvent(plate,items.map(x=>x.row))")&&edge.includes("全台新增確認")&&edge.includes("detail.excluded.includes(exactPlate)")],
  ["MVDIS announcement rows preserve official detail sequence ids",edge.includes("method=initdetail")&&edge.includes("startNumber,endNumber,seq")],
  ["official XLS exclusion details are parsed and cached on demand",edge.includes('import * as XLSX from "npm:xlsx@0.18.5"')&&edge.includes("function parseExcludedPlates")&&edge.includes("plate_line_detail_cache")&&edge.includes("DETAIL_CACHE_TTL_MS = 24*60*60*1000")],
  ["exact plate confirmation endpoint is site-origin restricted",edge.includes('/v1/plate-line/confirm')&&edge.includes("getExactPlateConfirmation(req,origin)")&&edge.includes('proof:"監理服務網標售公告區間＋官方重複號牌排除明細"')],
  ["notification runner checks LINE quota only when a message is ready",edge.includes("/v2/bot/message/quota")&&edge.includes("/v2/bot/message/quota/consumption")&&edge.includes("quotaChecked=false")&&edge.includes("if (!quotaChecked)")&&edge.includes("const reserve = 20")],
  ["pushes are batched per user and log only sent events",edge.includes("const sendable=grouped.slice(0,10)")&&edge.includes("const logKeys=sendable.flatMap")&&edge.includes("sentEvents+=logKeys.length")],
  ["LINE notification profile carries private-car/all vehicle scope",edge.includes('const vehicleScope = input?.vehicleScope === "all" ? "all" : "private-car"')&&edge.includes("categoryMatchesVehicleScope(row,profile.vehicleScope)")&&edge.includes('"自用小客貨車"')&&edge.includes('"電動自小客"')],
  ["sensitive local budget/price fields are absent from server profile",!edge.includes("currentPrice")&&!edge.includes("priceUpdatedAt")],
  ["deployed source supports webhook registration and verification",edge.includes("configureLineWebhook")&&edge.includes("/v2/bot/channel/webhook/endpoint")&&edge.includes("/v2/bot/channel/webhook/test")&&edge.includes("LINE_WEBHOOK_URL")],
  ["no literal LINE credential was committed",!/a9091b51eeec8a9a91a85acb6ac49667/.test(all)&&!/Bearer\s+[A-Za-z0-9_-]{30,}/.test(all)]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log((ok?"PASS":"FAIL")+": "+name);
if(failed.length) process.exit(1);
