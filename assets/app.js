const state={
  view:"home",
  charging:[],
  traffic:null,
  tunnel:null,
  parking:null,
  parkingLive:{status:"not-synced",items:[]},
  parkingSort:"availability",
  parkingHasSpaceOnly:false,
  parkingUserLocation:null,
  models:[],
  market:{usedCars:[],accessories:[],services:[]},
  road:"all",
  chargingDirection:"all",
  chargingConnector:"all",
  chargingPower:0,
  chargingOperator:"all",
  chargingFavoritesOnly:false,
  chargingFavorites:[],
  tripCorridor:"auto",
  recentTrips:[],
  highway:"1",
  direction:"south",
  modelFilter:"all",
  usedFilter:"all",
  compare:[],
  communityFilter:"all",
  community:{communities:[],events:[]},
  locations:{services:[]},
  cctv:{status:"idle",items:[],source:"",error:""},
  cctvRoad:"all",
  cctvLoading:false,
  cctvLastAttempt:0,
  trafficFallbackStatus:"idle",
  trafficFallbackAt:0,
  installPrompt:null
};

const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(Math.round(v||0));

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove("show"),1800);
}

function show(view,push=true){
  state.view=view;
  $$(".view").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  $$(".bottom-nav button").forEach(el=>el.classList.toggle("active",el.dataset.go===view));
  window.scrollTo({top:0,behavior:"instant"});
  if(push)history.replaceState(null,"","#"+view);
  if(view==="cctv")ensureCCTV().catch(()=>{});
  if((view==="highway"||view==="tunnel")&&state.traffic?.status!=="live")ensureClientTraffic().catch(()=>{});

}

function bindNav(){
  $$("[data-go]").forEach(el=>{
    el.onclick=e=>{
      e.preventDefault();
      show(el.dataset.go);
    };
  });
  addEventListener("hashchange",()=>show(location.hash.slice(1)||"home",false));
}

function bindExternal(root=document){
  $$("[data-url]",root).forEach(el=>{
    el.onclick=()=>window.open(el.dataset.url,"_blank","noopener");
  });
}

async function getJSON(url){
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(url);
  return response.json();
}

function formatTime(value){
  if(!value)return "等待資料";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false}).format(date)+" 更新";
}

function avg(rows){
  const values=(rows||[]).map(x=>Number(x.speed)).filter(v=>v>0&&v<200);
  return values.length?Math.round(values.reduce((sum,v)=>sum+v,0)/values.length):null;
}

function metricClass(v){
  return v>=80?"good":v>=50?"mid":"bad";
}

async function load(){
  const results=await Promise.allSettled([
    getJSON("./data/charging.json"),
    getJSON("./data/traffic.json"),
    getJSON("./data/tunnel.json"),
    getJSON("./data/parking.json"),
    getJSON("./data/parking-live-tainan.json"),
    getJSON("./data/tesla-models.json"),
    getJSON("./data/marketplace.json"),
    getJSON("./data/community.json"),
    getJSON("./data/tesla-locations.json")
  ]);

  if(results[0].status==="fulfilled")state.charging=results[0].value;
  if(results[1].status==="fulfilled")state.traffic=results[1].value;
  if(results[2].status==="fulfilled")state.tunnel=results[2].value;
  if(results[3].status==="fulfilled")state.parking=results[3].value;
  if(results[4].status==="fulfilled")state.parkingLive=results[4].value;
  if(results[5].status==="fulfilled")state.models=results[5].value.models||[];
  if(results[6].status==="fulfilled")state.market=results[6].value;
  if(results[7].status==="fulfilled")state.community=results[7].value;
  if(results[8].status==="fulfilled")state.locations=results[8].value;

  renderAll();
}

function renderAll(){
  renderCharging();
  renderParking();
  renderTraffic();
  renderTunnel();
  renderMarket();
  renderModels();
  renderCommunity();
  renderLocations();
  renderCCTV();

  const live=state.traffic?.status==="live";
  $("#syncState").classList.toggle("ready",live);
  $("#syncText").textContent=live?"即時":"同步中";
  $("#lastUpdate").textContent=formatTime(state.traffic?.updatedAt);

  $("#chargeQuick").textContent=state.charging.length?state.charging.length+" 處":"服務區";
  $("#chargeValue").textContent=state.charging.length||"—";

  const h1=avg(state.traffic?.highways?.["1"]||[]);
  $("#trafficValue").textContent=h1?h1+" km/h":"—";
  $("#trafficDot").className=live?"dot ready":"dot pending";
  $("#trafficCaption").textContent=live&&h1?"國 1 平均":"可開 1968 即時查看";

  const snow=avg([...(state.tunnel?.south||[]),...(state.tunnel?.north||[])]);
  $("#tunnelValue").textContent=snow?snow+" km/h":"—";
  $("#tunnelDot").className=state.tunnel?.status==="live"&&snow?"dot ready":"dot pending";
}

function chargingKey(x){
  return [x.road,x.name,x.direction].join("|");
}
function parseChargingPower(value){
  const m=String(value||"").match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):0;
}
function chargingDirectionMatch(x){
  const d=String(x.direction||"");
  if(state.chargingDirection==="all")return true;
  if(state.chargingDirection==="south")return d.includes("南");
  if(state.chargingDirection==="north")return d.includes("北");
  if(state.chargingDirection==="shared")return d.includes("雙向");
  return true;
}
function saveChargingFavorites(){
  try{localStorage.setItem("cola-go-charging-favorites",JSON.stringify(state.chargingFavorites));}catch{}
}
function loadChargingFavorites(){
  try{
    const rows=JSON.parse(localStorage.getItem("cola-go-charging-favorites")||"[]");
    state.chargingFavorites=Array.isArray(rows)?rows:[];
  }catch{state.chargingFavorites=[];}
}
function renderCharging(){
  const root=$("#chargingList");
  if(!root)return;

  const q=($("#chargingSearch")?.value||"").trim().toLowerCase();
  const rows=state.charging
    .filter(x=>(state.road==="all"||x.road===state.road))
    .filter(chargingDirectionMatch)
    .filter(x=>state.chargingConnector==="all"||(x.connectors||[]).includes(state.chargingConnector))
    .filter(x=>parseChargingPower(x.power)>=Number(state.chargingPower||0))
    .filter(x=>state.chargingOperator==="all"||x.operator===state.chargingOperator)
    .filter(x=>!state.chargingFavoritesOnly||state.chargingFavorites.includes(chargingKey(x)))
    .filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q))
    .sort((a,b)=>Number(state.chargingFavorites.includes(chargingKey(b)))-Number(state.chargingFavorites.includes(chargingKey(a))));

  const favCount=state.chargingFavorites.length;
  if($("#chargingFavoriteCount"))$("#chargingFavoriteCount").textContent=favCount;
  if($("#chargingFavoritesOnly"))$("#chargingFavoritesOnly").setAttribute("aria-pressed",String(state.chargingFavoritesOnly));

  root.innerHTML=rows.length?rows.map(x=>{
    const key=chargingKey(x);
    const favorite=state.chargingFavorites.includes(key);
    const query=encodeURIComponent(x.name+" "+x.location);
    return '<article class="list-item charging-item">'+
      '<div class="list-head">'+
        '<div><div class="charging-title-line"><h3>'+esc(x.name)+'</h3><button class="favorite-btn '+(favorite?'active':'')+'" data-charge-favorite="'+esc(key)+'" aria-label="'+(favorite?'取消收藏':'加入收藏')+'" aria-pressed="'+favorite+'">★</button></div><div class="meta">'+esc(x.direction)+' · '+esc(x.operator)+'</div></div>'+
        '<span class="route-tag">國 '+esc(x.road)+'</span>'+
      '</div>'+
      '<div class="charging-status-line"><span>設備資料</span><small>非即時空槍</small></div>'+
      '<div class="specs">'+
        '<span>'+esc(x.spaces)+' 車位</span>'+
        '<span>'+esc(x.power)+'</span>'+
        (x.connectors||[]).map(c=>'<span>'+esc(c)+'</span>').join("")+
      '</div>'+
      '<div class="location-line"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note?" · "+esc(x.note):"")+'</span></div>'+
      '<div class="item-actions">'+
        '<button class="go" data-charge-google="'+query+'">Google</button>'+
        '<button data-charge-apple="'+query+'">Apple 地圖</button>'+
        '<button data-camera-road="'+esc(x.road)+'">CCTV</button>'+
      '</div>'+
    '</article>';
  }).join(""):'<div class="empty"><b>沒有符合的充電站</b><p>調整國道、方向、接頭、功率或取消「只看收藏」。</p></div>';

  $$("[data-charge-favorite]",root).forEach(b=>b.onclick=()=>{
    const key=b.dataset.chargeFavorite;
    const i=state.chargingFavorites.indexOf(key);
    if(i>=0)state.chargingFavorites.splice(i,1); else state.chargingFavorites.push(key);
    saveChargingFavorites();
    renderCharging();
  });
  $$("[data-charge-google]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.chargeGoogle,"_blank","noopener"));
  $$("[data-charge-apple]",root).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.chargeApple,"_blank","noopener"));
  $$("[data-camera-road]",root).forEach(b=>b.onclick=()=>openCCTVForRoad(b.dataset.cameraRoad));
}

