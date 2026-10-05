const CACHE="cola-go-ui-v6-72";
const DATA_CACHE="cola-go-data-v1";
const SW_RELEASE="Public Beta V37";
const CORE=["./","./index.html","./manifest.webmanifest","./assets/logo.svg","./assets/styles.css","./assets/plate.css","./assets/home-focus.css","./assets/ui-polish.css","./assets/ui-polish-v4.css","./assets/ui-polish-v5.css","./assets/app.js","./assets/tdx-runtime.js","./assets/images/drive-hero.webp"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==DATA_CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
    .then(()=>self.clients.matchAll({type:"window",includeUncontrolled:true}))
    .then(clients=>Promise.all(clients.map(client=>client.postMessage({type:"COLA_GO_SW_ACTIVATED",release:SW_RELEASE}))))
));

async function expandChargingFastResponse(response){
  try{
    const data=await response.clone().json();
    if(!data?.fastSnapshot||data.fastSchema!==2||!Array.isArray(data.fields)||!Array.isArray(data.items))return response;
    const rows=data.items.map(values=>{
      if(!Array.isArray(values))return values;
      const row={};
      data.fields.forEach((key,index)=>{
        const value=values[index];
        if(value!==null&&value!==undefined&&value!=="")row[key]=value;
      });
      row.road="tdx";
      if(!row.direction)row.direction=row.cityName||row.city||"";
      if(!row.note)row.note="TDX 官方充電站";
      if(!row.power&&Number(row.maxPowerKw)>0)row.power=String(Number(row.maxPowerKw))+" kW";
      return row;
    });
    const expanded={...data,items:rows};
    delete expanded.fields;
    const headers=new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type","application/json; charset=utf-8");
    return new Response(JSON.stringify(expanded),{status:response.status,statusText:response.statusText,headers});
  }catch{
    return response;
  }
}

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;

  // First Charging visit: transfer the compact snapshot before the ~4 MB full
  // snapshot has ever been cached. The compact rows are expanded back to the
  // normal object shape inside the service worker, so the existing UI needs no
  // special-case rendering. After first paint, the full snapshot is cached in
  // the background for later visits.
  if(u.pathname.endsWith("/data/tdx/charging.json")){
    let refreshPromise=null;
    const refreshFull=()=>{
      if(refreshPromise)return refreshPromise;
      refreshPromise=fetch(e.request).then(async r=>{
        if(r&&r.ok){
          const copy=r.clone();
          try{const cache=await caches.open(DATA_CACHE);await cache.put(e.request,copy)}catch{}
        }
        return r;
      });
      return refreshPromise;
    };
    const cachedPromise=caches.open(DATA_CACHE).then(cache=>cache.match(e.request));
    const fastPromise=cachedPromise.then(async cached=>{
      if(cached)return null;
      try{
        const fastUrl=new URL("./data/tdx/charging-fast.json",self.location.href);
        const fast=await fetch(fastUrl.href,{cache:"default"});
        return fast&&fast.ok?expandChargingFastResponse(fast):null;
      }catch{
        return null;
      }
    });
    const refreshPlan=Promise.all([cachedPromise,fastPromise])
      .then(()=>refreshFull())
      .then(()=>{},()=>{});
    e.waitUntil(refreshPlan);
    e.respondWith(Promise.all([cachedPromise,fastPromise]).then(([cached,fast])=>{
      if(cached)return cached;
      if(fast)return fast;
      return refreshFull().catch(()=>new Response("",{status:503,statusText:"Offline"}));
    }));
    return;
  }

  // Operator snapshots are supplemental/static-ish data. Keep them warm too,
  // so the charging screen does not start four extra blocking downloads every
  // time it is reopened. They are refreshed in the background on each read.
  if(u.pathname.includes("/data/operators/")){
    const refresh=fetch(e.request).then(async r=>{
      if(r&&r.ok){
        const copy=r.clone();
        try{const cache=await caches.open(DATA_CACHE);await cache.put(e.request,copy)}catch{}
      }
      return r;
    });
    e.respondWith(caches.open(DATA_CACHE).then(async cache=>{
      const cached=await cache.match(e.request);
      if(cached){
        e.waitUntil(refresh.then(()=>{},()=>{}));
        return cached;
      }
      return refresh.catch(()=>new Response("",{status:503,statusText:"Offline"}));
    }));
    return;
  }

  if(u.pathname.includes("/data/tdx/")||u.pathname.includes("/data/plates/")){
    e.respondWith(fetch(e.request));
    return;
  }
  const network=fetch(e.request).then(r=>{
    if(r&&r.ok){
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
    }
    return r;
  });
  e.waitUntil(network.then(()=>{},()=>{}));
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached)return cached;
      return network.catch(async()=>{
        if(e.request.mode==="navigate"){
          const shell=await caches.match("./index.html");
          if(shell)return shell;
        }
        return new Response("",{status:503,statusText:"Offline"});
      });
    })
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type!=="COLA_GO_GET_RELEASE")return;
  try{event.source?.postMessage({type:"COLA_GO_SW_RELEASE",release:SW_RELEASE})}catch{}
});

function safeNotificationTarget(value){
  try{
    const target=new URL(value||"./#plate",self.location.href);
    return target.origin===self.location.origin?target.href:new URL("./#plate",self.location.href).href;
  }catch{
    return new URL("./#plate",self.location.href).href;
  }
}
function parsePushData(event){
  if(!event.data)return {};
  try{return event.data.json()}catch{}
  try{return {body:event.data.text()}}catch{}
  return {};
}
self.addEventListener("push",event=>{
  const data=parsePushData(event);
  const title=String(data.title||"COLA GO 車牌提醒");
  const options={
    body:String(data.body||"你的候選車牌有新的變化，請開啟 COLA GO 查看。"),
    icon:"./assets/logo.svg",
    tag:String(data.tag||"cola-go-plate"),
    data:{url:safeNotificationTarget(data.url||"./#plate")}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=safeNotificationTarget(event.notification?.data?.url||"./#plate");
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows=>{
    const sameOrigin=windows.find(client=>{
      try{return new URL(client.url).origin===self.location.origin}catch{return false}
    });
    if(sameOrigin){
      try{if("navigate" in sameOrigin)await sameOrigin.navigate(target)}catch{}
      return sameOrigin.focus();
    }
    return self.clients.openWindow(target);
  }));
});
