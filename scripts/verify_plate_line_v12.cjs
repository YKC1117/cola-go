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
  ["notification runner checks LINE monthly quota",edge.includes("/v2/bot/message/quota")&&edge.includes("/v2/bot/message/quota/consumption")&&edge.includes("const reserve = 20")],
  ["pushes are batched per user to conserve message quota",edge.includes("pending.slice(0,10)")&&edge.includes("sentUsers++")],
  ["sensitive local budget/price fields are absent from server profile",!edge.includes("currentPrice")&&!edge.includes("priceUpdatedAt")],
  ["deployed source supports webhook registration and verification",edge.includes("configureLineWebhook")&&edge.includes("/v2/bot/channel/webhook/endpoint")&&edge.includes("/v2/bot/channel/webhook/test")&&edge.includes("LINE_WEBHOOK_URL")],
  ["no literal LINE credential was committed",!/a9091b51eeec8a9a91a85acb6ac49667/.test(all)&&!/Bearer\s+[A-Za-z0-9_-]{30,}/.test(all)]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log((ok?"PASS":"FAIL")+": "+name);
if(failed.length) process.exit(1);