function parkingDistanceKm(lat1,lon1,lat2,lon2){
  const a=Number(lat1),b=Number(lon1),c=Number(lat2),d=Number(lon2);
  if(![a,b,c,d].every(Number.isFinite))return null;
  const rad=x=>x*Math.PI/180;
  const R=6371;
  const dLat=rad(c-a),dLon=rad(d-b);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function parkingDistanceLabel(km){
  if(km==null||!Number.isFinite(km))return "";
  if(km<1)return Math.round(km*1000)+" m";
  return km.toFixed(km<10?1:0)+" km";
}
function updateParkingControls(){
  if($("#parkingSortAvailability"))$("#parkingSortAvailability").setAttribute("aria-pressed",String(state.parkingSort==="availability"));
  if($("#parkingSortNearest"))$("#parkingSortNearest").setAttribute("aria-pressed",String(state.parkingSort==="nearest"));
  if($("#parkingHasSpaceOnly"))$("#parkingHasSpaceOnly").setAttribute("aria-pressed",String(state.parkingHasSpaceOnly));
  if($("#parkingLocationNote")){
    $("#parkingLocationNote").textContent=state.parkingUserLocation
      ?"目前依你的定位計算距離；定位只存在瀏覽器記憶體，不會上傳。"
      :"定位只在這台裝置計算距離，不會上傳 COLA GO。";
  }
}
function renderParking(){
  const liveRoot=$("#liveParkingList");
  const cityRoot=$("#parkingCities");
  if(!liveRoot||!cityRoot)return;

  const live=state.parkingLive||{status:"not-synced",items:[]};
  const query=($("#parkingSearch")?.value||"").trim().toLowerCase();
  let rows=(live.items||[])
    .filter(x=>!query||[x.name,x.zone,x.address,x.typeName].join(" ").toLowerCase().includes(query))
    .filter(x=>!state.parkingHasSpaceOnly||Number(x.car||0)>0)
    .map(x=>{
      const distance=state.parkingUserLocation
        ?parkingDistanceKm(state.parkingUserLocation.lat,state.parkingUserLocation.lng,Number(x.lat),Number(x.lng))
        :null;
      return {...x,_distance:distance};
    });

  if(state.parkingSort==="nearest"&&state.parkingUserLocation){
    rows.sort((a,b)=>{
      const ad=a._distance==null?Number.POSITIVE_INFINITY:a._distance;
      const bd=b._distance==null?Number.POSITIVE_INFINITY:b._distance;
      return ad-bd||Number(b.car||0)-Number(a.car||0);
    });
  }else{
    rows.sort((a,b)=>Number(b.car||0)-Number(a.car||0));
  }

  updateParkingControls();
  $("#parkingLiveTime").textContent=live.status==="live"?(live.updatedAt||"官方即時"):"暫無即時資料";

  if(live.status==="live"&&rows.length){
    liveRoot.innerHTML=rows.map(x=>{
      const available=Number(x.car||0);
      const total=Number(x.carTotal||0);
      const cls=available>=20?"good":available>=5?"mid":"bad";
      const distance=parkingDistanceLabel(x._distance);
      return '<article class="parking-card">'+
        '<div class="parking-card-top"><div><h3>'+esc(x.name)+'</h3><span class="parking-zone">'+esc(x.zone||x.typeName||"臺南")+(distance?' · 距離 '+esc(distance):'')+'</span></div><div class="parking-space"><b class="'+cls+'">'+available+'</b><small>汽車剩餘</small></div></div>'+
        '<div class="parking-specs">'+
          '<div><small>總格數</small><b>'+money(total)+'</b></div>'+
          '<div><small>綠能剩餘</small><b>'+money(Number(x.green||0))+'</b></div>'+
          '<div><small>營業／收費</small><b>'+esc(x.chargeTime||"依現場")+'</b></div>'+
        '</div>'+
        '<div class="parking-address">'+esc(x.address||"")+(x.chargeFee?' · '+esc(x.chargeFee):"")+'</div>'+
        '<div class="parking-update">官方更新：'+esc(x.sourceUpdate||live.updatedAt||"—")+'</div>'+
        '<div class="item-actions"><button class="go" data-parking-map="'+encodeURIComponent(x.address||x.name)+'">Google Maps</button><button data-parking-apple="'+encodeURIComponent(x.address||x.name)+'">Apple 地圖</button></div>'+
      '</article>';
    }).join("");
  }else if(live.status==="live"&&(query||state.parkingHasSpaceOnly)){
    liveRoot.innerHTML='<div class="empty"><b>沒有符合的臺南停車場</b><p>換個名稱、行政區，或關閉「只看有位」。</p></div>';
  }else{
    liveRoot.innerHTML='<div class="market-empty"><b>臺南即時資料暫時無法取得</b><p>不顯示過期數字。你仍可直接用地圖找附近停車場。</p><div class="item-actions"><button class="go" data-nearby-parking="google">Google Maps</button><button data-nearby-parking="apple">Apple 地圖</button></div></div>';
  }

  $$("[data-parking-map]",liveRoot).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.parkingMap,"_blank","noopener"));
  $$("[data-parking-apple]",liveRoot).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.parkingApple,"_blank","noopener"));
  $$("[data-nearby-parking]",liveRoot).forEach(b=>b.onclick=()=>{
    const url=b.dataset.nearbyParking==="apple"
      ?"https://maps.apple.com/?q="+encodeURIComponent("停車場")
      :"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("停車場");
    window.open(url,"_blank","noopener");
  });

  cityRoot.innerHTML=(state.parking?.cities||[]).map(x=>
    '<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note)+'</small></div><span class="route-tag">'+(x.status==="source-ready"?"來源已確認":"待整合")+'</span></article>'
  ).join("")||'<div class="empty"><b>其他縣市資料尚未載入</b></div>';
}

function requestParkingLocation(){
  if(!navigator.geolocation){
    toast("此瀏覽器無法取得定位");
    return;
  }
  const btn=$("#parkingSortNearest");
  if(btn)btn.disabled=true;
  toast("正在取得定位…");
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.parkingUserLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      state.parkingSort="nearest";
      if(btn)btn.disabled=false;
      renderParking();
      toast("已依距離排序");
    },
    ()=>{
      state.parkingSort="availability";
      if(btn)btn.disabled=false;
      updateParkingControls();
      toast("沒有定位權限，維持剩餘車位排序");
    },
    {enableHighAccuracy:true,timeout:8000,maximumAge:60000}
  );
}
function bindParkingTools(){
  $("#parkingSortAvailability")?.addEventListener("click",()=>{
    state.parkingSort="availability";
    renderParking();
  });
  $("#parkingSortNearest")?.addEventListener("click",()=>{
    if(state.parkingUserLocation){
      state.parkingSort="nearest";
      renderParking();
    }else{
      requestParkingLocation();
    }
  });
  $("#parkingHasSpaceOnly")?.addEventListener("click",()=>{
    state.parkingHasSpaceOnly=!state.parkingHasSpaceOnly;
    renderParking();
  });
  updateParkingControls();
}

const TDX_BASE="https://tdx.transportdata.tw/api/basic/v2/Road/Traffic";
const TISV_BASE="https://tisvcloud.freeway.gov.tw/history/motc20";

async function fetchWithTimeout(url,options={},timeout=7500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    return response;
  }finally{
    clearTimeout(timer);
  }
}

function roadNo(value){
  const text=String(value||"");
  let m=text.match(/國道\s*([1-6])/);
  if(m)return m[1];
  m=text.match(/(?:Freeway|National\s*Highway)(?:\s*No\.?)?\s*([1-6])/i);
  if(m)return m[1];
  m=text.match(/(?:^|[^0-9])([1-6])號(?:高速公路|國道)/);
  return m?m[1]:null;
}

function findObjects(value,predicate,out=[]){
  if(Array.isArray(value)){
    value.forEach(v=>findObjects(v,predicate,out));
  }else if(value&&typeof value==="object"){
    if(predicate(value))out.push(value);
    Object.values(value).forEach(v=>{
      if(v&&typeof v==="object")findObjects(v,predicate,out);
    });
  }
  return out;
}

function childText(node,name){
  for(const child of Array.from(node.children||[])){
    if(child.localName===name||child.tagName?.split(":").pop()===name)return (child.textContent||"").trim();
  }
  return "";
}

function xmlObjects(text,idField,requiredField){
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("XML parse failed");
  return Array.from(doc.getElementsByTagName("*")).filter(node=>childText(node,idField)&&childText(node,requiredField));
}

function safeHttpUrl(value){
  try{
    const url=new URL(String(value||""));
    return /^https?:$/.test(url.protocol)?url.href:"";
  }catch{return "";}
}

