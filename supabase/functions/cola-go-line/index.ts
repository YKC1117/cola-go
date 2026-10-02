import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN = "https://ykc1117.github.io";
const SITE_PLATE_URL = "https://ykc1117.github.io/cola-go/#plate";
const ANNOUNCEMENT_URL = "https://ykc1117.github.io/cola-go/data/plates/announcements.json";
const DEFAULT_OA_ID = "@638jxfra";
const LINE_WEBHOOK_URL = "https://papqrnqbfauwuipjwwdh.supabase.co/functions/v1/cola-go-line/v1/line/webhook";
const encoder = new TextEncoder();

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service credentials unavailable");
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const secretCache = new Map<string,string>();

function json(data: unknown, status = 200, origin = "") {
  const headers: Record<string,string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  if (origin === SITE_ORIGIN) {
    headers["access-control-allow-origin"] = SITE_ORIGIN;
    headers["access-control-allow-headers"] = "authorization, content-type";
    headers["access-control-allow-methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}
function routePath(url: URL) {
  const marker = "/cola-go-line";
  const at = url.pathname.indexOf(marker);
  return at >= 0 ? (url.pathname.slice(at + marker.length) || "/") : url.pathname;
}
function normalizePlate(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}
function sanitizeProfile(input: any) {
  const plates = [...new Set((Array.isArray(input?.plates) ? input.plates : []).map(normalizePlate)
    .filter((v:string) => /^[A-Z0-9-]{1,12}$/.test(v)))].slice(0, 20);
  const primary = normalizePlate(input?.primaryPlate);
  const allowedEvents = new Set(["announcement","auction_start","auction_end","deadline_change"]);
  const events = [...new Set((Array.isArray(input?.events) ? input.events : []).map(String)
    .filter((v:string) => allowedEvents.has(v)))];
  return {
    schema: 1,
    plates,
    primaryPlate: plates.includes(primary) ? primary : "",
    events: events.length ? events : [...allowedEvents],
    locale: "zh-TW"
  };
}
function safeReturnUrl(value: unknown) {
  try {
    const u = new URL(String(value || ""));
    if (u.origin !== SITE_ORIGIN || !u.pathname.startsWith("/cola-go/")) return SITE_PLATE_URL;
    return u.href;
  } catch { return SITE_PLATE_URL; }
}
function randomString(length: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, b => b.toString(16).padStart(2,"0")).join("");
}
function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function getSecret(name: string) {
  if (secretCache.has(name)) return secretCache.get(name)!;
  const { data, error } = await db.rpc("colago_secret", { secret_name: name });
  if (error || !data) throw new Error("Missing server secret: " + name);
  const value = String(data);
  secretCache.set(name, value);
  return value;
}
async function verifyLineSignature(raw: string, signature: string) {
  const channelSecret = await getSecret("line_channel_secret");
  const key = await crypto.subtle.importKey("raw", encoder.encode(channelSecret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(raw)));
  return constantTimeEqual(bytesToBase64(signed), signature || "");
}
let lineTokenCache = { value:"", expiresAt:0 };
async function lineAccessToken() {
  if (lineTokenCache.value && Date.now() < lineTokenCache.expiresAt - 60000) return lineTokenCache.value;
  const channelId = await getSecret("line_channel_id");
  const channelSecret = await getSecret("line_channel_secret");
  const body = new URLSearchParams({
    grant_type:"client_credentials",
    client_id:channelId,
    client_secret:channelSecret
  });
  const res = await fetch("https://api.line.me/oauth2/v3/token", {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:body.toString()
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || !data?.access_token) throw new Error("LINE stateless token issue failed: " + res.status);
  lineTokenCache = {
    value:String(data.access_token),
    expiresAt:Date.now() + Math.max(60,Number(data.expires_in||900))*1000
  };
  return lineTokenCache.value;
}
async function lineRequest(path: string, init: RequestInit = {}) {
  const accessToken = await lineAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("authorization", "Bearer " + accessToken);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch("https://api.line.me" + path, { ...init, headers });
}
async function replyLine(replyToken: string, text: string) {
  if (!replyToken) return;
  await lineRequest("/v2/bot/message/reply", {
    method:"POST",
    body:JSON.stringify({ replyToken, messages:[{ type:"text", text }] })
  });
}
async function pushLine(userId: string, text: string) {
  const headers = new Headers({ "content-type":"application/json", "x-line-retry-key":crypto.randomUUID() });
  const res = await lineRequest("/v2/bot/message/push", {
    method:"POST", headers,
    body:JSON.stringify({ to:userId, messages:[{ type:"text", text, quickReply:{items:[{type:"action",action:{type:"uri",label:"開啟車牌中心",uri:SITE_PLATE_URL}}]} }] })
  });
  if (!res.ok) throw new Error("LINE push failed: " + res.status);
}
async function lineQuotaRemaining() {
  try {
    const [quotaRes, usageRes] = await Promise.all([
      lineRequest("/v2/bot/message/quota"),
      lineRequest("/v2/bot/message/quota/consumption")
    ]);
    if (!quotaRes.ok || !usageRes.ok) return null;
    const quota = await quotaRes.json(), usage = await usageRes.json();
    if (quota?.type !== "limited" || !Number.isFinite(Number(quota?.value))) return null;
    return Math.max(0, Number(quota.value) - Number(usage?.totalUsage || 0));
  } catch { return null; }
}
function plateParts(value: unknown) {
  const s = normalizePlate(value).replace(/[^A-Z0-9-]/g,"");
  let m = s.match(/^([A-Z]{1,4})-?(\d{1,4})$/);
  if (m) return { prefix:m[1], number:Number(m[2]) };
  m = s.match(/^(\d{1,4})$/);
  return m ? { prefix:"", number:Number(m[1]) } : null;
}
function rangeContains(row: any, value: string) {
  const q = plateParts(value), a = plateParts(row?.startNumber), b = plateParts(row?.endNumber);
  if (!q || !a || !b) return false;
  if (q.prefix && q.prefix !== a.prefix && q.prefix !== b.prefix) return false;
  if (a.prefix !== b.prefix) return q.prefix ? false : [a.number,b.number].includes(q.number);
  return q.number >= Math.min(a.number,b.number) && q.number <= Math.max(a.number,b.number);
}
function eventCandidates(row: any, plate: string, events: Set<string>, now: number, deadlineChanged: boolean) {
  const out:{key:string,text:string}[] = [];
  const id = String(row?.id || [row?.office,row?.startNumber,row?.endNumber,row?.startAt].join("|"));
  const start = Date.parse(row?.startAt || ""), end = Date.parse(row?.endAt || "");
  const startMs = start - now, endMs = end - now;
  if (events.has("announcement")) out.push({ key:"announcement:"+id+":"+plate, text:plate+" 已出現在官方標牌公告。" });
  if (events.has("auction_start") && Number.isFinite(start)) {
    if (startMs > 0 && startMs <= 15*60000) out.push({ key:"start15:"+id+":"+plate, text:plate+" 距官方起標約剩 15 分鐘。" });
    if (startMs <= 0 && (!Number.isFinite(end) || endMs > 0)) out.push({ key:"started:"+id+":"+plate, text:plate+" 已進入公告競標時段，請到監理服務網確認最新狀態。" });
  }
  if (events.has("auction_end") && Number.isFinite(end) && endMs > 0) {
    if (endMs <= 15*60000) out.push({ key:"end15:"+id+":"+plate, text:plate+" 距公告決標約剩 15 分鐘；最後階段仍以官方頁為準。" });
    if (endMs <= 3*60000) out.push({ key:"end3:"+id+":"+plate, text:plate+" 距公告決標約剩 3 分鐘；若官方延長，請以正式競標頁最後時間為準。" });
  }
  if (events.has("deadline_change") && deadlineChanged) out.push({ key:"deadline:"+id+":"+plate+":"+String(row?.endAt||""), text:plate+" 的官方公告決標時間有變動，請重新確認。" });
  return out;
}
async function requireDevice(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const { data } = await db.from("plate_line_subscriptions")
    .select("id,line_user_id,profile,active")
    .eq("device_token_hash",tokenHash).eq("active",true).maybeSingle();
  return data || null;
}
async function createPairing(req: Request, origin: string) {
  const body = await req.json().catch(()=>({}));
  const profile = sanitizeProfile(body?.profile);
  if (!profile.plates.length) return json({error:"NO_PLATES"},400,origin);
  const id = crypto.randomUUID(), code = randomString(7), codeHash = await sha256(code);
  const expiresAt = new Date(Date.now()+10*60000).toISOString();
  const { error } = await db.from("plate_line_pairings").insert({
    id, code_hash:codeHash, profile, return_url:safeReturnUrl(body?.returnUrl), expires_at:expiresAt
  });
  if (error) return json({error:"PAIRING_CREATE_FAILED"},500,origin);
  const message = encodeURIComponent("COLA GO 配對 " + code);
  const lineUrl = "https://line.me/R/oaMessage/" + encodeURIComponent(DEFAULT_OA_ID) + "/?" + message;
  return json({pairingId:id,expiresAt,lineUrl},200,origin);
}
async function getPairing(id: string, origin: string) {
  const { data } = await db.from("plate_line_pairings")
    .select("id,expires_at,claimed_at,device_token")
    .eq("id",id).maybeSingle();
  if (!data) return json({status:"missing"},404,origin);
  if (Date.parse(data.expires_at) < Date.now()) return json({status:"expired"},410,origin);
  if (!data.claimed_at || !data.device_token) return json({status:"pending"},200,origin);
  return json({status:"linked",deviceToken:data.device_token},200,origin);
}
async function updateSubscription(req: Request, origin: string) {
  const sub = await requireDevice(req);
  if (!sub) return json({error:"UNAUTHORIZED"},401,origin);
  if (req.method === "DELETE") {
    await db.from("plate_line_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);
    return json({ok:true},200,origin);
  }
  const body = await req.json().catch(()=>({}));
  const profile = sanitizeProfile(body?.profile);
  if (!profile.plates.length) return json({error:"NO_PLATES"},400,origin);
  const { error } = await db.from("plate_line_subscriptions").update({profile,updated_at:new Date().toISOString()}).eq("id",sub.id);
  return error ? json({error:"SUBSCRIPTION_UPDATE_FAILED"},500,origin) : json({ok:true},200,origin);
}
async function handleWebhook(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-line-signature") || "";
  if (!signature || !(await verifyLineSignature(raw,signature))) return json({error:"INVALID_SIGNATURE"},401);
  const payload = JSON.parse(raw || "{}");
  for (const event of Array.isArray(payload?.events) ? payload.events : []) {
    if (event?.type !== "message" || event?.message?.type !== "text" || !event?.source?.userId) continue;
    const text = String(event.message.text || "").trim();
    const match = text.match(/COLA\s*GO\s*配對\s*([A-Z0-9]{6,10})/i);
    if (!match) continue;
    const codeHash = await sha256(match[1].toUpperCase());
    const { data:pair } = await db.from("plate_line_pairings")
      .select("id,profile,expires_at,claimed_at")
      .eq("code_hash",codeHash).maybeSingle();
    if (!pair || pair.claimed_at || Date.parse(pair.expires_at) < Date.now()) {
      await replyLine(event.replyToken,"這組 COLA GO 配對碼無效或已過期，請回車牌中心重新產生。");
      continue;
    }
    const deviceToken = randomToken(), deviceTokenHash = await sha256(deviceToken);
    const now = new Date().toISOString();
    const { error:subError } = await db.from("plate_line_subscriptions").upsert({
      line_user_id:event.source.userId,
      device_token_hash:deviceTokenHash,
      profile:sanitizeProfile(pair.profile),
      active:true,
      updated_at:now
    },{onConflict:"line_user_id"});
    if (subError) {
      await replyLine(event.replyToken,"COLA GO 配對目前發生錯誤，請稍後再試。");
      continue;
    }
    await db.from("plate_line_pairings").update({
      line_user_id:event.source.userId,
      device_token:deviceToken,
      claimed_at:now
    }).eq("id",pair.id).is("claimed_at",null);
    await replyLine(event.replyToken,"COLA GO 車牌競標通知已綁定。回到網站按「檢查綁定」即可完成；正式出價與付款仍在監理服務網操作。");
  }
  return json({ok:true});
}
async function configureLineWebhook(req: Request) {
  const supplied = req.headers.get("x-colago-cron-secret") || "";
  const expected = await getSecret("colago_cron_secret");
  if (!supplied || !constantTimeEqual(supplied,expected)) return json({error:"UNAUTHORIZED"},401);

  const setRes = await lineRequest("/v2/bot/channel/webhook/endpoint", {
    method:"PUT",
    body:JSON.stringify({endpoint:LINE_WEBHOOK_URL})
  });
  if (!setRes.ok) {
    const body = await setRes.text();
    return json({error:"WEBHOOK_SET_FAILED",status:setRes.status,detail:body.slice(0,300)},502);
  }

  const testRes = await lineRequest("/v2/bot/channel/webhook/test", {
    method:"POST",
    body:JSON.stringify({endpoint:LINE_WEBHOOK_URL})
  });
  const testBody = await testRes.json().catch(()=>({}));

  const infoRes = await lineRequest("/v2/bot/channel/webhook/endpoint");
  const info = await infoRes.json().catch(()=>({}));

  return json({
    ok:setRes.ok && testRes.ok,
    webhook:LINE_WEBHOOK_URL,
    test:testBody,
    active:info?.active===true,
    endpoint:String(info?.endpoint||"")
  }, setRes.ok && testRes.ok ? 200 : 502);
}
async function runNotifications(req: Request) {
  const supplied = req.headers.get("x-colago-cron-secret") || "";
  const expected = await getSecret("colago_cron_secret");
  if (!supplied || !constantTimeEqual(supplied,expected)) return json({error:"UNAUTHORIZED"},401);

  const source = await fetch(ANNOUNCEMENT_URL,{cache:"no-store"});
  if (!source.ok) return json({error:"ANNOUNCEMENT_FETCH_FAILED"},502);
  const payload = await source.json();
  const rows = Array.isArray(payload?.items) ? payload.items : [];

  const { data:subs,error:subError } = await db.from("plate_line_subscriptions")
    .select("line_user_id,profile").eq("active",true);
  if (subError) return json({error:"SUBSCRIPTION_READ_FAILED"},500);

  const ids = rows.map((r:any)=>String(r?.id||"")).filter(Boolean);
  let stateRows:any[] = [];
  if (ids.length) {
    const stateResult = await db.from("plate_line_announcement_state").select("announcement_id,end_at").in("announcement_id",ids);
    stateRows = stateResult.data || [];
  }
  const oldState = new Map(stateRows.map((r:any)=>[r.announcement_id,r.end_at||""]));
  const changed = new Set<string>();
  for (const row of rows) {
    const id=String(row?.id||"");
    if (id && oldState.has(id) && oldState.get(id)!==String(row?.endAt||"")) changed.add(id);
  }

  let remaining = await lineQuotaRemaining();
  const reserve = 20;
  let sentUsers=0, sentEvents=0, skippedQuota=0;
  const now=Date.now();

  for (const sub of subs||[]) {
    if (remaining!==null && remaining<=reserve) { skippedQuota++; break; }
    const profile=sanitizeProfile(sub.profile), eventSet=new Set(profile.events);
    let candidates:{key:string,text:string}[]=[];
    for (const plate of profile.plates) {
      for (const row of rows) {
        if (!rangeContains(row,plate)) continue;
        candidates.push(...eventCandidates(row,plate,eventSet,now,changed.has(String(row?.id||""))));
      }
    }
    const unique=[...new Map(candidates.map(x=>[x.key,x])).values()];
    if (!unique.length) continue;
    const keys=unique.map(x=>x.key);
    const { data:logs } = await db.from("plate_line_delivery_log")
      .select("event_key").eq("line_user_id",sub.line_user_id).in("event_key",keys);
    const done=new Set((logs||[]).map((x:any)=>x.event_key));
    const pending=unique.filter(x=>!done.has(x.key));
    if (!pending.length) continue;

    const lines=pending.slice(0,10).map(x=>"• "+x.text);
    const message=["COLA GO 車牌提醒","",...lines,"","查看車牌中心："+SITE_PLATE_URL].join("\n");
    try {
      await pushLine(sub.line_user_id,message.slice(0,4900));
      await db.from("plate_line_delivery_log").insert(pending.map(x=>({line_user_id:sub.line_user_id,event_key:x.key})));
      sentUsers++; sentEvents+=pending.length;
      if (remaining!==null) remaining--;
    } catch {}
  }

  if (rows.length) {
    await db.from("plate_line_announcement_state").upsert(rows.map((row:any)=>({
      announcement_id:String(row?.id||[row?.office,row?.startNumber,row?.endNumber,row?.startAt].join("|")),
      start_at:String(row?.startAt||""),
      end_at:String(row?.endAt||""),
      updated_at:new Date().toISOString()
    })),{onConflict:"announcement_id"});
  }
  await db.from("plate_line_pairings").delete().lt("expires_at",new Date(Date.now()-24*3600*1000).toISOString());
  await db.from("plate_line_delivery_log").delete().lt("sent_at",new Date(Date.now()-120*24*3600*1000).toISOString());

  return json({ok:true,sentUsers,sentEvents,remaining,skippedQuota,sourceUpdatedAt:payload?.updatedAt||null});
}

Deno.serve(async (req: Request) => {
  const url=new URL(req.url), path=routePath(url), origin=req.headers.get("origin")||"";

  if (req.method==="OPTIONS") return origin===SITE_ORIGIN
    ? new Response(null,{status:204,headers:{
        "access-control-allow-origin":SITE_ORIGIN,
        "access-control-allow-headers":"authorization, content-type",
        "access-control-allow-methods":"GET, POST, PUT, DELETE, OPTIONS",
        "access-control-max-age":"600",
        "vary":"Origin"
      }})
    : new Response(null,{status:403});

  try {
    if (path==="/health" && req.method==="GET") return json({ok:true,service:"cola-go-line",version:1},200,origin);

    if (path==="/v1/plate-line/pairings" && req.method==="POST") {
      if (origin!==SITE_ORIGIN) return json({error:"ORIGIN_NOT_ALLOWED"},403,origin);
      return await createPairing(req,origin);
    }

    const pairingMatch=path.match(/^\/v1\/plate-line\/pairings\/([0-9a-f-]{36})$/i);
    if (pairingMatch && req.method==="GET") {
      if (origin!==SITE_ORIGIN) return json({error:"ORIGIN_NOT_ALLOWED"},403,origin);
      return await getPairing(pairingMatch[1],origin);
    }

    if (path==="/v1/plate-line/subscription" && (req.method==="PUT"||req.method==="DELETE")) {
      if (origin!==SITE_ORIGIN) return json({error:"ORIGIN_NOT_ALLOWED"},403,origin);
      return await updateSubscription(req,origin);
    }

    if (path==="/v1/line/webhook" && req.method==="POST") return await handleWebhook(req);
    if (path==="/v1/line/setup-webhook" && req.method==="POST") return await configureLineWebhook(req);
    if (path==="/v1/plate-line/run" && req.method==="POST") return await runNotifications(req);

    return json({error:"NOT_FOUND"},404,origin);
  } catch (error) {
    console.error("cola-go-line",error instanceof Error?error.message:String(error));
    return json({error:"INTERNAL_ERROR"},500,origin);
  }
});
