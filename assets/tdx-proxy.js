(()=>{
  const STATUS=new Set(["static","live","stale","partial","unavailable"]);

  function baseUrl(){
    const raw=String(window.COLA_GO_CONFIG?.apiBaseUrl||"").trim().replace(/\/+$/,"");
    if(!raw)return "";
    try{
      const url=new URL(raw,location.href);
      const local=/^(localhost|127\.0\.0\.1)$/.test(url.hostname);
      if(url.protocol!=="https:"&&!local)return "";
      return url.origin+url.pathname.replace(/\/+$/,"");
    }catch{return "";}
  }

  function enabled(){return Boolean(baseUrl());}

  async function request(path,{timeout=9000}={}){
    const base=baseUrl();
    if(!base)throw new Error("TDX proxy is not configured");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(base+path,{
        method:"GET",
        headers:{Accept:"application/json"},
        credentials:"omit",
        cache:"no-store",
        signal:controller.signal
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok){
        const code=data?.error?.code||("HTTP_"+response.status);
        const error=new Error(code);
        error.status=response.status;
        error.code=code;
        error.retryAfterSeconds=data?.error?.retryAfterSeconds??null;
        throw error;
      }
      if(!data||data.schemaVersion!==1||!STATUS.has(data.status)||!Array.isArray(data.items)){
        throw new Error("INVALID_PROXY_ENVELOPE");
      }
      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  const q=v=>encodeURIComponent(v);

  window.COLA_GO_PROXY=Object.freeze({
    enabled,
    baseUrl,
    request,
    parking:city=>request("/api/v1/parking/"+q(city)),
    parkingAvailability:city=>request("/api/v1/parking/"+q(city)+"/availability"),
    chargingStations:scope=>request("/api/v1/charging/stations?scope="+q(scope)),
    chargingPoints:scope=>request("/api/v1/charging/points?scope="+q(scope)),
    chargingConnectors:scope=>request("/api/v1/charging/connectors?scope="+q(scope)),
    chargingAvailability:scope=>request("/api/v1/charging/availability?scope="+q(scope)),
    freewaySections:()=>request("/api/v1/freeway/sections"),
    freewayLive:()=>request("/api/v1/freeway/live"),
    freewayCctv:()=>request("/api/v1/freeway/cctv"),
    xueshanLive:()=>request("/api/v1/tunnel/xueshan/live")
  });
})();
