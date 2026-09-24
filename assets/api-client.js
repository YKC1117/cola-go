(()=> {
  const state={ready:false,baseUrl:"",enabled:false,source:"none"};

  function normalizeBase(value){
    if(!value)return "";
    try{
      const url=new URL(String(value));
      const local=["localhost","127.0.0.1"].includes(url.hostname);
      if(url.protocol!=="https:"&&!local)throw new Error("API base must use https");
      return url.origin+url.pathname.replace(/\/$/,"");
    }catch{return "";}
  }

  async function init(configUrl="./data/runtime-config.json"){
    if(state.ready)return {...state};
    state.ready=true;
    try{
      const response=await fetch(configUrl,{cache:"no-store"});
      if(response.ok){
        const config=await response.json();
        state.baseUrl=normalizeBase(config?.apiBaseUrl);
        state.enabled=Boolean(state.baseUrl);
        state.source=state.enabled?"runtime-config":"none";
      }
    }catch{}
    return {...state};
  }

  function enabled(){return state.enabled;}
  function info(){return {...state};}

  function buildUrl(path,params={}){
    if(!state.enabled)throw new Error("COLA API proxy is not configured");
    const url=new URL(state.baseUrl+path);
    for(const [key,value] of Object.entries(params)){
      if(value!==undefined&&value!==null&&value!=="")url.searchParams.set(key,String(value));
    }
    return url;
  }

  async function fetchEnvelope(path,{params={},timeout=9000}={}){
    const url=buildUrl(path,params);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url.toString(),{
        method:"GET",
        headers:{Accept:"application/json"},
        cache:"no-store",
        credentials:"omit",
        signal:controller.signal
      });
      let body=null;
      try{body=await response.json();}catch{}
      if(!response.ok){
        const error=new Error(body?.error?.code||("HTTP "+response.status));
        error.code=body?.error?.code||"API_ERROR";
        error.httpStatus=response.status;
        error.retryAfterSeconds=body?.error?.retryAfterSeconds??null;
        error.envelope=body;
        throw error;
      }
      if(!body||body.schemaVersion!==1||!Array.isArray(body.items))throw new Error("Invalid COLA API envelope");
      return body;
    }finally{
      clearTimeout(timer);
    }
  }

  async function fetchAll(path,{params={},limit=1000,maxPages=20,timeout=9000}={}){
    const items=[];
    let cursor=null;
    let first=null;
    let snapshotId=null;
    for(let page=0;page<maxPages;page++){
      const envelope=await fetchEnvelope(path,{
        params:{...params,limit,cursor},
        timeout
      });
      if(!first){
        first=envelope;
        snapshotId=envelope.snapshotId||null;
      }else if(snapshotId&&envelope.snapshotId&&envelope.snapshotId!==snapshotId){
        throw new Error("COLA API snapshot changed during pagination");
      }
      items.push(...envelope.items);
      cursor=envelope.pagination?.nextCursor??null;
      if(!cursor){
        return {
          ...first,
          status:first.stale?"stale":first.status,
          stale:Boolean(first.stale),
          items,
          coverage:{...(first.coverage||{}),returned:items.length,total:first.coverage?.total??items.length},
          pagination:{nextCursor:null}
        };
      }
    }
    throw new Error("COLA API pagination exceeded safety limit");
  }

  window.COLAGO_API={init,enabled,info,fetchEnvelope,fetchAll};
})();
