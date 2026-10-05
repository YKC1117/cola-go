const CACHE="cola-go-ui-v6-64";
const DATA_CACHE="cola-go-data-v1";
const SW_RELEASE="Public Beta V37";
const CORE=["./","./index.html","./manifest.webmanifest","./assets/logo.svg","./assets/styles.css","./assets/app.js","./assets/tdx-runtime.js","./assets/images/drive-hero.webp"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==DATA_CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
    .then(()=>self.clients.matchAll({type:"window",includeUncontrolled:true}))
    .then(clients=>Promise.all(clients.map(client=>client.postMessage({type:"COLA_GO_SW_ACTIVATED",release:SW_RELEASE}))))
));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;

  // Charging snapshot is ~4 MB. Re-downloading it on every Charging visit
  // made "附近有空槍" wait behind the network even after geolocation finished.
  // Serve the last successful snapshot immediately, then refresh it in the
  // background. The payload still carries liveUpdatedAt/liveStale, so the UI
  // will not present an old snapshot as confirmed live availability.
  if(u.pathname.endsWith("/data/tdx/charging.json")){
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