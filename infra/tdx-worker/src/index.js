const TDX_BASE = "https://tdx.transportdata.tw/api/basic";
const TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";

const CITIES = new Set([
  "Taipei","NewTaipei","Taoyuan","Taichung","Tainan","Kaohsiung","Keelung",
  "Hsinchu","HsinchuCounty","MiaoliCounty","ChanghuaCounty","NantouCounty",
  "YunlinCounty","Chiayi","ChiayiCounty","PingtungCounty","YilanCounty",
  "HualienCounty","TaitungCounty","PenghuCounty","KinmenCounty","LienchiangCounty"
]);

const ROUTES = [
  [/^\/api\/parking\/([^/]+)\/lots$/, c => ({path:`/v1/Parking/OffStreet/CarPark/City/${c}`,ttl:86400})],
  [/^\/api\/parking\/([^/]+)\/availability$/, c => ({path:`/v1/Parking/OffStreet/ParkingAvailability/City/${c}`,ttl:120})],
  [/^\/api\/ev\/([^/]+)\/stations$/, c => ({path:`/v1/EV/Station/City/${c}`,ttl:14400})],
  [/^\/api\/ev\/([^/]+)\/connectors$/, c => ({path:`/v1/EV/Connector/City/${c}`,ttl:14400})],
  [/^\/api\/ev\/([^/]+)\/status$/, c => ({path:`/v1/EV/ConnectorLiveStatus/City/${c}`,ttl:120})],
  [/^\/api\/highway\/traffic$/, () => ({path:"/v2/Road/Traffic/Live/Freeway",ttl:120})],
  [/^\/api\/highway\/cctv$/, () => ({path:"/v2/Road/Traffic/CCTV/Freeway",ttl:86400})]
];

let tokenMemo = null;

function cors(env, origin) {
  const allowed = new Set((env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean));
  return allowed.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  } : {};
}
function json(body,status=200,headers={}) {
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...headers}});
}
async function token(env, force=false) {
  const now=Date.now();
  if(!force && tokenMemo && tokenMemo.expiresAt > now+60000) return tokenMemo.value;
  if(!env.TDX_CLIENT_ID || !env.TDX_CLIENT_SECRET) throw new Error("TDX_NOT_CONFIGURED");
  const body=new URLSearchParams({
    grant_type:"client_credentials",
    client_id:env.TDX_CLIENT_ID,
    client_secret:env.TDX_CLIENT_SECRET
  });
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),8000);
  try {
    const r=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:ctl.signal});
    if(!r.ok) throw new Error("TDX_TOKEN_"+r.status);
    const x=await r.json();
    if(!x.access_token) throw new Error("TDX_TOKEN_INVALID");
    tokenMemo={value:x.access_token,expiresAt:now+(Number(x.expires_in)||86400)*1000};
    return tokenMemo.value;
  } finally { clearTimeout(timer); }
}
function resolve(pathname) {
  for(const [re,make] of ROUTES) {
    const m=pathname.match(re); if(!m) continue;
    if(m[1] && !CITIES.has(m[1])) return {invalidCity:true};
    return make(m[1]);
  }
  return null;
}
async function upstream(env,path,retry=true) {
  const t=await token(env);
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),10000);
  try {
    const r=await fetch(TDX_BASE+path+"?$format=JSON",{headers:{Authorization:"Bearer "+t,Accept:"application/json"},signal:ctl.signal});
    if(r.status===401 && retry){ tokenMemo=null; await token(env,true); return upstream(env,path,false); }
    if(!r.ok) { const e=new Error("TDX_UPSTREAM_"+r.status); e.status=r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function handle(request,env,ctx) {
  const u=new URL(request.url), origin=request.headers.get("Origin")||"";
  const ch=cors(env,origin);
  if(request.method==="OPTIONS") return new Response(null,{status:Object.keys(ch).length?204:403,headers:ch});
  if(request.method!=="GET") return json({error:"METHOD_NOT_ALLOWED"},405,ch);
  if(u.pathname==="/health") return json({ok:true,service:"cola-go-tdx"},200,ch);
  const route=resolve(u.pathname);
  if(!route) return json({error:"NOT_FOUND"},404,ch);
  if(route.invalidCity) return json({error:"INVALID_CITY"},400,ch);
  if(origin && !Object.keys(ch).length) return json({error:"ORIGIN_NOT_ALLOWED"},403);

  const key=new Request(u.origin+u.pathname,{method:"GET"});
  const cache=caches.default;
  const hit=await cache.match(key);
  if(hit) return new Response(hit.body,{status:hit.status,headers:{...Object.fromEntries(hit.headers),...ch}});

  try {
    const data=await upstream(env,route.path);
    const payload={status:"live",source:"TDX",fetchedAt:new Date().toISOString(),stale:false,items:Array.isArray(data)?data:(data?.data||[])};
    const response=json(payload,200,{...ch,"Cache-Control":`public, max-age=${route.ttl}`});
    ctx.waitUntil(cache.put(key,response.clone()));
    return response;
  } catch(e) {
    const code=e.message==="TDX_NOT_CONFIGURED"?"TDX_NOT_CONFIGURED":e.name==="AbortError"?"TDX_TIMEOUT":"TDX_UNAVAILABLE";
    return json({status:"unavailable",source:"TDX",stale:false,error:code},code==="TDX_NOT_CONFIGURED"?503:502,ch);
  }
}
export default { fetch: handle };
