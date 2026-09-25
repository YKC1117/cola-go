import { TDX_API_BASE, TDX_TOKEN_URL, numericEnv } from "./config.js";
import { AppError } from "./errors.js";

export async function requestToken(env, fetchImpl=fetch) {
  if(!env.TDX_CLIENT_ID||!env.TDX_CLIENT_SECRET) throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX credentials are not configured");
  const body=new URLSearchParams({grant_type:"client_credentials",client_id:env.TDX_CLIENT_ID,client_secret:env.TDX_CLIENT_SECRET});
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),numericEnv(env,"TDX_TIMEOUT_MS",8000));
  try {
    const response=await fetchImpl(TDX_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:controller.signal,redirect:"error"});
    if(response.status===429){const retryAfter=Math.max(60,Number(response.headers.get("retry-after")||60));throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX token endpoint rate limited",{authCooldown:true,retryAfterSeconds:retryAfter});}
    if(!response.ok) throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX token request failed",{authCooldown:true,retryAfterSeconds:300});
    const payload=await response.json();
    if(!payload.access_token) throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX token response missing access_token",{authCooldown:true,retryAfterSeconds:300});
    return {token:payload.access_token,expiresIn:Math.max(60,Number(payload.expires_in||86400))};
  } catch(error) {
    if(error instanceof AppError) throw error;
    throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX token request unavailable",{authCooldown:true,retryAfterSeconds:60});
  } finally {clearTimeout(timeout);}
}

function extractItems(payload) {
  if(Array.isArray(payload)) return payload;
  if(!payload||typeof payload!=="object") throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX response container is invalid");
  const arrays=Object.values(payload).filter(Array.isArray);
  if(arrays.length===0) throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX response did not contain an item array");
  return arrays[0];
}

async function readLimited(response,maxBytes) {
  if(!response.body){const text=await response.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX page exceeded configured response limit");return text;}
  const reader=response.body.getReader(),decoder=new TextDecoder();let total=0,text="";
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX page exceeded configured response limit");}text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
}

export async function fetchTdxPages({env,token,path,paginate=true,fetchImpl=fetch,beforeRequest=()=>{},onUsage=()=>{}}) {
  const maxBytes=numericEnv(env,"MAX_UPSTREAM_BYTES",2097152),pageSize=paginate?1000:0,maxPages=paginate?20:1;
  const collected=[];let sourceUpdatedAt=null;
  for(let page=0;page<maxPages;page++){
    const url=new URL(TDX_API_BASE+path);url.searchParams.set("$format","JSON");
    if(paginate){url.searchParams.set("$top",String(pageSize));url.searchParams.set("$skip",String(page*pageSize));}
    beforeRequest();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),numericEnv(env,"TDX_TIMEOUT_MS",8000));
    try{
      const response=await fetchImpl(url.toString(),{headers:{authorization:`Bearer ${token}`,accept:"application/json"},signal:controller.signal,redirect:"error"});
      if(response.status===401)throw new AppError(503,"UPSTREAM_AUTH_FAILED","TDX token rejected",{refreshToken:true});
      if(response.status===429){const retryAfter=Math.max(60,Number(response.headers.get("retry-after")||60));throw new AppError(503,"UPSTREAM_UNAVAILABLE","TDX rate limited",{retryAfterSeconds:retryAfter,cooldown:true});}
      if(response.status>=500)throw new AppError(503,"UPSTREAM_UNAVAILABLE","TDX service unavailable",{retryAfterSeconds:60,cooldown:true});
      if(!response.ok)throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","Unexpected TDX response");
      const text=await readLimited(response,maxBytes),bytes=new TextEncoder().encode(text).byteLength;onUsage({calls:1,bytes});
      let payload;try{payload=JSON.parse(text);}catch{throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX returned invalid JSON");}
      const items=extractItems(payload);collected.push(...items);
      for(const item of items){const value=item?.DataCollectTime||item?.UpdateTime||item?.SrcUpdateTime;if(value&&(!sourceUpdatedAt||String(value)>sourceUpdatedAt))sourceUpdatedAt=String(value);}
      if(!paginate||items.length<pageSize)return {items:collected,sourceUpdatedAt,complete:true};
    }catch(error){
      if(error instanceof AppError)throw error;
      throw new AppError(503,"UPSTREAM_UNAVAILABLE","TDX request timed out or failed",{retryAfterSeconds:60,cooldown:true});
    }finally{clearTimeout(timeout);}
  }
  throw new AppError(502,"UPSTREAM_SCHEMA_INVALID","TDX pagination exceeded safety limit");
}
export async function withOneAuthRefresh({getToken,request}) {
  let token=await getToken(false);
  try{return await request(token);}catch(error){if(!(error instanceof AppError)||!error.extra?.refreshToken)throw error;token=await getToken(true);return request(token);}
}