function normalizeCCTVObject(x){
  const stream=safeHttpUrl(x.VideoStreamURL||x.videoStreamURL||x.StreamURL||x.streamURL||"");
  const id=x.CCTVID||x.CCTVId||x.cctvId||x.id||"";
  if(!id||!stream)return null;
  const roadName=x.RoadName||x.roadName||"";
  const start=x.Start||x.start||"";
  const end=x.End||x.end||"";
  const mile=x.LocationMile||x.locationMile||x.Mile||"";
  return {
    id:String(id),
    stream:String(stream),
    road:roadName,
    roadNo:roadNo(roadName+" "+start+" "+end),
    direction:x.RoadDirection||x.roadDirection||"",
    mile:String(mile||""),
    start:String(start||""),
    end:String(end||""),
    lat:Number(x.PositionLat??x.positionLat??x.lat),
    lon:Number(x.PositionLon??x.positionLon??x.lon)
  };
}

function parseCCTVJson(data){
  const rows=findObjects(data,x=>Boolean(x&&(x.CCTVID||x.CCTVId||x.cctvId)&&(x.VideoStreamURL||x.videoStreamURL||x.StreamURL)));
  const seen=new Set();
  return rows.map(normalizeCCTVObject).filter(x=>{
    if(!x||seen.has(x.id))return false;
    seen.add(x.id);
    return true;
  });
}

function parseCCTVXml(text){
  const rows=xmlObjects(text,"CCTVID","VideoStreamURL");
  const seen=new Set();
  return rows.map(node=>normalizeCCTVObject({
    CCTVID:childText(node,"CCTVID"),
    VideoStreamURL:childText(node,"VideoStreamURL"),
    RoadName:childText(node,"RoadName"),
    RoadDirection:childText(node,"RoadDirection"),
    LocationMile:childText(node,"LocationMile"),
    Start:childText(node,"Start"),
    End:childText(node,"End"),
    PositionLat:childText(node,"PositionLat"),
    PositionLon:childText(node,"PositionLon")
  })).filter(x=>{
    if(!x||seen.has(x.id))return false;
    seen.add(x.id);
    return true;
  });
}

async function ensureCCTV(){
  if(state.cctv.status==="ready"||state.cctvLoading)return;
  if(state.cctv.status==="unavailable"&&Date.now()-state.cctvLastAttempt<60000)return;
  state.cctvLastAttempt=Date.now();
  state.cctvLoading=true;
  state.cctv={...state.cctv,status:"loading",error:""};
  renderCCTV();

  try{
    const cached=JSON.parse(sessionStorage.getItem("cola-go-cctv-v1")||"null");
    if(cached&&Date.now()-cached.savedAt<6*60*60*1000&&Array.isArray(cached.items)&&cached.items.length){
      state.cctv={status:"ready",items:cached.items,source:cached.source||"官方快取",error:""};
      state.cctvLoading=false;
      renderCCTV();
      return;
    }
  }catch{}

  let lastError="";
  try{
    const response=await fetchWithTimeout(TDX_BASE+"/CCTV/Freeway?%24format=JSON",{headers:{Accept:"application/json"}},7000);
    const rows=parseCCTVJson(await response.json());
    if(rows.length){
      state.cctv={status:"ready",items:rows,source:"TDX／交通部高速公路局",error:""};
      try{sessionStorage.setItem("cola-go-cctv-v1",JSON.stringify({savedAt:Date.now(),source:state.cctv.source,items:rows}));}catch{}
      state.cctvLoading=false;
      renderCCTV();
      return;
    }
    lastError="TDX 回傳沒有可用攝影機";
  }catch(error){
    lastError=String(error?.message||error);
  }

  try{
    const response=await fetchWithTimeout(TISV_BASE+"/CCTV.xml",{headers:{Accept:"application/xml,text/xml,*/*"}},7000);
    const rows=parseCCTVXml(await response.text());
    if(rows.length){
      state.cctv={status:"ready",items:rows,source:"交通部高速公路局 CCTV.xml",error:""};
      try{sessionStorage.setItem("cola-go-cctv-v1",JSON.stringify({savedAt:Date.now(),source:state.cctv.source,items:rows}));}catch{}
      return;
    }
    lastError="高公局回傳沒有可用攝影機";
  }catch(error){
    lastError=String(error?.message||error);
  }finally{
    state.cctvLoading=false;
    if(state.cctv.status!=="ready")state.cctv={status:"unavailable",items:[],source:"",error:lastError};
    renderCCTV();
  }
}

function renderCCTV(){
  const root=$("#cctvList");
  const status=$("#cctvSourceState");
  if(!root||!status)return;
  const q=($("#cctvSearch")?.value||"").trim().toLowerCase();

  if(state.cctv.status==="idle"){
    status.textContent="點進頁面後讀取官方清單";
    root.innerHTML="";
    return;
  }
  if(state.cctv.status==="loading"){
    status.textContent="讀取官方攝影機清單中…";
    root.innerHTML='<div class="empty"><b>正在連線官方資料</b><p>若官方來源無回應，仍可使用下方 1968／幸福公路入口。</p></div>';
    return;
  }
  if(state.cctv.status!=="ready"){
    status.textContent="官方清單暫時無法讀取";
    root.innerHTML='<div class="empty"><b>目前無法載入站內攝影機清單</b><p>沒有顯示假影像；請使用下方官方入口直接查看。</p></div>';
    return;
  }

  const all=state.cctv.items||[];
  const matched=all.filter(x=>
    (state.cctvRoad==="all"||x.roadNo===state.cctvRoad)&&
    (!q||[x.road,x.direction,x.mile,x.start,x.end,x.id].join(" ").toLowerCase().includes(q))
  );
  status.textContent=state.cctv.source+" · "+all.length+" 支";
  const rows=matched.slice(0,50);
  root.innerHTML=rows.length?rows.map(x=>{
    const title=[x.road,x.mile].filter(Boolean).join(" · ")||("攝影機 "+x.id);
    const detail=[x.direction,x.start&&x.end?(x.start+" → "+x.end):(x.start||x.end)].filter(Boolean).join(" · ");
    const mapOk=Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Math.abs(x.lat)<=90&&Math.abs(x.lon)<=180;
    return '<article class="cctv-card">'+
      '<div class="cctv-card-head"><div><h3>'+esc(title)+'</h3><p>'+esc(detail||x.id)+'</p></div><span class="route-tag">'+esc(x.roadNo?("國 "+x.roadNo):"國道")+'</span></div>'+
      '<div class="item-actions"><button class="go" data-cctv-stream="'+encodeURIComponent(x.stream)+'">觀看即時影像</button>'+
      (mapOk?'<button data-cctv-map="'+x.lat+','+x.lon+'">地圖</button>':"")+'</div>'+
    '</article>';
  }).join(""):'<div class="empty"><b>沒有符合的攝影機</b><p>換一條國道或搜尋里程、路段名稱。</p></div>';

  if(matched.length>50)root.insertAdjacentHTML("beforeend",'<p class="cctv-more">符合 '+matched.length+' 支，目前先顯示前 50 支；可用搜尋縮小範圍。</p>');
  $$("[data-cctv-stream]",root).forEach(b=>b.onclick=()=>window.open(decodeURIComponent(b.dataset.cctvStream),"_blank","noopener"));
  $$("[data-cctv-map]",root).forEach(b=>b.onclick=()=>{
    const [lat,lon]=b.dataset.cctvMap.split(",");
    window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(lat+","+lon),"_blank","noopener");
  });
}

function parseSectionJson(data){
  const rows=findObjects(data,x=>Boolean(x&&x.SectionID&&(x.SectionName||x.RoadName||x.Start||x.End)));
  const map=new Map();
  rows.forEach(x=>{
    const id=String(x.SectionID);
    if(map.has(id))return;
    const start=String(x.Start||"");
    const end=String(x.End||"");
    const name=String(x.SectionName||([start,end].filter(Boolean).join(" → "))||id);
    const roadName=String(x.RoadName||"");
    map.set(id,{id,name,road:roadNo(roadName+" "+name),roadName,direction:String(x.RoadDirection||""),start,end});
  });
  return map;
}

function parseLiveJson(data,sections){
  const rows=findObjects(data,x=>Boolean(x&&x.SectionID&&(x.TravelSpeed!==undefined||x.DataCollectTime)));
  return normalizeTrafficRows(rows,sections);
}

function normalizeTrafficRows(rows,sections){
  const highways={1:[],2:[],3:[],4:[],5:[],6:[]};
  let newest="";
  rows.forEach(x=>{
    const id=String(x.SectionID||"");
    const sec=sections.get(id)||{};
    let speed=Number(x.TravelSpeed);
    if(speed===250||!Number.isFinite(speed))speed=-1;
    const rn=String(sec.road||roadNo(sec.roadName+" "+sec.name)||"");
    if(!highways[rn])return;
    const collect=String(x.DataCollectTime||"");
    if(collect>newest)newest=collect;
    highways[rn].push({
      id,
      name:sec.name||id,
      direction:sec.direction||"",
      speed,
      level:x.CongestionLevel!==undefined?congestionLabel(Number(x.CongestionLevel)):speedLevel(speed),
      dataCollectTime:collect
    });
  });
  const total=Object.values(highways).reduce((sum,rows)=>sum+rows.length,0);
  if(!total)throw new Error("No freeway live rows");
  return {status:"live",updatedAt:newest||new Date().toISOString(),source:"使用者端官方即時資料",highways};
}

