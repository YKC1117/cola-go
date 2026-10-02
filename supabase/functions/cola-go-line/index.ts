import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN = "https://ykc1117.github.io";
const SITE_PLATE_URL = "https://ykc1117.github.io/cola-go/#plate";
const ANNOUNCEMENT_FALLBACK_URL = "https://ykc1117.github.io/cola-go/data/plates/announcements.json";
const MVDIS_ANNOUNCE_URL = "https://www.mvdis.gov.tw/m3-emv-plate/bid/announce";
const ANNOUNCEMENT_SOURCE_URL = MVDIS_ANNOUNCE_URL;
const ANNOUNCEMENT_DATASET_URL = "https://data.gov.tw/dataset/96623";
const ANNOUNCEMENT_CACHE_TTL_MS = 6*60*60*1000;
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
  const vehicleScope = input?.vehicleScope === "all" ? "all" : "private-car";
  return {
    schema: 2,
    plates,
    primaryPlate: plates.includes(primary) ? primary : "",
    vehicleScope,
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


function decodeHtml(value:string) {
  return String(value||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/\s+/g," ")
    .trim();
}
function inputValue(html:string,name:string) {
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag=m[0];
    const tagName=tag.match(/name=["']([^"']+)["']/i)?.[1]||"";
    if (tagName!==name) continue;
    return tag.match(/value=["']([^"']*)["']/i)?.[1]||"";
  }
  return "";
}
function isoTaiwan(y:number,mo:number,d:number,h:number,mi:number,s:number) {
  if (y<1900||mo<1||mo>12||d<1||d>31||h<0||h>23||mi<0||mi>59||s<0||s>59) return null;
  const p=(n:number)=>String(n).padStart(2,"0");
  return String(y).padStart(4,"0")+"-"+p(mo)+"-"+p(d)+"T"+p(h)+":"+p(mi)+":"+p(s)+"+08:00";
}
function parseOfficialTime(value: unknown) {
  const text=String(value||"").trim();
  if (!text) return null;
  const digits=text.replace(/\D/g,"");
  try {
    if (digits.length>=14 && Number(digits.slice(0,4))>=1900) {
      return isoTaiwan(Number(digits.slice(0,4)),Number(digits.slice(4,6)),Number(digits.slice(6,8)),Number(digits.slice(8,10)),Number(digits.slice(10,12)),Number(digits.slice(12,14)));
    }
    if (digits.length>=13) {
      return isoTaiwan(Number(digits.slice(0,3))+1911,Number(digits.slice(3,5)),Number(digits.slice(5,7)),Number(digits.slice(7,9)),Number(digits.slice(9,11)),Number(digits.slice(11,13)));
    }
    const parsed=new Date(text);
    return Number.isFinite(parsed.getTime())?parsed.toISOString():null;
  } catch { return null; }
}
function stableAnnouncementId(row:any) {
  return [row.office,row.category,row.startNumber,row.endNumber,row.startAt||"",row.endAt||""].join("|");
}
function parseMvdisRows(html:string) {
  const items:any[]=[];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>decodeHtml(m[1]));
    if (cells.length<7) continue;
    const office=cells[0],category=cells[1];
    const startNumber=String(cells[2]||"").replace(/\s+/g,"").toUpperCase();
    const endNumber=String(cells[3]||"").replace(/\s+/g,"").toUpperCase();
    if (!office||!/^[A-Z]{1,4}-?\d{1,4}$/i.test(startNumber)||!/^[A-Z]{1,4}-?\d{1,4}$/i.test(endNumber)) continue;
    const row={
      office,category,startNumber,endNumber,
      startAt:parseOfficialTime(cells[4]),
      endAt:parseOfficialTime(cells[5]),
      transferDeadline:parseOfficialTime(cells[6])
    };
    items.push({id:stableAnnouncementId(row),...row});
  }
  return items;
}
function dedupeAnnouncements(items:any[]) {
  const out=new Map<string,any>();
  for (const row of items) out.set(String(row.id),row);
  return [...out.values()].sort((a,b)=>String(a.startAt||"9999").localeCompare(String(b.startAt||"9999"))||String(a.office||"").localeCompare(String(b.office||""))||String(a.startNumber||"").localeCompare(String(b.startNumber||"")));
}
function cachePayload(cache:any, stale=false) {
  const items=Array.isArray(cache?.items)?cache.items:[];
  return {
    schema:1,status:items.length?"live":"error",
    source:"交通部公路局監理服務網：號牌標售公告",
    sourceUrl:MVDIS_ANNOUNCE_URL,
    datasetUrl:ANNOUNCEMENT_DATASET_URL,
    downloadUrl:MVDIS_ANNOUNCE_URL,
    updatedAt:cache?.fetched_at||null,
    sourceUpdatedAt:cache?.source_updated_at||cache?.fetched_at||null,
    sourceHash:cache?.source_hash||null,
    count:items.length,items,stale
  };
}
async function readOfficialCache() {
  const {data}=await db.from("plate_line_official_cache")
    .select("cache_key,fetched_at,source_updated_at,source_hash,count,items")
    .eq("cache_key","announcements").maybeSingle();
  return data||null;
}
async function fallbackOfficialPayload() {
  const response=await fetch(ANNOUNCEMENT_FALLBACK_URL,{cache:"no-store"});
  if (!response.ok) throw new Error("Fallback announcement HTTP "+response.status);
  const data=await response.json();
  if (!Array.isArray(data?.items)) throw new Error("Fallback announcement payload invalid");
  return {...data,stale:true};
}
async function mvdisSession() {
  const first=await fetch(MVDIS_ANNOUNCE_URL,{cache:"no-store",headers:{"user-agent":"Mozilla/5.0 COLA-GO/1.0","accept":"text/html,application/xhtml+xml"}});
  const html=await first.text();
  const csrf=inputValue(html,"CSRFToken");
  const cookie=(first.headers.get("set-cookie")||"").split(";")[0]||"";
  if (!first.ok||!csrf||!cookie) throw new Error("MVDIS session init failed");
  return {csrf,cookie};
}
async function mvdisFirstPage(session:{csrf:string,cookie:string}) {
  const form=new URLSearchParams({method:"queryOpenByStation",onChangeItem:"2",announceSelected:"0",sectionCode:"all",plateType:"",CSRFToken:session.csrf});
  const response=await fetch(MVDIS_ANNOUNCE_URL,{
    method:"POST",
    headers:{"user-agent":"Mozilla/5.0 COLA-GO/1.0","accept":"text/html,application/xhtml+xml","content-type":"application/x-www-form-urlencoded","cookie":session.cookie,"referer":MVDIS_ANNOUNCE_URL},
    body:form.toString(),cache:"no-store"
  });
  const html=await response.text();
  if (!response.ok) throw new Error("MVDIS query failed: "+response.status);
  return {html,csrf:inputValue(html,"CSRFToken")||session.csrf,total:Math.max(1,Math.min(100,Number(inputValue(html,"total"))||1))};
}
async function mvdisPage(page:number,csrf:string,cookie:string) {
  const qs=new URLSearchParams({CSRFToken:csrf,"d-5481-p":String(page),plateType:"",onChangeItem:"2",method:"queryOpenByStation",sectionCode:"all",announceSelected:"0"});
  const response=await fetch(MVDIS_ANNOUNCE_URL+"?"+qs.toString()+"#anchor",{
    headers:{"user-agent":"Mozilla/5.0 COLA-GO/1.0","accept":"text/html,application/xhtml+xml","cookie":cookie,"referer":MVDIS_ANNOUNCE_URL},
    cache:"no-store"
  });
  const html=await response.text();
  if (!response.ok) throw new Error("MVDIS page "+page+" failed: "+response.status);
  return html;
}
async function fetchMvdisAnnouncements() {
  const session=await mvdisSession();
  const first=await mvdisFirstPage(session);
  const pages:string[]=[first.html];
  const remaining=Array.from({length:Math.max(0,first.total-1)},(_,i)=>i+2);
  for (let i=0;i<remaining.length;i+=4) {
    const htmls=await Promise.all(remaining.slice(i,i+4).map(page=>mvdisPage(page,first.csrf,session.cookie)));
    pages.push(...htmls);
  }
  const items=dedupeAnnouncements(pages.flatMap(parseMvdisRows));
  if (!items.length) throw new Error("MVDIS returned no plate rows");
  return {items,totalPages:first.total};
}
async function officialAnnouncements(force=false) {
  const cached=await readOfficialCache();
  const cachedAt=Date.parse(cached?.fetched_at||"");
  if (!force && cached && Number.isFinite(cachedAt) && Date.now()-cachedAt<ANNOUNCEMENT_CACHE_TTL_MS && Array.isArray(cached.items)) return cachePayload(cached,false);
  try {
    const fresh=await fetchMvdisAnnouncements();
    const fetchedAt=new Date().toISOString();
    const row={cache_key:"announcements",fetched_at:fetchedAt,source_updated_at:fetchedAt,source_hash:await sha256(JSON.stringify(fresh.items)),count:fresh.items.length,items:fresh.items};
    const {error}=await db.from("plate_line_official_cache").upsert(row,{onConflict:"cache_key"});
    if (error) throw new Error("Official cache write failed");
    return {...cachePayload(row,false),pages:fresh.totalPages};
  } catch (error) {
    console.error("MVDIS plate refresh",error instanceof Error?error.message:String(error));
    if (cached && Array.isArray(cached.items) && cached.items.length) return cachePayload(cached,true);
    return await fallbackOfficialPayload();
  }
}
function shortHash(value:string) {
  let h=2166136261;
  for (let i=0;i<value.length;i++) { h^=value.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(16).padStart(8,"0");
}
function rowRangeLabel(row:any) {
  const a=String(row?.startNumber||""),b=String(row?.endNumber||"");
  return a===b?a:(a+"～"+b);
}
function candidateFullPlate(row:any, plate:string) {
  if (!/^\d{1,4}$/.test(plate)) return plate;
  const m=String(row?.startNumber||"").match(/^([A-Z]{1,4})-?(\d{1,4})$/i);
  if (!m) return plate;
  return m[1].toUpperCase()+"-"+plate.padStart(m[2].length,"0");
}
function announcementSummaryEvent(plate:string, rows:any[]) {
  const ids=rows.map(r=>String(r?.id||"")).sort();
  const offices=[...new Set(rows.map(r=>String(r?.office||"")).filter(Boolean))];
  const sample=rows.slice(0,2).map(r=>String(r?.office||"監理單位")+" "+candidateFullPlate(r,plate)).join("、");
  return {key:"announcement:"+plate+":"+shortHash(ids.join("|")),text:plate+" 全台新增命中 "+rows.length+" 筆公告、"+offices.length+" 個監理單位"+(sample?"；"+sample+(rows.length>2?" 等":""):"")+"。"};
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
function categoryMatchesVehicleScope(row:any, scope:string) {
  if (scope === "all") return true;
  const category=String(row?.category||"").replace(/\s+/g,"");
  return ["自用小客貨車","電動自小客","身障自用小客貨車","電動身障自用小客貨"].includes(category);
}
function eventCandidates(row: any, plate: string, events: Set<string>, now: number, deadlineChanged: boolean) {
  const out:{key:string,text:string}[] = [];
  const id = String(row?.id || [row?.office,row?.startNumber,row?.endNumber,row?.startAt].join("|"));
  const start = Date.parse(row?.startAt || ""), end = Date.parse(row?.endAt || "");
  const startMs = start - now, endMs = end - now;
  const context=candidateFullPlate(row,plate)+"・"+String(row?.office||"監理單位");
  if (events.has("auction_start") && Number.isFinite(start)) {
    if (startMs > 0 && startMs <= 15*60000) out.push({ key:"start15:"+id+":"+plate, text:context+" 距官方起標約剩 15 分鐘。" });
    else if (startMs <= 0 && (!Number.isFinite(end) || endMs > 0)) out.push({ key:"started:"+id+":"+plate, text:context+" 已進入公告競標時段，請到監理服務網確認最新狀態。" });
  }
  if (events.has("auction_end") && Number.isFinite(end) && endMs > 0) {
    if (endMs <= 3*60000) out.push({ key:"end3:"+id+":"+plate, text:context+" 距公告決標約剩 3 分鐘；若官方延長，請以正式競標頁最後時間為準。" });
    else if (endMs <= 15*60000) out.push({ key:"end15:"+id+":"+plate, text:context+" 距公告決標約剩 15 分鐘；最後階段仍以官方頁為準。" });
  }
  if (events.has("deadline_change") && deadlineChanged) out.push({ key:"deadline:"+id+":"+plate+":"+String(row?.endAt||""), text:context+" 的官方公告決標時間有變動，請重新確認。" });
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
async function getOfficialAnnouncements(origin:string) {
  if (origin!==SITE_ORIGIN) return json({error:"ORIGIN_NOT_ALLOWED"},403,origin);
  const payload=await officialAnnouncements(false);
  return json(payload,200,origin);
}
async function forceOfficialRefresh(req:Request) {
  const supplied=req.headers.get("x-colago-cron-secret")||"";
  const expected=await getSecret("colago_cron_secret");
  if (!supplied||!constantTimeEqual(supplied,expected)) return json({error:"UNAUTHORIZED"},401);
  const payload=await officialAnnouncements(true);
  return json({ok:true,count:payload.count,updatedAt:payload.updatedAt,sourceUpdatedAt:payload.sourceUpdatedAt,stale:payload.stale===true},200);
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

  const payload = await officialAnnouncements(false);
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

  let remaining:number|null = null;
  let quotaChecked=false;
  const reserve = 20;
  let sentUsers=0, sentEvents=0, skippedQuota=0;
  const now=Date.now();

  for (const sub of subs||[]) {
    const profile=sanitizeProfile(sub.profile), eventSet=new Set(profile.events);
    let candidates:any[]=[];
    for (const plate of profile.plates) {
      const matched=rows.filter((row:any)=>rangeContains(row,plate)&&categoryMatchesVehicleScope(row,profile.vehicleScope)).filter((row:any)=>{
        const end=Date.parse(row?.endAt||"");
        return !Number.isFinite(end)||end>=now;
      });
      if (eventSet.has("announcement")) {
        for (const row of matched) {
          candidates.push({
            key:"announcement:"+String(row?.id||"")+":"+plate,
            text:"",
            kind:"announcement",
            plate,
            row
          });
        }
      }
      for (const row of matched) {
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

    const grouped:any[]=[];
    const announcementGroups=new Map<string,any[]>();
    for (const item of pending) {
      if (item.kind==="announcement") {
        const list=announcementGroups.get(item.plate)||[];
        list.push(item);
        announcementGroups.set(item.plate,list);
      } else {
        grouped.push({...item,logKeys:[item.key]});
      }
    }
    for (const [plate,items] of announcementGroups) {
      const summary=announcementSummaryEvent(plate,items.map(x=>x.row));
      grouped.unshift({...summary,logKeys:items.map(x=>x.key)});
    }

    const sendable=grouped.slice(0,10);
    if (!sendable.length) continue;
    if (!quotaChecked) {
      remaining=await lineQuotaRemaining();
      quotaChecked=true;
    }
    if (remaining!==null && remaining<=reserve) { skippedQuota++; break; }
    const lines=sendable.map(x=>"• "+x.text);
    const message=["COLA GO 車牌提醒","",...lines,"","查看車牌中心："+SITE_PLATE_URL].join("\n");
    try {
      await pushLine(sub.line_user_id,message.slice(0,4900));
      const logKeys=sendable.flatMap(x=>Array.isArray(x.logKeys)?x.logKeys:[x.key]);
      await db.from("plate_line_delivery_log").insert(logKeys.map(key=>({line_user_id:sub.line_user_id,event_key:key})));
      sentUsers++; sentEvents+=logKeys.length;
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

    if (path==="/v1/plate-line/announcements" && req.method==="GET") return await getOfficialAnnouncements(origin);
    if (path==="/v1/plate-line/refresh-source" && req.method==="POST") return await forceOfficialRefresh(req);
    if (path==="/v1/line/webhook" && req.method==="POST") return await handleWebhook(req);
    if (path==="/v1/line/setup-webhook" && req.method==="POST") return await configureLineWebhook(req);
    if (path==="/v1/plate-line/run" && req.method==="POST") return await runNotifications(req);

    return json({error:"NOT_FOUND"},404,origin);
  } catch (error) {
    console.error("cola-go-line",error instanceof Error?error.message:String(error));
    return json({error:"INTERNAL_ERROR"},500,origin);
  }
});
