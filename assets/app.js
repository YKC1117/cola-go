const state={
  view:"home",
  charging:[],
  traffic:null,
  tunnel:null,
  parking:null,
  parkingLive:{status:"not-synced",items:[]},
  parkingCity:"all",
  parkingRemote:{status:"idle",city:"",items:[],updatedAt:null,source:"",error:""},
  parkingRemoteLoading:false,
  parkingRemoteAttempts:{},
  models:[],
  market:{usedCars:[],accessories:[],services:[]},
  road:"all",
  chargingDirection:"all",
  chargingConnector:"all",
  chargingPower:0,
  chargingOperator:"all",
  chargingFavoritesOnly:false,
  chargingFavorites:[],
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
  if(!$$('.view').some(el=>el.dataset.view===view))view="home";
  state.view=view;
  $$(".view").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  $$(".bottom-nav button").forEach(el=>{
    const active=el.dataset.go===view;
    el.classList.toggle("active",active);
    if(active)el.setAttribute("aria-current","page"); else el.removeAttribute("aria-current");
  });
  window.scrollTo({top:0,behavior:"instant"});
  if(push)history.replaceState(null,"","#"+view);

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
    getJSON("./data/tesla-locations.json"),
    getJSON("./data/cctv.json")
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
  if(results[9].status==="fulfilled"&&Array.isArray(results[9].value?.items))state.cctv=results[9].value;

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


const TAIWAN_PARKING_CITIES=[{"code":"Taipei","name":"臺北市"},{"code":"NewTaipei","name":"新北市"},{"code":"Taoyuan","name":"桃園市"},{"code":"Taichung","name":"臺中市"},{"code":"Tainan","name":"臺南市"},{"code":"Kaohsiung","name":"高雄市"},{"code":"Keelung","name":"基隆市"},{"code":"Hsinchu","name":"新竹市"},{"code":"HsinchuCounty","name":"新竹縣"},{"code":"MiaoliCounty","name":"苗栗縣"},{"code":"ChanghuaCounty","name":"彰化縣"},{"code":"NantouCounty","name":"南投縣"},{"code":"YunlinCounty","name":"雲林縣"},{"code":"Chiayi","name":"嘉義市"},{"code":"ChiayiCounty","name":"嘉義縣"},{"code":"PingtungCounty","name":"屏東縣"},{"code":"YilanCounty","name":"宜蘭縣"},{"code":"HualienCounty","name":"花蓮縣"},{"code":"TaitungCounty","name":"臺東縣"},{"code":"PenghuCounty","name":"澎湖縣"},{"code":"KinmenCounty","name":"金門縣"},{"code":"LienchiangCounty","name":"連江縣"}];
const TDX_PARKING_BASE="https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/CarPark";

function parkingCityName(code){
  return TAIWAN_PARKING_CITIES.find(x=>x.code===code)?.name||"全台灣";
}

function parkingName(value){
  if(typeof value==="string")return value;
  return value?.Zh_tw||value?.ZhTw||value?.zh_tw||value?.En||"";
}

function normalizeParkingBasic(data,city){
  const rows=findObjects(data,x=>Boolean(x&&x.CarParkID&&x.CarParkName));
  const seen=new Set();
  return rows.map(x=>{
    const id=String(x.CarParkID||"");
    if(!id||seen.has(id))return null;
    seen.add(id);
    const position=x.CarParkPosition||x.Position||{};
    const lat=Number(position.PositionLat??x.PositionLat??x.Latitude);
    const lon=Number(position.PositionLon??x.PositionLon??x.Longitude);
    return {
      id,
      city,
      name:parkingName(x.CarParkName)||id,
      town:String(x.TownName||x.District||""),
      address:String(x.Address||x.CarParkAddress||""),
      description:String(x.Description||""),
      fare:String(x.FareDescription||x.FareDescriptionText||""),
      liveCapable:Boolean(x.LiveOccupancyAvailable??x.LiveOccuppancyAvailable),
      lat:Number.isFinite(lat)?lat:null,
      lon:Number.isFinite(lon)?lon:null,
      total:Number(x.TotalSpaces??x.NumberOfSpaces??0)||0,
      available:null,
      dataCollectTime:"",
      sourceType:"basic"
    };
  }).filter(Boolean);
}

function availabilityCarSpaces(x){
  let total=Number(x.TotalSpaces??0);
  let available=x.AvailableSpaces==null?null:Number(x.AvailableSpaces);
  const rows=Array.isArray(x.Availabilities)?x.Availabilities:[];
  const car=rows.find(v=>Number(v.SpaceType)===1)||rows[0];
  if(car){
    if(!total)total=Number(car.NumberOfSpaces??car.NumberOfSpace??0)||0;
    if(available==null||!Number.isFinite(available))available=Number(car.AvailableSpaces??car.AvailableSpace);
  }
  return {
    total:Number.isFinite(total)?total:0,
    available:Number.isFinite(available)?available:null
  };
}

function normalizeParkingAvailability(data){
  const rows=findObjects(data,x=>Boolean(x&&x.CarParkID&&(x.AvailableSpaces!==undefined||x.Availabilities||x.TotalSpaces!==undefined)));
  const map=new Map();
  rows.forEach(x=>{
    const id=String(x.CarParkID||"");
    if(!id)return;
    const spaces=availabilityCarSpaces(x);
    map.set(id,{
      id,
      name:parkingName(x.CarParkName),
      total:spaces.total,
      available:spaces.available,
      serviceStatus:x.ServiceStatus,
      fullStatus:x.FullStatus,
      dataCollectTime:String(x.DataCollectTime||x.UpdateTime||"")
    });
  });
  return map;
}

function mergeParkingRows(basic,availability){
  return basic.map(x=>{
    const live=availability.get(x.id);
    return live?{...x,total:live.total||x.total,available:live.available,dataCollectTime:live.dataCollectTime,sourceType:"live"}:x;
  });
}

async function fetchParkingEndpoint(path,timeout=7000){
  const candidates=[
    "https://tdx.transportdata.tw/api/basic/v1/"+path+"?%24format=JSON",
    "https://tdx.transportdata.tw/api/basic/v2/"+path+"?%24format=JSON"
  ];
  let lastError=null;
  for(const url of candidates){
    try{
      const response=await fetchWithTimeout(url,{headers:{Accept:"application/json"}},timeout);
      return await response.json();
    }catch(error){
      lastError=error;
    }
  }
  throw lastError||new Error("TDX parking unavailable");
}

async function ensureParkingCity(city){
  if(!city||city==="all"||city==="Tainan")return;
  if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===city)return;
  if(state.parkingRemoteLoading)return;

  const last=Number(state.parkingRemoteAttempts[city]||0);
  if(last&&Date.now()-last<60000&&state.parkingRemote.city===city&&state.parkingRemote.status==="unavailable")return;

  state.parkingRemoteAttempts[city]=Date.now();
  state.parkingRemoteLoading=true;
  state.parkingRemote={status:"loading",city,items:[],updatedAt:null,source:"TDX",error:""};
  renderParking();

  try{
    const cacheKey="cola-go-parking-"+city;
    try{
      const cached=JSON.parse(sessionStorage.getItem(cacheKey)||"null");
      if(cached&&Date.now()-cached.savedAt<15*60*1000&&Array.isArray(cached.items)&&cached.items.length){
        state.parkingRemote={status:"ready",city,items:cached.items,updatedAt:cached.updatedAt||null,source:"TDX 官方快取",error:""};
        state.parkingRemoteLoading=false;
        renderParking();
        return;
      }
    }catch{}

    const [basicResult,availabilityResult]=await Promise.allSettled([
      fetchParkingEndpoint("Parking/OffStreet/CarPark/City/"+encodeURIComponent(city)),
      fetchParkingEndpoint("Parking/OffStreet/CarPark/Availability/City/"+encodeURIComponent(city))
    ]);

    if(basicResult.status!=="fulfilled")throw basicResult.reason||new Error("TDX basic parking unavailable");
    const basic=normalizeParkingBasic(basicResult.value,city);
    if(!basic.length)throw new Error("TDX returned no parking lots");
    const availability=availabilityResult.status==="fulfilled"?normalizeParkingAvailability(availabilityResult.value):new Map();
    const items=mergeParkingRows(basic,availability);
    const times=items.map(x=>x.dataCollectTime).filter(Boolean).sort();
    const updatedAt=times.at(-1)||null;
    state.parkingRemote={status:"ready",city,items,updatedAt,source:"TDX／交通部",error:""};
    try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),updatedAt,items}));}catch{}
  }catch(error){
    state.parkingRemote={status:"unavailable",city,items:[],updatedAt:null,source:"TDX／交通部",error:String(error?.message||error)};
  }finally{
    state.parkingRemoteLoading=false;
    renderParking();
  }
}