function speedLevel(speed){
  if(speed<0)return "異常";
  if(speed>=80)return "順暢";
  if(speed>=60)return "車較多";
  if(speed>=40)return "車多";
  if(speed>=20)return "較壅塞";
  return "壅塞";
}
function congestionLabel(level){
  const labels={0:"順暢",1:"車較多",2:"車多",3:"較壅塞",4:"壅塞",5:"壅塞"};
  return labels[level]||"路況";
}

function parseSectionXml(text){
  const rows=xmlObjects(text,"SectionID","RoadName");
  const map=new Map();
  rows.forEach(node=>{
    const id=childText(node,"SectionID");
    const start=childText(node,"Start");
    const end=childText(node,"End");
    const name=childText(node,"SectionName")||[start,end].filter(Boolean).join(" → ")||id;
    const roadName=childText(node,"RoadName");
    map.set(id,{id,name,road:roadNo(roadName+" "+name),roadName,direction:childText(node,"RoadDirection"),start,end});
  });
  return map;
}

function parseLiveXml(text,sections){
  const rows=xmlObjects(text,"SectionID","TravelSpeed").map(node=>({
    SectionID:childText(node,"SectionID"),
    TravelSpeed:childText(node,"TravelSpeed"),
    CongestionLevel:childText(node,"CongestionLevel"),
    DataCollectTime:childText(node,"DataCollectTime")
  }));
  return normalizeTrafficRows(rows,sections);
}

function buildTunnelFromTraffic(traffic){
  const tunnel={status:"live",updatedAt:traffic.updatedAt,source:traffic.source,south:[],north:[]};
  (traffic.highways?.["5"]||traffic.highways?.[5]||[]).forEach(row=>{
    const text=String(row.name||"");
    if(!["坪林","頭城","雪山","石碇"].some(k=>text.includes(k)))return;
    const item={name:row.name,speed:row.speed,note:"國 5 即時路段速度",dataCollectTime:row.dataCollectTime};
    const d=String(row.direction||"").toUpperCase();
    if(d.includes("S")||d.includes("南"))tunnel.south.push(item);
    else if(d.includes("N")||d.includes("北"))tunnel.north.push(item);
  });
  return tunnel;
}

async function ensureClientTraffic(){
  if(state.traffic?.status==="live"||state.trafficFallbackStatus==="loading")return;
  if(state.trafficFallbackStatus==="failed"&&Date.now()-state.trafficFallbackAt<60000)return;
  state.trafficFallbackStatus="loading";
  state.trafficFallbackAt=Date.now();

  try{
    const cached=JSON.parse(sessionStorage.getItem("cola-go-traffic-client-v1")||"null");
    if(cached&&Date.now()-cached.savedAt<120000&&cached.traffic?.status==="live"){
      state.traffic=cached.traffic;
      state.tunnel=cached.tunnel||buildTunnelFromTraffic(cached.traffic);
      state.trafficFallbackStatus="done";
      renderAll();
      return;
    }
  }catch{}

  let traffic=null;
  try{
    const [sectionResponse,liveResponse]=await Promise.all([
      fetchWithTimeout(TDX_BASE+"/Section/Freeway?%24format=JSON",{headers:{Accept:"application/json"}},7000),
      fetchWithTimeout(TDX_BASE+"/Live/Freeway?%24format=JSON",{headers:{Accept:"application/json"}},7000)
    ]);
    const sections=parseSectionJson(await sectionResponse.json());
    traffic=parseLiveJson(await liveResponse.json(),sections);
    traffic.source="TDX／交通部高速公路局即時資料";
  }catch{}

  if(!traffic){
    try{
      const [sectionResponse,liveResponse]=await Promise.all([
        fetchWithTimeout(TISV_BASE+"/Section.xml",{headers:{Accept:"application/xml,text/xml,*/*"}},7000),
        fetchWithTimeout(TISV_BASE+"/LiveTraffic.xml",{headers:{Accept:"application/xml,text/xml,*/*"}},7000)
      ]);
      const sections=parseSectionXml(await sectionResponse.text());
      traffic=parseLiveXml(await liveResponse.text(),sections);
      traffic.source="交通部高速公路局即時資料";
    }catch{}
  }

  if(traffic){
    state.traffic=traffic;
    state.tunnel=buildTunnelFromTraffic(traffic);
    state.trafficFallbackStatus="done";
    try{sessionStorage.setItem("cola-go-traffic-client-v1",JSON.stringify({savedAt:Date.now(),traffic:state.traffic,tunnel:state.tunnel}));}catch{}
    renderAll();
  }else{
    state.trafficFallbackStatus="failed";
    renderTraffic();
    renderTunnel();
  }
}

function openCCTVForRoad(road){
  state.cctvRoad=String(road||"all");
  $$("#cctvRoadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.cctvRoad===state.cctvRoad));
  show("cctv");
  renderCCTV();
}

function renderTraffic(){
  const root=$("#highwayList");
  if(!root)return;

  const rows=state.traffic?.highways?.[state.highway]||[];
  const official=
    '<div class="item-actions">'+
      '<button class="go" data-official="https://1968.freeway.gov.tw/">1968 即時路況／CCTV</button>'+
      '<button data-open-cctv>影像入口</button>'+
    '</div>';

  const list=rows.length?rows.map(x=>
    '<article class="metric-row">'+
      '<div><b>'+esc(x.name)+'</b><small>'+esc(x.direction||"")+(x.level?" · "+esc(x.level):"")+'</small></div>'+
      '<div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div>'+
    '</article>'
  ).join(""):'<div class="empty"><b>國 '+state.highway+' 自動同步目前沒有資料</b><p>不顯示假數字；可直接開高公局 1968 查看官方即時路況。</p></div>';

  root.innerHTML=list+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>openCCTVForRoad(state.highway));
}

function renderTunnel(){
  const root=$("#tunnelList");
  if(!root)return;

  const rows=state.tunnel?.[state.direction]||[];
  const official=
    '<div class="item-actions">'+
      '<button class="go" data-official="https://1968.freeway.gov.tw/">1968 國 5 即時路況</button>'+
      '<button data-open-cctv>即時影像</button>'+
    '</div>';

  const list=rows.length?rows.map(x=>
    '<article class="metric-row">'+
      '<div><b>'+esc(x.name)+'</b><small>'+esc(x.note||"國 5 即時路段")+'</small></div>'+
      '<div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div>'+
    '</article>'
  ).join(""):'<div class="empty"><b>雪隧自動同步目前沒有資料</b><p>直接開 1968 可查看國 5 即時影像與路況。</p></div>';

  root.innerHTML=list+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>openCCTVForRoad("5"));
}

function renderMarket(){
  const used=state.market?.usedCars||[];
  const accessories=state.market?.accessories||[];
  const services=state.market?.services||[];

  if($("#usedCount"))$("#usedCount").textContent=used.length;
  if($("#accessoryCount"))$("#accessoryCount").textContent=accessories.length;
  if($("#serviceCount"))$("#serviceCount").textContent=services.length;

  const usedRoot=$("#usedCarsList");
  if(usedRoot){
    const rows=used.filter(x=>
      state.usedFilter==="all" ||
      x.model===state.usedFilter ||
      (state.usedFilter==="other"&&!["Model 3","Model Y"].includes(x.model))
    );

    if(rows.length){
      usedRoot.innerHTML=rows.map(x=>
        '<article class="market-card">'+
          '<h3>'+esc(x.title||x.model)+'</h3>'+
          '<div class="meta">'+esc(x.year||"")+' · '+esc(x.mileage||"")+' km</div>'+
          '<div class="price">$'+money(x.price)+'</div>'+
        '</article>'
      ).join("");
    }else{
      usedRoot.innerHTML=
        '<div class="market-empty">'+
          '<b>目前 0 筆公開車輛</b>'+
          '<p>不放假車、不複製別人的庫存。第一批刊登開放中，車主與車商都可免費送件。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=sell-vehicle.yml">成為第一批刊登</button>'+
        '</div>';
    }
  }

  const accessoryRoot=$("#accessoryList");
  if(accessoryRoot){
    if(accessories.length){
      accessoryRoot.innerHTML=accessories.map(x=>
        '<article class="market-card"><h3>'+esc(x.title)+'</h3><div class="price">$'+money(x.price)+'</div></article>'
      ).join("");
    }else{
      accessoryRoot.innerHTML=
        '<div class="market-empty">'+
          '<b>目前 0 筆二手配件</b>'+
          '<p>免費刊登已開放，不收刊登費、不收成交佣金。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=accessory.yml">刊登第一件配件</button>'+
        '</div>';
    }
  }

  const serviceRoot=$("#serviceList");
  if(serviceRoot){
    if(services.length){
      serviceRoot.innerHTML=services.map(x=>
        '<article class="market-card"><h3>'+esc(x.name)+'</h3><div class="meta">'+esc(x.category||"")+'</div></article>'
      ).join("");
    }else{
      serviceRoot.innerHTML=
        '<div class="market-empty">'+
          '<b>合作服務招募中</b>'+
          '<p>先審核合作內容與對車主的實用性，再公開上架。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=service.yml">申請合作服務</button>'+
        '</div>';
    }
  }

  bindExternal(document);
}

