export function makePublicCacheKey(request) {
  const url=new URL(request.url);url.hash="";
  return new Request(url.toString(),{method:"GET"});
}
export function classifySnapshot(row,now=Date.now()) {
  if(!row)return "missing";
  if(now<Number(row.expires_at))return "fresh";
  if(now<Number(row.stale_until))return "stale";
  return "expired";
}
export function publicCacheSeconds(route,envelope,now=Date.now()) {
  const configured=Math.max(1,Math.min(Number(route.ttl?.fresh||30),86400));
  if(!envelope)return configured;
  const expiresAt=Date.parse(envelope.expiresAt||"");
  if(!Number.isFinite(expiresAt))return 0;
  return Math.max(0,Math.min(configured,Math.floor((expiresAt-now)/1000)));
}
export function snapshotEnvelope(row,stale=false) {
  if(!row?.body)return null;
  const body=JSON.parse(row.body);
  if(!stale)return body;
  return {...body,status:"stale",stale:true,expiresAt:new Date(Number(row.expires_at)).toISOString()};
}