function parkingSelectedRows(){
  if(state.parkingCity==="Tainan"&&state.parkingLive?.status==="live"){
    return (state.parkingLive.items||[]).map(x=>({
      id:String(x.id||x.code||x.name),
      city:"Tainan",
      name:x.name,
      town:x.zone||"",
      address:x.address||"",
      fare:x.chargeFee||"",
      total:Number(x.carTotal||0),
      available:Number(x.car||0),
      green:Number(x.green||0),
      chargeTime:x.chargeTime||"",
      dataCollectTime:x.sourceUpdate||state.parkingLive.updatedAt||"",
      lat:Number.isFinite(Number(x.lat))?Number(x.lat):null,
      lon:Number.isFinite(Number(x.lng))?Number(x.lng):null,
      sourceType:"live"
    }));
  }
  if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===state.parkingCity)return state.parkingRemote.items||[];
  return [];
}

function renderParkingCard(x){
  const live=x.available!==null&&x.available!==undefined&&Number.isFinite(Number(x.available));
  const available=live?Number(x.available):null;
  const cls=!live?"":available>=20?"good":available>=5?"mid":"bad";
  const query=encodeURIComponent(x.address||((x.name||"")+" "+parkingCityName(x.city)));
  const meta=[parkingCityName(x.city),x.town].filter(Boolean).join(" · ");
  return '<article class="parking-card">'+
    '<div class="parking-card-top"><div><h3>'+esc(x.name||"停車場")+'</h3><span class="parking-zone">'+esc(meta)+'</span></div>'+
    (live?'<div class="parking-space"><b class="'+cls+'">'+available+'</b><small>汽車剩餘</small></div>':'<span class="parking-static-chip">停車場資料</span>')+
    '</div>'+
    '<div class="parking-specs">'+
      '<div><small>總格數</small><b>'+(x.total?money(Number(x.total)):"—")+'</b></div>'+
      '<div><small>即時狀態</small><b>'+(live?"官方剩餘":"未提供")+'</b></div>'+
      '<div><small>收費</small><b>'+esc(x.fare||x.chargeTime||"依現場")+'</b></div>'+
    '</div>'+
    '<div class="parking-address">'+esc(x.address||"地址由官方資料提供")+'</div>'+
    (x.dataCollectTime?'<div class="parking-update">官方更新：'+esc(x.dataCollectTime)+'</div>':"")+
    '<div class="item-actions"><button class="go" data-parking-map="'+query+'">Google Maps</button><button data-parking-apple="'+query+'">Apple 地圖</button></div>'+
  '</article>';
}