function renderModels(){
  const root=$("#modelList");
  if(!root)return;

  const rows=state.models.filter(x=>state.modelFilter==="all"||x.family===state.modelFilter);

  root.innerHTML=rows.map(x=>{
    const selected=state.compare.includes(x.id);
    return '<article class="model-card">'+
      '<div class="model-top">'+
        '<div><h3>'+esc(x.name)+'</h3><small>'+esc(x.year)+' · '+esc(x.drive)+' · '+esc(x.origin)+'</small></div>'+
        '<div class="model-price">'+(x.price?'$'+money(x.price):'官方價待確認')+'</div>'+
      '</div>'+
      '<div class="model-specs">'+
        '<div><small>續航</small><b>'+(x.range?x.range+' km':'—')+'</b></div>'+
        '<div><small>0-100</small><b>'+(x.accel?x.accel+' s':'—')+'</b></div>'+
        '<div><small>驅動</small><b>'+esc(x.drive||"—")+'</b></div>'+
        '<div><small>快充</small><b>'+(x.supercharge?x.supercharge+' kW':'—')+'</b></div>'+
      '</div>'+
      '<div class="model-actions">'+
        '<button data-compare="'+esc(x.id)+'" class="'+(selected?'selected':'')+'">'+(selected?'已加入比較':'加入比較')+'</button>'+
        '<button data-url="'+esc(x.source)+'">官方來源</button>'+
      '</div>'+
    '</article>';
  }).join("");

  $$("[data-compare]",root).forEach(b=>b.onclick=()=>toggleCompare(b.dataset.compare));
  bindExternal(root);
  updateCompareTray();
}

function toggleCompare(id){
  const index=state.compare.indexOf(id);
  if(index>=0){
    state.compare.splice(index,1);
  }else if(state.compare.length<3){
    state.compare.push(id);
  }else{
    toast("最多比較 3 款");
    return;
  }
  renderModels();
}

function updateCompareTray(){
  const tray=$("#compareTray");
  if(!tray)return;
  tray.hidden=state.compare.length<2;
  $("#compareCount").textContent=state.compare.length+" / 3";
}

function openCompare(){
  const rows=state.compare.map(id=>state.models.find(x=>x.id===id)).filter(Boolean);
  if(rows.length<2)return toast("至少選 2 款");

  const fields=[
    ["價格",x=>x.price?"$"+money(x.price):"—"],
    ["續航",x=>x.range?x.range+" km "+(x.rangeStandard||""):"—"],
    ["0-100",x=>x.accel?x.accel+" 秒":"—"],
    ["驅動",x=>x.drive||"—"],
    ["最高時速",x=>x.topSpeed?x.topSpeed+" km/h":"—"],
    ["超充上限",x=>x.supercharge?x.supercharge+" kW":"—"],
    ["座位",x=>x.seats?x.seats+" 人":"—"]
  ];

  $("#compareResult").innerHTML=
    '<div class="compare-table"><table>'+
      '<thead><tr><th>項目</th>'+rows.map(x=>'<th>'+esc(x.name)+'</th>').join("")+'</tr></thead>'+
      '<tbody>'+fields.map(field=>
        '<tr><td>'+field[0]+'</td>'+rows.map(x=>'<td>'+esc(field[1](x))+'</td>').join("")+'</tr>'
      ).join("")+'</tbody>'+
    '</table></div>'+
    '<p class="compare-source">價格與規格會變動，購車前請再開「官方來源」確認 Tesla 台灣最新資訊。</p>';

  $("#compareResult").scrollIntoView({behavior:"smooth",block:"start"});
}


function renderLocations(){
  const root=$("#teslaLocationList");
  if(!root)return;
  const rows=state.locations?.services||[];
  $("#locationCount").textContent=rows.length+" 個";
  root.innerHTML=rows.map(x=>
    '<article class="location-card">'+
      '<h3>'+esc(x.name)+'</h3>'+
      '<span class="area">'+esc(x.area)+'</span>'+
      '<p>'+esc(x.address)+'</p>'+
      '<div class="location-actions">'+
        '<button data-location-map="'+encodeURIComponent(x.address)+'">Google Maps</button>'+
        '<button data-location-apple="'+encodeURIComponent(x.address)+'">Apple 地圖</button>'+
      '</div>'+
    '</article>'
  ).join("");
  $$("[data-location-map]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.locationMap,"_blank","noopener"));
  $$("[data-location-apple]",root).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.locationApple,"_blank","noopener"));
}
function renderCommunity(){
  const communities=state.community?.communities||[];
  const events=state.community?.events||[];
  if($("#communityCount"))$("#communityCount").textContent=communities.length;
  if($("#eventCount"))$("#eventCount").textContent=events.length;

  const root=$("#communityList");
  if(root){
    const rows=communities.filter(x=>state.communityFilter==="all"||x.category===state.communityFilter);
    root.innerHTML=rows.length?rows.map(x=>
      '<article class="community-card"><h3>'+esc(x.name)+'</h3><div class="badges"><span>'+esc(x.platform||"")+'</span><span>'+esc(x.region||"全台")+'</span></div><p>'+esc(x.description||"")+'</p><button class="external-btn" data-url="'+esc(x.url)+'">加入／查看<svg><use href="#i-external"/></svg></button></article>'
    ).join(""):'<div class="market-empty"><b>目前 0 個通過審核的公開社群</b><p>不冒用別人的 LINE 群或社團。主理人可以免費登錄，審核後才公開。</p><button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=community.yml">登錄第一個社群</button></div>';
  }

  const eventRoot=$("#eventList");
  if(eventRoot){
    eventRoot.innerHTML=events.length?events.map(x=>
      '<article class="community-card"><h3>'+esc(x.name)+'</h3><div class="badges"><span>'+esc(x.date||"")+'</span><span>'+esc(x.area||"")+'</span></div><p>'+esc(x.description||"")+'</p><button class="external-btn" data-url="'+esc(x.url)+'">活動詳情<svg><use href="#i-external"/></svg></button></article>'
    ).join(""):'<div class="market-empty"><b>目前 0 個公開車主活動</b><p>車聚、露營、講座、交車活動都能免費提交；日期過期後不繼續冒充「近期活動」。</p><button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=event.yml">提交第一個活動</button></div>';
  }
  bindExternal(document);
}
function bindCommunity(){
  $$("[data-community-filter]").forEach(b=>b.onclick=()=>{
    $$("[data-community-filter]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.communityFilter=b.dataset.communityFilter;
    renderCommunity();
  });
}

function bindChargingTools(){
  loadChargingFavorites();

  const bindSelect=(id,key,transform=v=>v)=>{
    const el=$("#"+id);
    if(!el)return;
    el.onchange=()=>{state[key]=transform(el.value);renderCharging();};
  };
  bindSelect("chargingDirection","chargingDirection");
  bindSelect("chargingConnector","chargingConnector");
  bindSelect("chargingPower","chargingPower",Number);
  bindSelect("chargingOperator","chargingOperator");

  $("#chargingFavoritesOnly")?.addEventListener("click",()=>{
    state.chargingFavoritesOnly=!state.chargingFavoritesOnly;
    renderCharging();
  });

  $("#resetChargingFilters")?.addEventListener("click",()=>{
    state.road="all";
    state.chargingDirection="all";
    state.chargingConnector="all";
    state.chargingPower=0;
    state.chargingOperator="all";
    state.chargingFavoritesOnly=false;
    $$("#roadFilter button").forEach((b,i)=>b.classList.toggle("active",i===0));
    if($("#chargingDirection"))$("#chargingDirection").value="all";
    if($("#chargingConnector"))$("#chargingConnector").value="all";
    if($("#chargingPower"))$("#chargingPower").value="0";
    if($("#chargingOperator"))$("#chargingOperator").value="all";
    if($("#chargingSearch"))$("#chargingSearch").value="";
    renderCharging();
  });

  $("#nearbyGoogle")?.addEventListener("click",()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("電動車充電站"),"_blank","noopener"));
  $("#nearbyApple")?.addEventListener("click",()=>window.open("https://maps.apple.com/?q="+encodeURIComponent("電動車充電站"),"_blank","noopener"));
}

function bindFilters(){
  $$("#roadFilter button").forEach(b=>b.onclick=()=>{
    $$("#roadFilter button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.road=b.dataset.road;
    renderCharging();
  });

  if($("#chargingSearch"))$("#chargingSearch").oninput=renderCharging;
  if($("#parkingSearch"))$("#parkingSearch").oninput=renderParking;
  if($("#cctvSearch"))$("#cctvSearch").oninput=renderCCTV;
  $$("#cctvRoadFilter button").forEach(b=>b.onclick=()=>{
    $$("#cctvRoadFilter button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.cctvRoad=b.dataset.cctvRoad;
    renderCCTV();
  });

  $$("#highwayTabs button").forEach(b=>b.onclick=()=>{
    $$("#highwayTabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.highway=b.dataset.highway;
    renderTraffic();
  });

  $$("#tunnelDirection button").forEach(b=>b.onclick=()=>{
    $$("#tunnelDirection button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.direction=b.dataset.direction;
    renderTunnel();
  });
}

function bindMarket(){
  $$("[data-used-filter]").forEach(b=>b.onclick=()=>{
    $$("[data-used-filter]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.usedFilter=b.dataset.usedFilter;
    renderMarket();
  });

  $$("#modelFilter button").forEach(b=>b.onclick=()=>{
    $$("#modelFilter button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.modelFilter=b.dataset.modelFilter;
    renderModels();
  });

  $("#clearCompare")?.addEventListener("click",()=>{
    state.compare=[];
    $("#compareResult").innerHTML="";
    renderModels();
  });

  $("#openCompare")?.addEventListener("click",openCompare);
}

const PLACE_ORDER=[
  ["基隆",0],["台北",1],["臺北",1],["新北",1],["桃園",2],["新竹",3],["苗栗",4],
  ["台中",5],["臺中",5],["彰化",6],["雲林",7],["嘉義",8],["台南",9],["臺南",9],["高雄",10],["屏東",11]
];

function placeRank(value){
  const text=String(value||"");
  for(const [name,rank] of PLACE_ORDER){
    if(text.includes(name))return rank;
  }
  return null;
}
function tripDirection(from,to){
  const a=placeRank(from),b=placeRank(to);
  if(a==null||b==null||a===b)return "all";
  return b<a?"north":"south";
}
function tripDirectionLabel(direction){
  return direction==="north"?"北上":direction==="south"?"南下":"雙向";
}
function inferTripCorridor(from,to){
  const text=(from+" "+to);
  if(/宜蘭|羅東|礁溪|頭城|花蓮/.test(text))return "5";
  if(/埔里|日月潭/.test(text))return "6";
  if(/南投/.test(to)&&!/台北|臺北|新北|桃園/.test(from))return "3";
  const a=placeRank(from),b=placeRank(to);
  if(a!=null||b!=null)return "1";
  return "1";
}
function tripChargingRows(corridor,direction){
  return state.charging.filter(x=>x.road===corridor).filter(x=>{
    if(direction==="all")return true;
    const d=String(x.direction||"");
    if(d.includes("雙向"))return true;
    return direction==="north"?d.includes("北"):d.includes("南");
  });
}
function saveRecentTrip(from,to,corridor){
  const row={from,to,corridor,ts:Date.now()};
  const current=state.recentTrips.filter(x=>!(x.from===from&&x.to===to));
  state.recentTrips=[row,...current].slice(0,5);
  try{localStorage.setItem("cola-go-recent-trips",JSON.stringify(state.recentTrips));}catch{}
  renderRecentTrips();
}
function loadRecentTrips(){
  try{
    const rows=JSON.parse(localStorage.getItem("cola-go-recent-trips")||"[]");
    state.recentTrips=Array.isArray(rows)?rows.slice(0,5):[];
  }catch{state.recentTrips=[];}
}
function renderRecentTrips(){
  const root=$("#recentTrips");
  if(!root)return;
  root.innerHTML=state.recentTrips.length?state.recentTrips.map(x=>
    '<button data-recent-from="'+esc(x.from)+'" data-recent-to="'+esc(x.to)+'" data-recent-road="'+esc(x.corridor||"auto")+'"><span><b>'+esc(x.from)+' → '+esc(x.to)+'</b><small>'+(x.corridor&&x.corridor!=="auto"?'國 '+esc(x.corridor):'自動建議')+'</small></span><svg><use href="#i-arrow"/></svg></button>'
  ).join(""):'<div class="empty compact-empty"><b>還沒有最近路線</b><p>整理一次行程後會保存在這台裝置。</p></div>';

  $$("[data-recent-from]",root).forEach(b=>b.onclick=()=>{
    $("#tripFrom").value=b.dataset.recentFrom;
    $("#tripTo").value=b.dataset.recentTo;
    $("#tripCorridor").value=b.dataset.recentRoad||"auto";
    planTrip();
  });
}
function setHighwayView(road){
  state.highway=String(road);
  $$("#highwayTabs button").forEach(b=>b.classList.toggle("active",b.dataset.highway===state.highway));
  show("highway");
  renderTraffic();
}
function setChargingTripView(road,direction){
  state.road=String(road);
  state.chargingDirection=direction;
  $$("#roadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.road===state.road));
  if($("#chargingDirection"))$("#chargingDirection").value=direction;
  show("charging");
  renderCharging();
}
function destinationParking(to,provider){
  const query="停車場 "+to;
  const url=provider==="apple"
    ?"https://maps.apple.com/?q="+encodeURIComponent(query)
    :"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(query);
  window.open(url,"_blank","noopener");
}
function planTrip(){
  const from=$("#tripFrom").value.trim()||"目前位置";
  const to=$("#tripTo").value.trim();
  if(!to)return toast("請先輸入目的地");

  const selected=$("#tripCorridor")?.value||"auto";
  const corridor=selected==="auto"?inferTripCorridor(from,to):selected;
  const direction=tripDirection(from,to);
  const chargers=tripChargingRows(corridor,direction);
  const speeds=state.traffic?.highways?.[corridor]||[];
  const highwayAvg=avg(speeds);
  const needsTunnel=corridor==="5"||/宜蘭|羅東|礁溪|頭城|花蓮/.test(from+" "+to);

  const routeNote=selected==="auto"
    ?"依起終點做「行前關注」建議，不代表導航一定走國 "+corridor+"。"
    :"你指定關注國 "+corridor+"；實際導航路線仍以地圖 App 為準。";

  $("#tripResult").innerHTML=
    '<article class="trip-plan">'+
      '<div class="trip-plan-head"><div><span class="mini-label">TRIP BRIEF</span><h2>'+esc(from)+' → '+esc(to)+'</h2></div><span class="route-tag">國 '+esc(corridor)+' · '+tripDirectionLabel(direction)+'</span></div>'+
      '<div class="trip-metrics">'+
        '<div><small>國道路況</small><b>'+(highwayAvg?highwayAvg+' km/h':'官方入口')+'</b></div>'+
        '<div><small>沿途充電</small><b>'+chargers.length+' 處</b></div>'+
        '<div><small>雪隧</small><b>'+(needsTunnel?'要看':'非重點')+'</b></div>'+
      '</div>'+
      '<p class="trip-note">'+esc(routeNote)+'</p>'+
      '<div class="item-actions trip-nav-actions"><button class="go" data-map="google">Google Maps</button><button data-map="apple">Apple 地圖</button></div>'+
      '<div class="trip-tools">'+
        '<button data-trip-tool="highway"><span><b>國道路況</b><small>國 '+esc(corridor)+'</small></span><svg><use href="#i-arrow"/></svg></button>'+
        '<button data-trip-tool="charging"><span><b>沿途充電</b><small>'+chargers.length+' 處服務區</small></span><svg><use href="#i-arrow"/></svg></button>'+
        '<button data-trip-tool="cctv"><span><b>即時影像</b><small>國 '+esc(corridor)+' CCTV</small></span><svg><use href="#i-arrow"/></svg></button>'+
        (needsTunnel?'<button data-trip-tool="tunnel"><span><b>雪隧</b><small>國 5 南北向</small></span><svg><use href="#i-arrow"/></svg></button>':'')+
        '<button data-trip-tool="parking-google"><span><b>目的地停車</b><small>Google Maps</small></span><svg><use href="#i-external"/></svg></button>'+
        '<button data-trip-tool="parking-apple"><span><b>目的地停車</b><small>Apple 地圖</small></span><svg><use href="#i-external"/></svg></button>'+
      '</div>'+
    '</article>';

  $$("[data-map]",$("#tripResult")).forEach(b=>b.onclick=()=>{
    let url;
    if(b.dataset.map==="apple"){
      const start=from==="目前位置"?"":"&saddr="+encodeURIComponent(from);
      url="https://maps.apple.com/?daddr="+encodeURIComponent(to)+"&dirflg=d"+start;
    }else{
      const origin=from==="目前位置"?"":"&origin="+encodeURIComponent(from);
      url="https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(to)+"&travelmode=driving"+origin;
    }
    window.open(url,"_blank","noopener");
  });

  $$("[data-trip-tool]",$("#tripResult")).forEach(b=>b.onclick=()=>{
    const tool=b.dataset.tripTool;
    if(tool==="highway")return setHighwayView(corridor);
    if(tool==="charging")return setChargingTripView(corridor,direction);
    if(tool==="cctv")return openCCTVForRoad(corridor);
    if(tool==="tunnel")return show("tunnel");
    if(tool==="parking-google")return destinationParking(to,"google");
    if(tool==="parking-apple")return destinationParking(to,"apple");
  });

  saveRecentTrip(from,to,corridor);
}
function fillRoute(from,to){
  $("#tripFrom").value=from;
  $("#tripTo").value=to;
  show("trip");
}
function bindTrip(){
  loadRecentTrips();
  renderRecentTrips();

  $$("[data-route]").forEach(b=>b.onclick=()=>{
    const parts=b.dataset.route.split("|");
    $("#tripFrom").value=parts[0];
    $("#tripTo").value=parts[1];
  });

  $$("[data-fill-route]").forEach(b=>b.onclick=()=>{
    const parts=b.dataset.fillRoute.split("|");
    fillRoute(parts[0],parts[1]);
  });

  $("#planTripBtn").onclick=planTrip;
  $("#clearRecentTrips")?.addEventListener("click",()=>{
    state.recentTrips=[];
    try{localStorage.removeItem("cola-go-recent-trips");}catch{}
    renderRecentTrips();
  });
}

const VIN_WMI={"5YJ":"美國 Tesla","7SA":"美國 Tesla","LRW":"中國上海 Giga Shanghai","XP7":"德國柏林 Giga Berlin","SFZ":"英國（初代 Roadster）","7G2":"美國 Tesla"};
const VIN_MODEL={"3":"Model 3","S":"Model S","X":"Model X","Y":"Model Y","R":"Roadster","C":"Cybertruck","T":"Semi","A":"Cybercab"};
const VIN_YEAR={"8":"2008","9":"2009","A":"2010","B":"2011","C":"2012","D":"2013","E":"2014","F":"2015","G":"2016","H":"2017","J":"2018","K":"2019","L":"2020","M":"2021","N":"2022","P":"2023","R":"2024","S":"2025","T":"2026","V":"2027","W":"2028","X":"2029","Y":"2030"};
const VIN_PLANT={"F":"Fremont","C":"Giga Shanghai","A":"Giga Texas","B":"Giga Berlin","N":"Giga Nevada","1":"Lotus / Hethel"};
const VIN_BATTERY={"E":"純電／部分車型三元鋰","F":"LFP（部分上海車型）"};
const VIN_DRIVE={"5":"雙馬達","6":"三馬達","A":"單馬達","B":"雙馬達","C":"雙馬達性能版","D":"單馬達","E":"雙馬達","F":"雙馬達性能版","J":"單馬達","K":"雙馬達","L":"雙馬達性能版","R":"單馬達","S":"單馬達"};

function bindVin(){
  const btn=$("#decodeVinBtn");
  if(!btn)return;

  btn.onclick=()=>{
    const vin=$("#vinInput").value.trim().toUpperCase().replace(/\s/g,"");
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){
      $("#vinResult").innerHTML='<div class="result-card"><h3>VIN 格式不正確</h3><div class="result-sub">請輸入 17 碼 VIN，VIN 不使用 I、O、Q。</div></div>';
      return;
    }

    const rows=[
      ["VIN",vin],
      ["出廠來源",VIN_WMI[vin.slice(0,3)]||"未收錄／請以官方資料為準"],
      ["車型",VIN_MODEL[vin[3]]||"未辨識"],
      ["電池／燃料碼",VIN_BATTERY[vin[6]]||vin[6]],
      ["驅動碼",VIN_DRIVE[vin[7]]||vin[7]],
      ["年份",VIN_YEAR[vin[9]]||vin[9]],
      ["組裝廠",VIN_PLANT[vin[10]]||vin[10]]
    ];

    $("#vinResult").innerHTML=
      '<div class="result-card"><h3>解析結果</h3>'+
      rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><b>'+esc(r[1])+'</b></div>').join("")+
      '</div>';
  };
}

function runCalc(){
  const km=Number($("#calcKm")?.value);
  const electricity=Number($("#calcElec")?.value);
  const efficiency=Number($("#calcEff")?.value);
  const fuelPrice=Number($("#calcFuel")?.value);
  const fuelEfficiency=Number($("#calcFuelEff")?.value);

  if(!$("#calcResult"))return;
  if(![km,electricity,efficiency,fuelPrice,fuelEfficiency].every(v=>Number.isFinite(v)&&v>=0))return;
  if(efficiency<=0||fuelEfficiency<=0)return;

  const ev=km/efficiency*electricity;
  const fuel=km/fuelEfficiency*fuelPrice;
  const save=fuel-ev;

  $("#calcResult").innerHTML=
    '<h3>估算結果</h3>'+
    '<div class="calc-result-grid">'+
      '<div class="calc-stat"><small>每月電費</small><b>$'+money(ev)+'</b></div>'+
      '<div class="calc-stat"><small>每月油費</small><b>$'+money(fuel)+'</b></div>'+
      '<div class="calc-stat good"><small>每月差額</small><b>'+(save>=0?"+":"-")+'$'+money(Math.abs(save))+'</b></div>'+
      '<div class="calc-stat good"><small>五年差額</small><b>'+(save>=0?"+":"-")+'$'+money(Math.abs(save*60))+'</b></div>'+
    '</div>';
}

function bindCalculator(){
  const btn=$("#runCalcBtn");
  if(!btn)return;
  btn.onclick=runCalc;
  ["calcKm","calcElec","calcEff","calcFuel","calcFuelEff"].forEach(id=>$("#"+id)?.addEventListener("input",runCalc));
  runCalc();
}

const checklistItems=[
  "行照、車牌與 VIN 資料一致",
  "保險已生效",
  "鑰匙卡／鑰匙數量確認",
  "全車漆面無明顯刮痕、凹痕或色差",
  "前後與側窗玻璃無裂損",
  "玻璃車頂／天窗外觀正常",
  "四輪輪圈、輪胎無異常傷痕",
  "底盤可見處無脫落或明顯撞傷",
  "車內玻璃與飾板正常",
  "座椅、縫線與內裝無明顯損傷",
  "門窗膠條與開關正常",
  "螢幕、音響、冷氣與燈具可正常操作",
  "充電功能與隨車配件確認"
];

function renderChecklist(){
  const root=$("#deliveryChecklist");
  if(!root)return;

  let saved=[];
  try{
    saved=JSON.parse(localStorage.getItem("cola-go-delivery")||"[]");
  }catch{}

  root.innerHTML=checklistItems.map((item,i)=>
    '<label class="check-item '+(saved.includes(i)?"done":"")+'">'+
      '<input type="checkbox" data-check="'+i+'" '+(saved.includes(i)?"checked":"")+'>'+
      '<span>'+esc(item)+'</span>'+
    '</label>'
  ).join("");

  const update=()=>{
    const checked=$$("[data-check]",root).filter(x=>x.checked).map(x=>Number(x.dataset.check));
    localStorage.setItem("cola-go-delivery",JSON.stringify(checked));
    $("#checkProgress").textContent=checked.length+" / "+checklistItems.length;
    $$(".check-item",root).forEach((el,i)=>el.classList.toggle("done",checked.includes(i)));
  };

  $$("[data-check]",root).forEach(x=>x.onchange=update);
  update();
}

function bindChecklist(){
  renderChecklist();
  const btn=$("#resetChecklist");
  if(btn)btn.onclick=()=>{
    localStorage.removeItem("cola-go-delivery");
    renderChecklist();
  };
}

function bindParts(){
  const btn=$("#searchPartBtn");
  if(!btn)return;
  btn.onclick=()=>{
    const part=$("#partNo").value.trim();
    if(!part)return toast("先輸入料號");
    window.open("https://www.google.com/search?q="+encodeURIComponent("Tesla "+part),"_blank","noopener");
  };
}

const luckyGood=new Set([1,3,5,6,7,8,11,13,15,16,17,18,21,23,24,25,29,31,32,33,35]);
const luckyMixed=new Set([26,27,30]);

function bindLucky(){
  const btn=$("#luckyBtn");
  if(!btn)return;

  btn.onclick=()=>{
    const digits=($("#luckyInput").value.match(/\d/g)||[]).slice(-4);
    if(!digits.length)return toast("請輸入車牌數字");

    const sum=digits.reduce((s,x)=>s+Number(x),0);
    const type=luckyGood.has(sum)?"民俗對照常列為吉":luckyMixed.has(sum)?"民俗對照常列為吉凶參半":"民俗對照常列為凶";

    $("#luckyResult").innerHTML=
      '<div class="result-card">'+
        '<span class="mini-label">RESULT</span>'+
        '<div class="result-big">'+sum+'</div>'+
        '<b>'+type+'</b>'+
        '<div class="result-sub">數字來源：'+digits.join(" + ")+'</div>'+
      '</div>';
  };
}


function addYears(date,years){
  const d=new Date(date);
  d.setFullYear(d.getFullYear()+years);
  return d;
}
function fmtDate(date){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))return "—";
  return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
function warrantyRow(name,years,kmLimit,start,currentKm){
  const end=addYears(start,years);
  const now=new Date();
  now.setHours(0,0,0,0);
  const endDay=new Date(end);endDay.setHours(0,0,0,0);
  const dayLeft=Math.ceil((endDay-now)/86400000);
  const kmLeft=kmLimit==null?null:Math.max(0,kmLimit-currentKm);
  const timeExpired=dayLeft<0;
  const kmExpired=kmLimit!=null&&currentKm>=kmLimit;
  const expired=timeExpired||kmExpired;
  return {name,years,kmLimit,end,dayLeft,kmLeft,expired,timeExpired,kmExpired};
}
function renderWarrantyRow(row){
  const stateText=row.expired?"至少一項門檻已到":"換算仍在範圍";
  const stateClass=row.expired?"expired":"";
  const timeText=row.dayLeft>=0?Math.floor(row.dayLeft/30)+" 個月左右":"已超過 "+Math.abs(row.dayLeft)+" 天";
  const kmText=row.kmLimit==null?"不限里程":(row.kmExpired?"已達 "+money(row.kmLimit)+" km":"剩約 "+money(row.kmLeft)+" km");
  return '<article class="warranty-item"><div class="w-head"><h3>'+esc(row.name)+'</h3><span class="warranty-state '+stateClass+'">'+stateText+'</span></div><div class="warranty-meta"><div><small>日期門檻</small><b>'+fmtDate(row.end)+'</b><small>'+timeText+'</small></div><div><small>里程門檻</small><b>'+(row.kmLimit==null?"不限里程":money(row.kmLimit)+" km")+'</b><small>'+kmText+'</small></div></div></article>';
}
function bindWarranty(){
  const btn=$("#calcWarrantyBtn");
  if(!btn)return;
  btn.onclick=()=>{
    const key=$("#warrantyModel").value;
    const dateValue=$("#warrantyDate").value;
    const km=Number($("#warrantyKm").value);
    if(!dateValue)return toast("請先選交車日期");
    if(!Number.isFinite(km)||km<0)return toast("請輸入目前里程");
    const start=new Date(dateValue+"T00:00:00");
    if(Number.isNaN(start.getTime()))return toast("日期格式不正確");
    const batteryLimits={"y-rwd":160000,"3-lr":192000,"3-perf":192000,"y-lr":192000,"y-perf":192000,"sx":240000};
    const rows=[
      warrantyRow("基本車輛有限保固",4,80000,start,km),
      warrantyRow("SRS 安全氣囊系統",5,100000,start,km)
    ];
    if(batteryLimits[key]){
      rows.push(warrantyRow("電池與驅動單元",8,batteryLimits[key],start,km));
    }
    rows.push(warrantyRow("車體鏽蝕有限保固",12,null,start,km));
    const warning=key==="other"?'<div class="info-box"><b>電池／驅動保固未計入</b><p>你選了其他／不確定車型，因各版本里程門檻不同，COLA GO 不自行猜測。請開官方保固頁確認。</p></div>':"";
    $("#warrantyResult").innerHTML='<div class="warranty-list">'+rows.map(renderWarrantyRow).join("")+'</div>'+warning+'<p class="notice">判斷規則：年限或里程只要其中一個先到，就可能超出該項保固範圍；實際資格仍以 Tesla 車輛紀錄與條款為準。</p>';
  };
}
function connectorDecision(vehicle,charger){
  if(vehicle==="unknown"){
    return {type:"verify",badge:"先確認車端",title:"先確認你的充電口",text:"同一品牌、不同年份或市場可能使用不同接頭。先確認車端規格，再判斷是否能直接充電。"};
  }
  if(charger==="dc-ccs2"){
    if(vehicle==="tesla-ccs2"||vehicle==="ev-ccs2")return {type:"direct",badge:"可直接使用",title:"接頭直接相容",text:"車端與充電設備都是 CCS2。實際充電仍受站點、車輛通訊協定與營運商規則影響。"};
    if(vehicle==="tesla-nacs")return {type:"adapter",badge:"需要確認轉接",title:"不能直接插 CCS2",text:"NACS 車端使用 CCS2 充電設備通常需要相容轉接器，而且必須確認你的車款、年份與軟硬體是否支援。"};
    return {type:"no",badge:"不可直接使用",title:"接頭不同",text:"目前選擇的車端接頭不是 CCS2，不能把不同規格的 DC 接頭直接互插。"};
  }
  if(charger==="dc-ccs1"){
    if(vehicle==="ccs1")return {type:"direct",badge:"可直接使用",title:"CCS1 直接相容",text:"車端與設備同為 CCS1；實際啟動仍依營運商與車款通訊相容性。"};
    return {type:"no",badge:"不可直接使用",title:"DC 接頭不同",text:"CCS1 與 CCS2／NACS 不是可直接互插的相同接頭。若要轉接，必須使用車廠明確支援的 DC 轉接方案。"};
  }
  if(charger==="ac-type2"){
    if(vehicle==="tesla-ccs2"||vehicle==="ev-ccs2"||vehicle==="type2")return {type:"direct",badge:"通常可直接使用",title:"Type 2 AC 相容",text:"CCS2 車端的交流部分採 Type 2 介面，一般可使用 Type 2 AC 充電。仍請確認站點線材與車款規格。"};
    if(vehicle==="tesla-nacs"||vehicle==="j1772")return {type:"adapter",badge:"需要轉接／確認",title:"接頭不同",text:"可能需要對應 AC 轉接器；請使用車廠或充電產品明確支援的方案。"};
    return {type:"verify",badge:"需要確認",title:"請確認 AC 介面",text:"目前選擇不足以確認可直接使用。"};
  }
  if(charger==="ac-j1772"){
    if(vehicle==="j1772")return {type:"direct",badge:"可直接使用",title:"J1772 直接相容",text:"車端與設備同為 J1772 / Type 1 AC。"};
    if(vehicle==="tesla-nacs")return {type:"adapter",badge:"需要轉接",title:"需使用相容 J1772 轉接器",text:"Tesla 官方有 J1772 轉接器產品指南；仍要確認你的車輛與轉接器版本。"};
    return {type:"adapter",badge:"需要轉接／確認",title:"AC 接頭不同",text:"Type 2／CCS2 與 J1772 不是直接互插，需依車款使用正確 AC 轉接方案。"};
  }
  if(charger==="tesla-supercharger"){
    if(vehicle==="tesla-ccs2")return {type:"direct",badge:"Tesla 車主",title:"使用 Tesla 導航／App 確認站點",text:"台灣 Tesla 車輛可依車輛導航或 Tesla App 查看可使用的超級充電站；不同站點與充電座規格可能不同。"};
    if(vehicle==="ev-ccs2")return {type:"verify",badge:"部分站點可用",title:"先在 Tesla App 確認站點",text:"Tesla 已在台灣開放部分超級充電站給非 Tesla 電動車。是否可用要看該站點、車輛接頭／轉接支援與 Tesla App 顯示，不應只看外觀判定。"};
    if(vehicle==="tesla-nacs")return {type:"direct",badge:"依站點規格",title:"以 Tesla 導航／App 為準",text:"NACS Tesla 可使用相容的 Tesla 超級充電站；若遇到不同規格站點，請以車輛導航或 Tesla App 的可用站點為準。"};
    return {type:"verify",badge:"不能只看接頭判定",title:"先確認 Tesla App 與轉接支援",text:"非 Tesla 超充支援涉及站點類型、車端規格與車廠支援的 DC 轉接器。不要使用未經車廠支援的方式硬轉接。"};
  }
  return {type:"verify",badge:"需要確認",title:"目前無法直接判定",text:"請以車廠與充電設備營運商的相容資訊為準。"};
}
function bindConnector(){
  const btn=$("#checkConnectorBtn");
  if(!btn)return;
  btn.onclick=()=>{
    const result=connectorDecision($("#vehicleConnector").value,$("#chargerConnector").value);
    $("#connectorResult").innerHTML='<div class="compat-card"><span class="compat-badge '+result.type+'">'+esc(result.badge)+'</span><h3>'+esc(result.title)+'</h3><p>'+esc(result.text)+'</p><div class="compat-notes">安全原則：DC 快充轉接器必須確認車廠與設備明確支援；「物理上插得進去」不代表協定與安全條件相容。</div></div>';
  };
}

function bindInstall(){
  const installBtn=$("#installBtn");
  const standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||window.navigator.standalone===true;

  if(standalone&&installBtn){
    installBtn.hidden=true;
  }

  addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    state.installPrompt=e;
  });

  if(installBtn){
    installBtn.onclick=async()=>{
      if(state.installPrompt){
        try{
          state.installPrompt.prompt();
          await state.installPrompt.userChoice;
        }catch{}
        state.installPrompt=null;
        return;
      }

      const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
      if(ios){
        toast("加入主畫面：點瀏覽器「分享」→「加入主畫面」",3600);
      }else{
        toast("請使用瀏覽器選單的「安裝」或「新增至主畫面」",3200);
      }
    };
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

$("#refreshBtn").onclick=()=>{
  toast("重新整理");
  load();
};

bindNav();
bindExternal();
bindChargingTools();
bindParkingTools();
bindFilters();
bindMarket();
bindCommunity();
bindTrip();
bindVin();
bindCalculator();
bindChecklist();
bindParts();
bindLucky();
bindWarranty();
bindConnector();
bindInstall();
show(location.hash.slice(1)||"home",false);
load();