function renderParking(){
  const root=$("#liveParkingList");
  const grid=$("#parkingCityGrid");
  if(!root||!grid)return;

  const city=state.parkingCity||"all";
  const cityName=parkingCityName(city);
  const query=($("#parkingSearch")?.value||"").trim().toLowerCase();

  if($("#parkingCitySelect"))$("#parkingCitySelect").value=city;
  if($("#parkingScopeTitle"))$("#parkingScopeTitle").textContent=city==="all"?"全台灣":cityName;
  if($("#parkingResultTitle"))$("#parkingResultTitle").textContent=city==="all"?"全台停車":cityName+"停車";

  grid.innerHTML=TAIWAN_PARKING_CITIES.map(x=>
    '<button class="'+(city===x.code?"active":"")+'" data-parking-city="'+x.code+'">'+esc(x.name)+'</button>'
  ).join("");

  $$("[data-parking-city]",grid).forEach(b=>b.onclick=()=>{
    state.parkingCity=b.dataset.parkingCity;
    if($("#parkingSearch"))$("#parkingSearch").value="";
    renderParking();
  });

  if(city==="all"){
    $("#parkingLiveTime").textContent="全台 22 縣市";
    $("#parkingScopeStatus").textContent="22 縣市皆可搜尋與導航";
    root.innerHTML='<div class="parking-national-intro"><b>全台停車快速入口</b><p>不用等待外部 API；直接選縣市或使用 Google Maps／Apple 地圖找附近停車。臺南另提供市府即時剩餘車位。</p><div class="item-actions"><button class="go" data-national-map="google">Google Maps 找附近</button><button data-national-map="apple">Apple 地圖找附近</button></div></div>';
  }else if(city==="Tainan"){
    const rows=parkingSelectedRows().filter(x=>!query||[x.name,x.town,x.address].join(" ").toLowerCase().includes(query)).sort((a,b)=>(b.available??-1)-(a.available??-1));
    $("#parkingLiveTime").textContent=state.parkingLive?.status==="live"?(state.parkingLive.updatedAt||"官方即時"):"官方即時暫不可用";
    $("#parkingScopeStatus").textContent=state.parkingLive?.status==="live"?"已接臺南市官方即時剩餘車位":"仍可使用全台地圖搜尋";
    root.innerHTML=rows.length?rows.map(renderParkingCard).join(""):'<div class="empty"><b>'+(query?"找不到符合的臺南停車場":"臺南官方即時資料暫時無法取得")+'</b><p>不顯示假空位；仍可使用 Google Maps 或 Apple 地圖找停車場。</p></div>';
  }else if(state.parkingRemote.status==="loading"&&state.parkingRemote.city===city){
    $("#parkingLiveTime").textContent="讀取官方資料中";
    $("#parkingScopeStatus").textContent="正在讀取 "+cityName+" 官方停車資料";
    root.innerHTML='<div class="empty"><b>正在讀取 '+esc(cityName)+' 停車資料</b><p>若 TDX 訪客服務暫時無法使用，會保留地圖搜尋，不會顯示假資料。</p></div>';
  }else if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===city){
    const rows=parkingSelectedRows().filter(x=>!query||[x.name,x.town,x.address,x.fare].join(" ").toLowerCase().includes(query));
    $("#parkingLiveTime").textContent=state.parkingRemote.updatedAt||"官方資料";
    $("#parkingScopeStatus").textContent="TDX 官方停車場資料 · "+state.parkingRemote.items.length+" 筆";
    root.innerHTML=rows.length?rows.map(renderParkingCard).join(""):'<div class="empty"><b>找不到符合的停車場</b><p>換個停車場名稱、行政區或地址試試。</p></div>';
  }else{
    $("#parkingLiveTime").textContent="地圖搜尋";
    $("#parkingScopeStatus").textContent=cityName+" 可直接搜尋與導航";
    root.innerHTML='<div class="market-empty"><b>'+esc(cityName)+' 停車快速搜尋</b><p>目前不要求註冊 TDX 帳號，也不讓你等失敗的 API；直接開地圖搜尋 '+esc(cityName)+' 停車場。</p><div class="item-actions"><button class="go" data-city-map="google">Google Maps</button><button data-city-map="apple">Apple 地圖</button></div></div>';
  }

  $$("[data-parking-map]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.parkingMap,"_blank","noopener"));
  $$("[data-parking-apple]",root).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.parkingApple,"_blank","noopener"));
  $$("[data-national-map]",root).forEach(b=>b.onclick=()=>openParkingMap(b.dataset.nationalMap,"停車場"));
  $$("[data-city-map]",root).forEach(b=>b.onclick=()=>openParkingMap(b.dataset.cityMap,cityName+" 停車場"));
}

function openParkingMap(provider,query){
  const q=encodeURIComponent(query||"停車場");
  const url=provider==="apple"?"https://maps.apple.com/?q="+q:"https://www.google.com/maps/search/?api=1&query="+q;
  window.open(url,"_blank","noopener");
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