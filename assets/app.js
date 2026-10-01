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
  chargingCity:"all",
  chargingQuick:"all",
  chargingMajor:"all",
  chargingAvailableOnly:false,
  chargingSort:"smart",
  chargingOrigin:null,
  chargingCompareKwh:50,
  chargingCompareSort:"nearby",
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
  cctvDirection:"all",
  cctvOrigin:null,
  cctvNearby:false,
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
  if(!$$(".view").some(el=>el.dataset.view===view))view="home";
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
      if(el.hasAttribute("data-home-reload")&&el.dataset.go==="home"){
        try{sessionStorage.clear();}catch{}
        history.replaceState(null,"",location.pathname+location.search+"#home");
        location.reload();
        return;
      }
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

function bindCopy(root=document){
  $$("[data-copy-target]",root).forEach(el=>{
    el.onclick=async()=>{
      const target=$(el.dataset.copyTarget);
      const text=target?.textContent?.trim();
      if(!text)return toast("沒有可複製的內容");
      try{
        await navigator.clipboard.writeText(text);
      }catch{
        const area=document.createElement("textarea");
        area.value=text;
        area.setAttribute("readonly","");
        area.style.position="fixed";
        area.style.opacity="0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      toast("已複製 Tesla 實車回報格式");
    };
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

  const trafficStatus=state.traffic?.status||"unavailable";
  const live=trafficStatus==="live";
  const stale=trafficStatus==="stale";
  $("#syncState").classList.toggle("ready",live);
  $("#syncText").textContent=live?"即時":stale?"最後可用":"同步中";
  $("#lastUpdate").textContent=formatTime(state.traffic?.updatedAt);

  $("#chargeQuick").textContent=state.charging.length?state.charging.length+" 處":"服務區";
  $("#chargeValue").textContent=state.charging.length||"—";

  const h1=avg(state.traffic?.highways?.["1"]||[]);
  $("#trafficValue").textContent=h1?h1+" km/h":"—";
  $("#trafficDot").className=live?"dot ready":"dot pending";
  $("#trafficCaption").textContent=live&&h1?"國 1 平均":stale&&h1?"TDX 最後可用資料":"可開 1968 即時查看";

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
const LEGACY_TDX_CONNECTOR_TYPES={"1":"CCS1","2":"CCS2","3":"CHAdeMO","4":"Tesla TPC","5":"J1772","6":"Type2","254":"其他","255":"其他","J1772(Type1)":"J1772","Mennekes(Type2)":"Type2"};
const CHARGING_OPERATOR_PROFILES=[
  {key:"ev2",brand:"電小二 EV2",ids:["58430020"],names:["程豐資通股份有限公司"],aliases:["電小二","EV2","程豐"],official:"https://www.ev2.com.tw/",ios:"https://apps.apple.com/tw/app/%E9%9B%BB%E5%B0%8F%E4%BA%8C-%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E7%AB%99/id6677032732",android:"https://play.google.com/store/apps/details?id=tw.delta.android"},
  {key:"evoasis",brand:"EVOASIS",names:["源點科技股份有限公司"],aliases:["OASIS","源點科技"],official:"https://www.evoasis.com.tw/",stationMap:"https://www.evoasis.com.tw/charging-station",chargeGuide:"https://www.evoasis.com.tw/chargingapp",rateGuide:"https://www.evoasis.com.tw/search",chargeHint:"EVOASIS App・掃碼／隨插即充",rateCheckedAt:"2026-10-01",rateShort:"指定站：星晴 6.5｜假日 8.4｜尖峰最高 14.9 元/度",rateHint:"EVOASIS 星晴方案僅限指定站。非夏月一般指定站：平日 21:00～隔日 14:59 為 6.5 元/度、15:00～20:59 尖峰 14.9 元/度、假日 8.4 元/度；部分公有停車場方案不同，例如臺南市公有停車場尖峰 12.7 元/度。跨時段會依各時段分段計費，實際以 EVOASIS App／站點公告為準",networkHint:"官方 DC 站點已導入；即時空槍只採可安全判讀的 TDX 槍況"},
  {key:"upower",brand:"U-POWER",ids:["83235398"],names:["旭電馳科研","旭電馳科研股份有限公司"],aliases:["U POWER","UPOWER","旭電馳","旭電馳科研"],official:"https://www.u-power.com.tw/",stationMap:"https://www.u-power.com.tw/",chargeGuide:"https://www.u-power.com.tw/service/",rateGuide:"https://www.u-power.com.tw/service/",chargeHint:"U-POWER App・掃碼／AutoCharge",rateCheckedAt:"2026-10-01",rateShort:"夏月會員：離峰 6.9｜假日 8.5｜尖峰 13.5 元/度",rateHint:"2026 夏月 5/16–10/15；平日 16:00–22:00 為尖峰。會員離峰 6.9、假日 8.5、尖峰 13.5 元/度；非會員全天 14 元/度；整筆依起充時間費率計價，特例站點以 App 為準",networkHint:"官方站點已導入；即時空槍只採可安全判讀的 TDX 槍況"},
  {key:"evalue",brand:"EVALUE 華城電機",names:["華城電能科技股份有限公司","華城電機股份有限公司"],aliases:["E-Value","華城電能","華城電機"],official:"https://www.evalue.com.tw/",stationMap:"https://www.evalue.com.tw/find",chargeGuide:"https://www.evalue.com.tw/app",rateGuide:"https://www.evalue.com.tw/recommended/3/84",chargeHint:"EVALUE App・即時狀態／預約充電",rateCheckedAt:"2026-10-01",rateShort:"120–180 kW 6.6／8.3／13.5・240 kW+ 8／9／13.5 元/度",rateHint:"2026/6/1 起指定站：120–180kW 離峰 6.6、假日 8.3、尖峰 13.5 元/度；240kW 以上離峰 8、假日 9、尖峰 13.5 元/度；部分站不適用，以 App 為準"},
  {key:"icharging",brand:"iCharging 中興電工",names:["中興電工機械股份有限公司"],aliases:["iCharging","中興電工"],official:"https://www.icharging.com.tw/tw",stationMap:"https://www.icharging.com.tw/tw/map/index.aspx",chargeGuide:"https://www.icharging.com.tw/tw/about/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C",rateGuide:"https://www.icharging.com.tw/tw/about/%E8%B2%BB%E7%8E%87%E8%AA%AA%E6%98%8E",chargeHint:"iParking App・依站點支援",rateCheckedAt:"2026-10-01",rateShort:"iParking：高速 9.2–10｜市區 8 元/度",rateHint:"iCharging 公告原價 12 元/度；iParking 會員高速公路服務區 9.2–10 元/度、市區站點 8 元/度；部分市區站採每分鐘 7 元，實際依官方站點與合作夥伴公告",networkHint:"官方網站可依區域、槍種搜尋；主要提供 CCS1、CCS2"},
  {key:"starcharger",brand:"星舟快充",names:["星舟快充"],aliases:["StarCharger","星舟"],official:"https://starcharger.com.tw/"},
  {key:"tail",brand:"TAIL 特爾電力",names:["特爾電力股份有限公司"],aliases:["TAIL","特爾"],official:"https://www.evtail.com.tw/",stationMap:"https://www.evtail.com.tw/locations",chargeGuide:"https://www.evtail.com.tw/",rateGuide:"https://www.evtail.com.tw/",chargeHint:"TAIL App・掃碼充電",rateCheckedAt:"2026-10-01",rateShort:"尖峰／離峰浮動・依現場與 App",rateHint:"TAIL 官方說明費率依用電量、離峰與尖峰浮動；目前未公開全網統一數字，詳細費率以現場與 App 當下標示為準",networkHint:"官方站點已導入；部分站點功率與席次仍需由 TDX 或官方補齊"},
  {key:"acon",brand:"Acon-eco",names:["連展電能科技股份有限公司"],aliases:["Acon","連展電能"],official:"https://www.acon-eco.com/"},
  {key:"noodoe",brand:"Noodoe",names:["拓廣科技","拓廣科技股份有限公司"],aliases:["拓廣","Noodoe EV"],official:"https://www.noodoe.com.tw/"},
  {key:"tesla",brand:"Tesla 超級充電",names:["台灣特斯拉汽車有限公司"],aliases:["特斯拉","Tesla","Tesla Supercharger"],official:"https://www.tesla.com/zh_TW/findus/list/superchargers/Taiwan",stationMap:"https://www.tesla.com/zh_TW/findus/list/superchargers/Taiwan",chargeGuide:"https://www.tesla.com/zh_tw/support/charging/supercharging",rateGuide:"https://www.tesla.com/zh_tw/support/charging/supercharging",chargeHint:"Tesla App・插槍自動充電",rateCheckedAt:"2026-10-01",rateShort:"動態費率・部分站分尖峰／離峰",rateHint:"Tesla 各站價格可能不同並採動態定價；部分站有尖峰／非尖峰費率，實際價格以車機或 Tesla App 站點頁當下顯示為準",networkHint:"Tesla App 可查看官方可用充電座、最高功率與站點價格；COLA GO 的即時空槍只顯示可安全判讀的 TDX 資料，不把官方網站清單假裝成即時空槍"}
];
const CHARGING_MAJOR_KEYS=["evoasis","upower","tail","evalue","icharging","tesla"];
const CHARGING_PRIORITY_KEYS=["evoasis","upower","tail","tesla"];
const CHARGING_OFFICIAL_CACHE_KEYS=["evoasis","upower","tail","evalue"];
function chargingIntegrationLabel(key){
  if(CHARGING_OFFICIAL_CACHE_KEYS.includes(key))return "官方站點已導入";
  if(key==="tesla")return "優先整合・TDX 即時＋Tesla 官方";
  if(key==="icharging")return "官方地圖可用・站點快取待導入";
  return "TDX／官方資料";
}
const ICHARGING_PLUG_AND_CHARGE=[
  ["湖口服務區南向",["湖口服務區南向","湖口南向","湖口南"]],
  ["湖口服務區北向",["湖口服務區北向","湖口北向","湖口北"]],
  ["清水服務區",["清水服務區","清水"]],
  ["東山服務區",["東山服務區","東山"]],
  ["關西服務區",["關西服務區","關西"]],
  ["泰安服務區北向",["泰安服務區北向","泰安北向","泰安北"]],
  ["泰安服務區南向",["泰安服務區南向","泰安南向","泰安南"]],
  ["仁德服務區北向",["仁德服務區北向","仁德北向","仁德北"]],
  ["仁德服務區南向",["仁德服務區南向","仁德南向","仁德南"]],
  ["蘇澳服務區",["蘇澳服務區","蘇澳"]],
  ["石碇服務區",["石碇服務區","石碇"]],
  ["西螺服務區北向",["西螺服務區北向","西螺北向","西螺北"]],
  ["西螺服務區南向",["西螺服務區南向","西螺南向","西螺南"]],
  ["新營服務區北向",["新營服務區北向","新營北向","新營北"]],
  ["新營服務區南向",["新營服務區南向","新營南向","新營南"]],
  ["古坑服務區",["古坑服務區","古坑"]],
  ["汐止遠東世界中心",["汐止遠東世界中心"]],
  ["內湖污水處理廠附屬公園停車場",["內湖污水處理廠附屬公園停車場","內湖汙水處理廠附屬公園停車場","內湖污水廠站"]],
  ["新生高架(南京長安)",["新生高架南京長安","新生高架南京街長安","新生高架南京長安站"]],
  ["新生高架(錦州民權)",["新生高架錦州民權","新生高架錦州街民權東路","新生高架錦州民權站"]],
  ["富邦遼寧",["富邦遼寧"]],
  ["港墘站",["港墘站","港墘"]],
  ["嘉義水牛站",["嘉義水牛站","嘉義水牛"]]
];
function chargingNameKey(value){
  return String(value||"").toLowerCase().replace(/臺/g,"台").replace(/[^\p{L}\p{N}]+/gu,"");
}
function chargingCapabilities(x){
  const profile=chargingOperatorProfile(x);
  if(profile?.key!=="icharging")return [];
  const key=chargingNameKey(x?.name);
  const plug=ICHARGING_PLUG_AND_CHARGE.some(([,aliases])=>aliases.some(alias=>{
    const a=chargingNameKey(alias);
    return key===a||key.includes(a)||a.includes(key);
  }));
  return plug?[{key:"plug-and-charge",label:"插槍即充",source:"iCharging 官方 FAQ",url:"https://www.icharging.com.tw/tw/about/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C"}]:[];
}
function chargingOperatorProfile(value){
  const x=typeof value==="string"?{operator:value}:(value||{});
  const networkKey=String(x.networkKey||"").trim();
  if(networkKey){
    const networkProfile=CHARGING_OPERATOR_PROFILES.find(profile=>profile.key===networkKey);
    if(networkProfile)return networkProfile;
  }
  const operator=String(x.operator||"").trim();
  const operatorId=String(x.operatorId||"").trim();
  return CHARGING_OPERATOR_PROFILES.find(profile=>
    (operatorId&&profile.ids?.includes(operatorId))||
    profile.names?.some(name=>operator===name||operator.includes(name))
  )||null;
}
function chargingMajorRank(x){
  const key=chargingOperatorProfile(x)?.key||"";
  const index=CHARGING_MAJOR_KEYS.indexOf(key);
  return index>=0?index:99;
}
function chargingMajorMatch(x){
  return state.chargingMajor==="all"||chargingOperatorProfile(x)?.key===state.chargingMajor;
}
function chargingOperatorSearchText(x){
  const profile=chargingOperatorProfile(x);
  return [JSON.stringify(x),profile?.brand,...(profile?.aliases||[]),...chargingCapabilities(x).map(c=>c.label)].filter(Boolean).join(" ").toLowerCase();
}
function chargingConnectors(x){
  const rows=(x?.connectors||[]).map(value=>LEGACY_TDX_CONNECTOR_TYPES[String(value)]||String(value)).filter(Boolean);
  if(!rows.length&&x?.road==="tdx")return ["接頭類型未提供"];
  return rows;
}
function chargingPowerKw(x){
  const direct=Number(x?.maxPowerKw);
  if(Number.isFinite(direct)&&direct>0)return direct;
  if(x?.officialSupplemental&&Number(x?.sitePowerKw)>0)return 0;
  const legacy=String(x?.power||"").trim();
  if(x?.road==="tdx"&&/^[12](?:\.0)?\s*kW$/i.test(legacy))return 0;
  return parseChargingPower(legacy);
}
function chargingPowerLabel(x){
  const kw=Number(x?.maxPowerKw);
  if(Number.isFinite(kw)&&kw>0)return (Number.isInteger(kw)?kw:kw.toFixed(1))+" kW";
  if(x?.officialSupplemental&&Number(x?.sitePowerKw)>0)return "站點總功率 "+Number(x.sitePowerKw).toLocaleString("zh-TW")+" kW";
  const legacy=String(x?.power||"").trim();
  if(x?.road==="tdx"&&/^[12](?:\.0)?\s*kW$/i.test(legacy))return "功率未提供";
  return legacy||"功率未提供";
}
function chargingLiveCounts(x){
  const explicit={
    available:Number(x?.availableConnectors),
    occupied:Number(x?.occupiedConnectors),
    fault:Number(x?.faultedConnectors),
    unavailable:Number(x?.unavailableConnectors),
    unknown:Number(x?.unknownConnectors)
  };
  const hasExplicit=Boolean(x?.liveStatusKnown)||[explicit.occupied,explicit.fault,explicit.unavailable,explicit.unknown].some(v=>Number.isFinite(v)&&v>0);
  if(hasExplicit){
    return {
      available:Number.isFinite(explicit.available)?explicit.available:0,
      occupied:Number.isFinite(explicit.occupied)?explicit.occupied:0,
      fault:Number.isFinite(explicit.fault)?explicit.fault:0,
      unavailable:Number.isFinite(explicit.unavailable)?explicit.unavailable:0,
      unknown:Number.isFinite(explicit.unknown)?explicit.unknown:0,
      total:Number(x?.liveStateCount)||0
    };
  }
  const states=x?.liveStates&&typeof x.liveStates==="object"?x.liveStates:{};
  const keys=Object.keys(states).filter(k=>Number(states[k])>0);
  if(keys.length&&keys.every(k=>["0","1","2","3"].includes(String(k)))){
    return {
      available:Number(states["1"]||0),
      occupied:Number(states["2"]||0),
      fault:Number(states["3"]||0),
      unavailable:0,
      unknown:Number(states["0"]||0),
      total:keys.reduce((sum,k)=>sum+Number(states[k]||0),0)
    };
  }
  return {available:0,occupied:0,fault:0,unavailable:0,unknown:Number(x?.liveStateCount||0),total:Number(x?.liveStateCount||0)};
}
function chargingOperatorLabel(value){
  const x=typeof value==="string"?{operator:value}:(value||{});
  const legal=String(x.operator||"").trim();
  const profile=chargingOperatorProfile(x);
  if(profile)return profile.brand;
  if(!legal||legal==="TDX")return "TDX 官方站點";
  if(/^\d{8}$/.test(legal))return "TDX 業者 "+legal;
  return legal;
}

function ensureChargingPriorityPanel(){
  if($("#chargingPriorityPanel"))return;
  const major=$("#chargingMajorFilter");
  if(!major)return;
  major.insertAdjacentHTML("afterend",
    '<section class="charging-coverage" id="chargingPriorityPanel">'+
      '<div class="charging-filter-label"><span>優先完善｜前三大＋Tesla</span><small>先看空槍、功率、費率</small></div>'+
      '<div class="charging-coverage-grid" id="chargingPriorityGrid"></div>'+
      '<p class="charging-network-legend">空槍只採可安全判讀的 TDX 即時槍況；業者官方站點補資料不會被當成即時可用。</p>'+
    '</section>'
  );
}
function chargingPriorityStats(key){
  const rows=(state.charging||[]).filter(x=>chargingOperatorProfile(x)?.key===key);
  const liveRows=rows.filter(x=>x.road==="tdx"&&!x.liveStale&&chargingLiveCounts(x).total>0);
  const available=liveRows.reduce((sum,x)=>sum+chargingLiveCounts(x).available,0);
  const maxKw=Math.max(0,...rows.map(chargingPowerKw).filter(v=>Number.isFinite(v)&&v>0));
  const updatedTimes=liveRows.map(x=>Date.parse(x.statusUpdatedAt||"")).filter(Number.isFinite);
  const latestUpdatedAt=updatedTimes.length?new Date(Math.max(...updatedTimes)).toISOString():"";
  return {rows,liveRows,available,maxKw,latestUpdatedAt};
}
function renderChargingPriorityPanel(){
  ensureChargingPriorityPanel();
  const root=$("#chargingPriorityGrid");
  if(!root)return;
  root.innerHTML=CHARGING_PRIORITY_KEYS.map(key=>{
    const profile=CHARGING_OPERATOR_PROFILES.find(x=>x.key===key);
    if(!profile)return "";
    const stats=chargingPriorityStats(key);
    const power=stats.maxKw?stats.maxKw+" kW":"依站點資料";
    const live=stats.liveRows.length?stats.liveRows.length+" 站有即時":"即時覆蓋待補";
    const open=stats.liveRows.length?stats.available+" 空槍":"-- 空槍";
    const freshness=stats.latestUpdatedAt?chargingLiveAgeLabel(stats.latestUpdatedAt):"即時更新待補";
    return '<button type="button" data-charge-priority="'+esc(key)+'">'+
      '<span class="charging-coverage-brand"><b>'+esc(profile.brand)+'</b><small>'+esc(chargingIntegrationLabel(key))+'</small></span>'+
      '<span class="charging-coverage-stats"><strong>'+esc(open)+'</strong><small>'+esc(live)+'</small><em>最高功率 '+esc(power)+'</em><em class="charging-priority-freshness">'+esc(freshness)+'</em></span>'+
      '<small class="charging-network-legend">'+esc(profile.rateShort||"費率依官方")+'</small>'+
    '</button>';
  }).join("");
  $$("[data-charge-priority]",root).forEach(button=>button.onclick=()=>{
    state.chargingMajor=button.dataset.chargePriority||"all";
    state.chargingOperator="all";
    const select=$("#chargingOperator");
    if(select)select.value="all";
    renderCharging();
    $("#chargingList")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
}

function chargingDirectionMatch(x){
  const d=String(x.direction||"");
  if(state.chargingDirection==="all")return true;
  if(state.chargingDirection==="south")return d.includes("南");
  if(state.chargingDirection==="north")return d.includes("北");
  if(state.chargingDirection==="shared")return d.includes("雙向");
  return true;
}
function chargingDistanceKm(x){
  if(!state.chargingOrigin)return null;
  const lat=Number(x?.lat),lon=Number(x?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const toRad=v=>v*Math.PI/180;
  const a=toRad(lat-state.chargingOrigin.lat);
  const b=toRad(lon-state.chargingOrigin.lon);
  const c=Math.sin(a/2)**2+Math.cos(toRad(state.chargingOrigin.lat))*Math.cos(toRad(lat))*Math.sin(b/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(c),Math.sqrt(1-c));
}
function chargingPriorityFastEligible(x){
  const key=chargingOperatorProfile(x)?.key||"";
  if(!CHARGING_PRIORITY_KEYS.includes(key))return false;
  if(x?.road!=="tdx"||x?.liveStale)return false;
  const counts=chargingLiveCounts(x);
  if(counts.available<=0||counts.total<=0)return false;
  return chargingPowerKw(x)>=100;
}
function chargingSnapshotStationKey(x){
  const direct=String(x?.stationId||x?.ChargingStationID||x?.id||"").trim();
  if(direct)return "id:"+direct;
  const lat=Number(x?.lat),lon=Number(x?.lon);
  const geo=Number.isFinite(lat)&&Number.isFinite(lon)?lat.toFixed(5)+","+lon.toFixed(5):"";
  return ["fallback",chargingOperatorProfile(x)?.key||x?.operator||"",x?.city||"",x?.name||"",geo,x?.direction||""].join("|").toLowerCase();
}
function chargingSnapshot(rows){
  const stations=new Map();
  (rows||[]).forEach(row=>{
    const key=chargingSnapshotStationKey(row);
    const available=Math.max(0,chargingLiveCounts(row).available||0);
    const previous=stations.get(key);
    if(!previous||available>previous.available)stations.set(key,{row,available});
  });
  return {
    stations:stations.size,
    available:[...stations.values()].reduce((sum,item)=>sum+item.available,0)
  };
}
function chargingAvailableSnapshot(){
  return chargingSnapshot((state.charging||[]).filter(x=>
    (state.chargingCity==="all"||x.city===state.chargingCity)&&
    x?.road==="tdx"&&!x?.liveStale&&chargingLiveCounts(x).total>0&&chargingLiveCounts(x).available>0
  ));
}
function chargingPriorityFastSnapshot(){
  return chargingSnapshot((state.charging||[]).filter(x=>
    (state.chargingCity==="all"||x.city===state.chargingCity)&&chargingPriorityFastEligible(x)
  ));
}
function renderChargingFirstLayerStatus(){
  const availableStatus=$("#chargingAvailableOnly")?.querySelector("[data-available-status]");
  const priorityStatus=$("#chargingPriorityFast")?.querySelector("[data-priority-fast-status]");
  if(!(state.charging||[]).length){
    if(availableStatus)availableStatus.textContent="資料整理中";
    if(priorityStatus)priorityStatus.textContent="資料整理中";
    return;
  }
  const available=chargingAvailableSnapshot();
  const priority=chargingPriorityFastSnapshot();
  if(availableStatus)availableStatus.textContent=available.stations?available.stations+" 站 · "+available.available+" 空槍":"目前無可確認空槍";
  if(priorityStatus)priorityStatus.textContent=priority.stations?priority.stations+" 站 · "+priority.available+" 空槍":"目前無符合";
}
function chargingPriorityFastReason(x){
  if(!chargingPriorityFastEligible(x))return "";
  const counts=chargingLiveCounts(x);
  const kw=chargingPowerKw(x);
  const freshness=chargingLiveAgeLabel(x?.statusUpdatedAt);
  return "主力空槍快充｜空槍 "+counts.available+"・"+Math.round(kw)+" kW・"+freshness;
}
function chargingTaipeiClock(value=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(value).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const hour=Number(parts.hour)||0,minute=Number(parts.minute)||0;
  return {year:Number(parts.year)||0,month:Number(parts.month)||0,day:Number(parts.day)||0,weekday:parts.weekday||"",hour,minute,minutes:hour*60+minute};
}
function chargingDateBetween(clock,sm,sd,em,ed){
  const value=clock.month*100+clock.day,start=sm*100+sd,end=em*100+ed;
  return value>=start&&value<=end;
}
const EVOASIS_TAINAN_PUBLIC_RATE_STATIONS=["萬年三街","平通路永華六街","南聖公園","郡平路口","北成路38巷","龍山里臨時收費停車場","台南市立圖書館廣場","臺南市立圖書館廣場"];
const EVOASIS_TAIPEI_PUBLIC_RATE_STATIONS=["新生高架民生錦州","建國南路高架橋下I區","建國南路高架橋下A區"];
function chargingNameHasAny(x,names){
  const value=String(x?.name||"").replace(/臺/g,"台").replace(/\s+/g,"");
  return names.some(name=>value.includes(String(name).replace(/臺/g,"台").replace(/\s+/g,"")));
}
function chargingCurrentRateInfo(x,at=new Date()){
  const station=chargingRateSummary(x?.chargingRate);
  if(station)return {label:station,detail:"本站資料提供的費率",level:"station",current:true};
  const key=chargingOperatorProfile(x)?.key||"";
  const clock=chargingTaipeiClock(at),weekend=clock.weekday==="Sat"||clock.weekday==="Sun";
  if(key==="upower"){
    const summer=chargingDateBetween(clock,5,16,10,15);
    if(!summer)return {label:"非夏月依官方",detail:"U-POWER 非夏月時段費率請以 App／官網當下公告為準",level:"dynamic",current:false};
    let rate,period;
    if(clock.weekday==="Sat"){
      if(clock.minutes<360){rate=6.9;period="週末首日 06:00 前離峰";}
      else{rate=8.5;period="週末假日";}
    }else if(clock.weekday==="Sun"){rate=8.5;period="週末假日";}
    else if(clock.minutes>=960&&clock.minutes<1320){rate=13.5;period="夏月平日尖峰";}
    else{rate=6.9;period="夏月平日離峰";}
    return {label:"會員 "+rate+" 元/度",detail:"U-POWER "+period+"・依起充時間計價・國定假日／特例站以官方為準",level:"timed",current:true,value:rate};
  }
  if(key==="evalue"){
    const kw=chargingPowerKw(x);
    const tier=kw>=240?"ultra":(kw>=120&&kw<=180?"fast":"");
    if(!tier)return {label:"依 App 功率級距",detail:"EVALUE 時間電價需先確認此站充電樁功率是否屬 120–180 kW 或 240 kW 以上",level:"dynamic",current:false};
    let rate,period;
    if(weekend){rate=tier==="ultra"?9:8.3;period="週末假日";}
    else if(clock.minutes>=960&&clock.minutes<1320){rate=13.5;period="平日尖峰";}
    else{rate=tier==="ultra"?8:6.6;period="平日離峰";}
    return {label:rate+" 元/度",detail:"EVALUE "+(tier==="ultra"?"240 kW+":"120–180 kW")+"・"+period+"・僅限時間電價適用站樁",level:"timed",current:true,value:rate};
  }
  if(key==="evoasis"){
    const summer=chargingDateBetween(clock,6,1,9,30);
    const tainan=chargingNameHasAny(x,EVOASIS_TAINAN_PUBLIC_RATE_STATIONS);
    const taipei=chargingNameHasAny(x,EVOASIS_TAIPEI_PUBLIC_RATE_STATIONS);
    const special=tainan||taipei;
    const peakRate=tainan?12.7:taipei?13.2:14.9;
    let rate,period;
    if(clock.weekday==="Sat"){
      if(clock.minutes<420){rate=6.5;period="週六 07:00 前星晴";}
      else{rate=8.4;period="週末假日";}
    }else if(clock.weekday==="Sun"){rate=8.4;period="週末假日";}
    else{
      const peakStart=summer?960:900,peakEnd=summer?1320:1260;
      if(clock.minutes>=peakStart&&clock.minutes<peakEnd){rate=peakRate;period=(summer?"夏月":"非夏月")+"平日尖峰";}
      else{rate=6.5;period=(summer?"夏月":"非夏月")+"星晴";}
    }
    return {label:(special?"公有站 ":"指定站 ")+rate+" 元/度",detail:"EVOASIS "+period+"・僅適用活動指定站，國定假日／其他特例以 App 為準",level:"timed",current:true,value:rate};
  }
  if(key==="tesla")return {label:"Tesla App 即時價",detail:"各站採動態費率，請以 Tesla App／車機當下價格為準",level:"dynamic",current:false};
  if(key==="tail")return {label:"TAIL App 即時價",detail:"費率依站點與尖離峰浮動，請以現場／TAIL App 當下標示為準",level:"dynamic",current:false};
  if(key==="icharging")return {label:"依站點 8–10 元",detail:"iParking 會員市區／高速方案不同，部分站採計時制；以站點公告為準",level:"dynamic",current:false};
  return null;
}
function chargingDecisionRateCompact(x){
  const current=chargingCurrentRateInfo(x);
  if(current)return current.label;
  const station=chargingRateSummary(x?.chargingRate);
  if(station)return station;
  const profile=chargingOperatorProfile(x);
  if(profile?.rateShort)return "業者方案";
  return "依站點／App";
}
function chargingDecisionStripMarkup(x){
  const tdx=x?.road==="tdx",counts=chargingLiveCounts(x),live=tdx&&!x.liveStale&&counts.total>0;
  const availability=live?(counts.available>0?"空槍 "+counts.available+"/"+counts.total:"目前無空槍"):(x?.liveStale?"槍況已逾時":x?.officialSupplemental?"即時未驗證":"空槍未確認");
  const availabilityClass=live?(counts.available>0?" is-open":" is-full"):" is-muted";
  const kw=chargingPowerKw(x);
  const power=kw>0?Math.round(kw)+" kW":"功率未提供";
  const rateInfo=chargingCurrentRateInfo(x),rate=rateInfo?.label||chargingDecisionRateCompact(x);
  const distance=chargingDistanceKm(x);
  const distanceText=distance==null?"":(distance<10?distance.toFixed(1):Math.round(distance))+" km";
  return '<div class="charging-decision-strip'+(distanceText?' has-distance':'')+'">'+
    '<span class="charging-decision-chip'+availabilityClass+'"><small>即時</small><b>'+esc(availability)+'</b></span>'+
    '<span class="charging-decision-chip'+(kw>=100?' is-fast':'')+'"><small>功率</small><b>'+esc(power)+'</b></span>'+
    '<span class="charging-decision-chip is-rate'+(rateInfo?.current?' is-current':'')+'"><small>'+(rateInfo?.current?'目前費率':'費率')+'</small><b>'+esc(rate)+'</b></span>'+
    (distanceText?'<span class="charging-decision-chip is-distance"><small>距離</small><b>'+esc(distanceText)+'</b></span>':"")+
  '</div>';
}
function chargingQuickMatch(x){
  if(state.chargingQuick==="all")return true;
  if(state.chargingQuick==="available"){
    return x.road==="tdx"&&!x.liveStale&&chargingLiveCounts(x).available>0;
  }
  if(state.chargingQuick==="fast")return chargingPowerKw(x)>=100;
  if(state.chargingQuick==="priorityfast")return chargingPriorityFastEligible(x);
  if(state.chargingQuick==="ccs2")return chargingConnectors(x).includes("CCS2");
  if(state.chargingQuick==="tesla"){
    const text=[x.name,x.operator,x.note,chargingOperatorLabel(x)].join(" ").toLowerCase();
    return chargingConnectors(x).includes("Tesla TPC")||text.includes("tesla")||text.includes("特斯拉");
  }
  if(state.chargingQuick==="ev2")return chargingOperatorProfile(x)?.key==="ev2";
  return true;
}
function chargingPriorityFastSort(a,b){
  const ta=Date.parse(a?.statusUpdatedAt||"");
  const tb=Date.parse(b?.statusUpdatedAt||"");
  const aTime=Number.isFinite(ta)?ta:0,bTime=Number.isFinite(tb)?tb:0;
  if(aTime!==bTime)return bTime-aTime;
  const aAvailable=chargingLiveCounts(a).available,bAvailable=chargingLiveCounts(b).available;
  if(aAvailable!==bAvailable)return bAvailable-aAvailable;
  const aPower=chargingPowerKw(a),bPower=chargingPowerKw(b);
  if(aPower!==bPower)return bPower-aPower;
  return String(a?.name||"").localeCompare(String(b?.name||""),"zh-Hant");
}
function chargingSortRank(x){
  if(x?.officialSupplemental)return 3;
  if(x.road!=="tdx")return 5;
  if(x.liveStale)return 4;
  if(chargingLiveCounts(x).available>0)return 0;
  if(Number(x.liveStateCount)>0&&chargingLiveCounts(x).unknown===0)return 1;
  if(Number(x.liveStateCount)>0)return 2;
  return 3;
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
function chargingLiveAgeLabel(value,now=Date.now()){
  if(!value)return "更新時間未提供";
  const ts=Date.parse(value);
  if(!Number.isFinite(ts))return "更新時間未提供";
  const diff=Math.max(0,now-ts);
  const minute=60000,hour=3600000;
  if(diff<minute)return "剛剛更新";
  if(diff<60*minute)return Math.max(1,Math.floor(diff/minute))+" 分鐘前更新";
  if(diff<24*hour)return Math.floor(diff/hour)+" 小時前更新";
  return formatTime(value);
}
function chargingTrustInfo(x){
  const profile=chargingOperatorProfile(x);
  if(x?.officialSupplemental)return {level:"official",label:"業者官方站點",detail:"即時空槍未由 TDX 驗證"};
  if(x?.road!=="tdx")return {level:"source",label:"站點資料",detail:"即時槍況未提供"};
  const updated=chargingLiveAgeLabel(x?.statusUpdatedAt);
  if(x?.liveStale)return {level:"stale",label:"TDX 槍況逾時",detail:updated};
  const counts=chargingLiveCounts(x);
  if(counts.total>0)return {level:"live",label:"TDX 即時驗證",detail:updated};
  return {level:"source",label:"TDX 官方站點",detail:profile?"即時槍況尚未提供":"槍況尚未提供"};
}
function chargingTrustMarkup(x){
  const info=chargingTrustInfo(x);
  return '<div class="charging-trust '+esc(info.level)+'"><span><i></i>'+esc(info.label)+'</span><small>'+esc(info.detail)+'</small></div>';
}
function chargingStatusMarkup(x){
  const tdx=x.road==="tdx";
  const profile=chargingOperatorProfile(x);
  const note=(title,detail,kind="is-unknown")=>'<div class="charging-status-note '+kind+'"><b>'+esc(title)+'</b><small>'+esc(detail)+'</small></div>';
  if(x?.officialSupplemental){
    const brand=profile?.brand||"業者";
    return note("即時槍況尚未驗證",brand+" 官方已列站；需要時可直接開業者官方資訊確認。","is-official");
  }
  if(!tdx)return note("即時槍況未提供","此筆站點目前沒有可安全判讀的即時空槍資料。");
  const updated=chargingLiveAgeLabel(x.statusUpdatedAt);
  if(x.liveStale){
    const detail=profile?.key==="tesla"
      ?"TDX 狀態已逾時；Tesla App 可查看官方可用充電座。"
      :"不列入「有空槍」篩選 · "+updated;
    return note("即時槍況已逾時",detail,"is-stale");
  }
  const counts=chargingLiveCounts(x);
  if(!counts.total){
    const detail=profile?.key==="tesla"
      ?"TDX 尚未提供即時空槍；Tesla App 可查看官方可用充電座。"
      :profile
        ? "TDX 尚未收到 "+profile.brand+" 可安全判讀的即時槍況。"
        : "TDX 目前沒有可安全判讀的即時槍況。";
    return note("即時槍況未提供",detail);
  }
  const badges=[
    '<span class="available">可用 '+counts.available+'</span>',
    counts.occupied?'<span class="occupied">使用中 '+counts.occupied+'</span>':"",
    counts.fault?'<span class="fault">故障 '+counts.fault+'</span>':"",
    counts.unavailable?'<span class="unknown">其他不可用 '+counts.unavailable+'</span>':"",
    counts.unknown?'<span class="unknown">未知 '+counts.unknown+'</span>':""
  ].join("");
  return '<details class="charging-live-detail"'+(counts.fault>0?' open':"")+'>'+
    '<summary><span><b>槍況詳情</b><small>總計 '+counts.total+' 槍 · '+esc(updated)+'</small></span><em>'+(counts.fault>0?'有故障資訊':'查看')+'</em></summary>'+
    '<div class="charging-live-badges">'+badges+'</div>'+
  '</details>';
}
function chargingDisplayText(value){
  return String(value??"")
    .replace(/<br\s*\/?>/gi," · ")
    .replace(/&nbsp;/gi," ")
    .replace(/<[^>]*>/g," ")
    .replace(/\s+/g," ")
    .replace(/\s*·\s*/g," · ")
    .trim();
}
function chargingDecisionRateLabel(x){
  const station=chargingRateSummary(x?.chargingRate);
  if(station)return "站點費率 "+station;
  const profile=chargingOperatorProfile(x);
  return profile?.rateShort||"";
}
function chargingDecisionPowerLabel(x){
  const kw=chargingPowerKw(x);
  if(kw>0)return "最高功率 "+chargingPowerLabel(x);
  const raw=chargingPowerLabel(x);
  const key=chargingOperatorProfile(x)?.key||"";
  if(raw&&raw!=="功率未提供")return raw;
  if(key==="tesla")return "最高功率依 Tesla App";
  return "功率未提供";
}
function chargingRateSummary(value){
  const text=chargingDisplayText(value);
  if(!text)return "";
  const values=[];
  const patterns=[
    /(?:每度|每1度|每度電)\s*([0-9]+(?:\.[0-9]+)?)\s*元/gi,
    /([0-9]+(?:\.[0-9]+)?)\s*元\s*(?:每度|\/度|每度電)/gi,
    /(?:NT\$|NTD\s*)?([0-9]+(?:\.[0-9]+)?)\s*\/\s*(?:kWh|度)/gi
  ];
  for(const re of patterns){
    let match;
    while((match=re.exec(text))){
      const n=Number(match[1]);
      if(Number.isFinite(n)&&n>0&&n<=50)values.push(n);
    }
  }
  const unique=[...new Set(values.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b);
  const fmt=v=>Number.isInteger(v)?String(v):String(v).replace(/0+$/,"").replace(/\.$/,"");
  if(unique.length===1)return fmt(unique[0])+" 元/度";
  if(unique.length>1)return fmt(unique[0])+"–"+fmt(unique.at(-1))+" 元/度";
  if(/(?:每分|每分鐘|元\/分|元每\d*分|計時|計分)/i.test(text))return "計時制";
  if(/費用詳情|依.*app|依.*公告|浮動/i.test(text))return "依官方";
  return "";
}
function chargingRateSourceLabel(x){
  const stationRate=chargingRateSummary(x?.chargingRate);
  if(stationRate){
    if(x?.officialSupplemental)return "本站費率・業者官方站點";
    if(x?.road==="tdx")return "本站費率・TDX／站點資料";
    return "本站費率・站點資料";
  }
  const key=chargingOperatorProfile(x)?.key||"";
  if(key==="upower"||key==="evoasis"||key==="evalue")return "業者官方方案・實際依站點／App";
  if(key==="icharging")return "官方費率／會員方案・實際依站點／App";
  if(key==="tail")return "業者官方規則・實際依現場／App";
  if(key==="tesla")return "動態費率・Tesla App／車機確認";
  return "";
}
function chargingRateCheckedLabel(x){
  const value=chargingOperatorProfile(x)?.rateCheckedAt||"";
  if(!value)return "";
  const d=new Date(value+"T00:00:00");
  if(Number.isNaN(d.getTime()))return "";
  return "官方費率核對 "+new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"numeric",day:"numeric"}).format(d);
}
function chargingPriorityOfficialUrl(x){
  const profile=chargingOperatorProfile(x);
  if(!profile||!CHARGING_MAJOR_KEYS.includes(profile.key))return "";
  return profile.stationMap||profile.official||profile.rateGuide||"";
}
function chargingPriorityOfficialLabel(x){
  const key=chargingOperatorProfile(x)?.key||"";
  if(key==="tesla")return "Tesla 官方";
  if(key==="evoasis")return "EVOASIS 官方";
  if(key==="upower")return "U-POWER 官方";
  if(key==="tail")return "TAIL 官方";
  if(key==="evalue")return "EVALUE 官方";
  if(key==="icharging")return "iCharging 官方";
  return "官方資訊";
}
function chargingDetailMarkup(x){
  const profile=chargingOperatorProfile(x);
  const official=x.officialSourceURL||profile?.stationMap||profile?.official||x.operatorWebURL||"";
  const rows=[
    ["營業時間",x.serviceTime],
    ["充電費率",x.chargingRate],
    ["停車費率",x.parkingRate],
    [x.officialSupplemental&&Number(x.sitePowerKw)>0?"站點總設備功率":"",x.officialSupplemental&&Number(x.sitePowerKw)>0?Number(x.sitePowerKw).toLocaleString("zh-TW")+" kW":""],
    ["聯絡電話",x.telephone||x.operatorTelephone],
    [profile&&x.operator&&profile.brand!==x.operator?"TDX 登記業者":"",profile&&x.operator&&profile.brand!==x.operator?x.operator:""],
    ["狀態更新",x.statusUpdatedAt?formatTime(x.statusUpdatedAt):""],
    [profile?.chargeHint?"官方充電方式":"",profile?.chargeHint||""],
    [profile?.rateHint?"官方費率提示":"",profile?.rateHint||""],
    [chargingRateSourceLabel(x)?"費率來源":"",chargingRateSourceLabel(x)],
    [chargingRateCheckedLabel(x)?"費率核對":"",chargingRateCheckedLabel(x)],
    [profile?.networkHint?"官方服務提示":"",profile?.networkHint||""],
    [chargingCapabilities(x).length?"官方支援功能":"",chargingCapabilities(x).map(c=>c.label).join("、")]
  ].filter(row=>row[0]&&row[1]);
  if(!rows.length&&!official&&!x.description)return "";
  const links=[
    official?'<a href="'+esc(official)+'" target="_blank" rel="noopener noreferrer">'+(x.officialSourceURL?'此站官方資料':'官方站點')+'</a>':"",
    profile?.chargeGuide?'<a href="'+esc(profile.chargeGuide)+'" target="_blank" rel="noopener noreferrer">怎麼充</a>':"",
    profile?.rateGuide?'<a href="'+esc(profile.rateGuide)+'" target="_blank" rel="noopener noreferrer">官方費率</a>':"",
    profile?.ios?'<a href="'+esc(profile.ios)+'" target="_blank" rel="noopener noreferrer">iPhone App</a>':"",
    profile?.android?'<a href="'+esc(profile.android)+'" target="_blank" rel="noopener noreferrer">Android App</a>':"",
    ...chargingCapabilities(x).map(c=>'<a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer">'+esc(c.label)+' 官方說明</a>')
  ].filter(Boolean).join("");
  return '<details class="charging-more"><summary>站點詳細資訊</summary>'+
    (rows.length?'<div class="charging-detail-grid">'+rows.map(row=>'<div><small>'+esc(row[0])+'</small><b>'+esc(chargingDisplayText(row[1]))+'</b></div>').join("")+'</div>':"")+
    (x.description?'<p>'+esc(x.description)+'</p>':"")+
    (x.officialSource?'<div class="charging-source-note">'+esc(x.officialSource)+(x.officialSupplemental?' · 靜態站點資料，不代表即時空槍':'')+'</div>':"")+
    (links?'<div class="charging-operator-links">'+links+'</div>':"")+
    '</details>';
}
function ensureChargingComparePanel(){
  if($("#chargingComparePanel"))return;
  const source=$(".charging-source");
  if(!source)return;
  source.insertAdjacentHTML("beforebegin",
    '<section class="charging-compare" id="chargingComparePanel">'+
      '<div class="charging-compare-head"><div><span class="mini-label">NEARBY COMPARE</span><b>附近站比較</b><small>空槍・距離・功率・目前費率一次看</small></div><span id="chargingCompareState">等待定位</span></div>'+
      '<div class="charging-compare-kwh" id="chargingCompareKwh" aria-label="預計充電量">'+
        '<span>預計充電量</span>'+
        [20,40,50,60].map(kwh=>'<button type="button" data-charge-kwh="'+kwh+'" aria-pressed="'+(kwh===50)+'">'+kwh+' kWh</button>').join("")+
      '</div>'+
      '<div class="charging-compare-sort" id="chargingCompareSort" aria-label="比較排序">'+
        [['nearby','距離'],['available','空槍'],['power','功率'],['price','已知費率']].map(item=>'<button type="button" data-charge-compare-sort="'+item[0]+'" aria-pressed="'+(item[0]==='nearby')+'">'+item[1]+'</button>').join("")+
      '</div>'+
      '<div class="charging-compare-summary" id="chargingCompareSummary" hidden></div>'+
      '<div class="charging-compare-grid" id="chargingCompareGrid"></div>'+
    '</section>'
  );
}
function chargingCompareRows(rows){
  if(!state.chargingOrigin)return [];
  const confirmed=(rows||[]).filter(x=>{
    const d=chargingDistanceKm(x),counts=chargingLiveCounts(x);
    return d!=null&&x?.road==="tdx"&&!x?.liveStale&&counts.total>0;
  }).sort((a,b)=>chargingDistanceKm(a)-chargingDistanceKm(b)).slice(0,12);
  const sort=state.chargingCompareSort||"nearby";
  confirmed.sort((a,b)=>{
    const ca=chargingLiveCounts(a),cb=chargingLiveCounts(b);
    const da=chargingDistanceKm(a),db=chargingDistanceKm(b);
    if(sort==="available"){
      if(cb.available!==ca.available)return cb.available-ca.available;
      const ra=ca.total>0?ca.available/ca.total:0,rb=cb.total>0?cb.available/cb.total:0;
      if(rb!==ra)return rb-ra;
    }else if(sort==="power"){
      const pa=chargingPowerKw(a),pb=chargingPowerKw(b);
      if(pb!==pa)return pb-pa;
    }else if(sort==="price"){
      const ra=chargingCurrentRateInfo(a),rb=chargingCurrentRateInfo(b);
      const va=ra?.current&&Number.isFinite(Number(ra.value))?Number(ra.value):Infinity;
      const vb=rb?.current&&Number.isFinite(Number(rb.value))?Number(rb.value):Infinity;
      if(va!==vb)return va-vb;
    }
    if((ca.available>0)!==(cb.available>0))return Number(cb.available>0)-Number(ca.available>0);
    return (da??Infinity)-(db??Infinity);
  });
  return confirmed.slice(0,3);
}
function chargingCompareHighlights(compare){
  const result=new Map((compare||[]).map(row=>[chargingKey(row),[]]));
  if(!(compare||[]).length)return result;
  const distances=compare.map(chargingDistanceKm).filter(v=>v!=null);
  const available=compare.map(x=>chargingLiveCounts(x).available);
  const ratios=compare.map(x=>{const c=chargingLiveCounts(x);return c.total>0?c.available/c.total:0;});
  const powers=compare.map(chargingPowerKw);
  const knownRates=compare.map(x=>({row:x,rate:chargingCurrentRateInfo(x)})).filter(x=>x.rate?.current&&Number.isFinite(Number(x.rate.value)));
  const updateTimes=compare.map(x=>Date.parse(x?.statusUpdatedAt||"")).filter(Number.isFinite);
  const minDistance=distances.length?Math.min(...distances):null;
  const maxAvailable=Math.max(...available);
  const maxRatio=Math.max(...ratios);
  const maxPower=Math.max(...powers);
  const minRate=knownRates.length?Math.min(...knownRates.map(x=>Number(x.rate.value))):null;
  const newestUpdate=updateTimes.length?Math.max(...updateTimes):null;
  compare.forEach(row=>{
    const tags=result.get(chargingKey(row));
    const distance=chargingDistanceKm(row),count=chargingLiveCounts(row),power=chargingPowerKw(row),rate=chargingCurrentRateInfo(row);
    if(minDistance!=null&&distance!=null&&Math.abs(distance-minDistance)<0.01)tags.push("最近");
    if(count.available===maxAvailable&&maxAvailable>0)tags.push("空槍最多");
    if(count.total>0&&count.available/count.total===maxRatio&&maxRatio>0)tags.push("空槍率最高");
    if(power===maxPower&&maxPower>0)tags.push("功率最高");
    const updatedAt=Date.parse(row?.statusUpdatedAt||"");
    if(newestUpdate!=null&&Number.isFinite(updatedAt)&&updatedAt===newestUpdate)tags.push("資料最新");
    if(minRate!=null&&rate?.current&&Number(rate.value)===minRate)tags.push("此 3 站已知費率最低");
  });
  return result;
}
function chargingCompareSummary(compare,kwh){
  const known=(compare||[]).map(row=>({row,rate:chargingCurrentRateInfo(row)}))
    .filter(item=>item.rate?.current&&Number.isFinite(Number(item.rate.value)));
  if(!known.length)return {text:"這 3 站目前沒有可安全換算的固定時段價",known:0};
  if(known.length===1)return {text:"其中 1 站目前費率可估；其他站仍需看 App／站點當下價格",known:1};
  const values=known.map(item=>Number(item.rate.value)),min=Math.min(...values),max=Math.max(...values);
  const diff=Math.round((max-min)*kwh);
  if(Math.abs(max-min)<0.001)return {text:known.length+" 站可估價 · 目前可判讀費率相同",known:known.length};
  return {text:known.length+" 站可估價 · "+min+"–"+max+" 元/度 · 充 "+kwh+" kWh 費用差約 "+money(diff)+" 元",known:known.length};
}
function renderChargingCompare(rows){
  ensureChargingComparePanel();
  const panel=$("#chargingComparePanel"),grid=$("#chargingCompareGrid"),stateEl=$("#chargingCompareState");
  if(!panel||!grid||!stateEl)return;
  if(!state.chargingOrigin){
    stateEl.textContent="尚未定位";
    grid.innerHTML='<button class="charging-compare-locate" data-charge-compare-locate type="button"><b>取得位置開始比較</b><small>直接比較附近 3 站，不需要另外輸入地址</small></button>';
    $("[data-charge-compare-locate]",grid)?.addEventListener("click",()=>$("#chargingFindNow")?.click());
    return;
  }
  const compare=chargingCompareRows(rows);
  const kwhRoot=$("#chargingCompareKwh"),sortRoot=$("#chargingCompareSort"),summaryEl=$("#chargingCompareSummary"),kwh=Number(state.chargingCompareKwh)||50;
  if(kwhRoot){
    $$("[data-charge-kwh]",kwhRoot).forEach(button=>{
      const active=Number(button.dataset.chargeKwh)===kwh;
      button.setAttribute("aria-pressed",String(active));
      button.onclick=()=>{
        state.chargingCompareKwh=Number(button.dataset.chargeKwh)||50;
        renderChargingCompare(rows);
      };
    });
  }
  if(sortRoot){
    $$("[data-charge-compare-sort]",sortRoot).forEach(button=>{
      const active=button.dataset.chargeCompareSort===(state.chargingCompareSort||"nearby");
      button.setAttribute("aria-pressed",String(active));
      button.onclick=()=>{
        state.chargingCompareSort=button.dataset.chargeCompareSort||"nearby";
        renderChargingCompare(rows);
      };
    });
  }
  stateEl.textContent=compare.length?"附近 "+compare.length+" 站":"附近暫無可比較即時站";
  if(!compare.length){
    if(summaryEl){summaryEl.hidden=true;summaryEl.textContent="";}
    grid.innerHTML='<div class="charging-compare-empty"><b>附近沒有可確認的即時槍況</b><small>可以先放寬篩選，或查看下方所有站點。</small></div>';
    return;
  }
  if(summaryEl){
    const summary=chargingCompareSummary(compare,kwh);
    summaryEl.hidden=false;
    const sortLabel={nearby:"距離",available:"空槍",power:"功率",price:"已知費率"}[state.chargingCompareSort||"nearby"]||"距離";
    summaryEl.innerHTML='<b>'+esc(summary.text)+'</b><small>附近候選池最多 12 站，目前依「'+esc(sortLabel)+'」選出 3 站；會員資格、指定站與特殊費率仍以業者官方為準。</small>';
  }
  const highlights=chargingCompareHighlights(compare);
  grid.innerHTML=compare.map(x=>{
    const counts=chargingLiveCounts(x),distance=chargingDistanceKm(x),kw=chargingPowerKw(x),rate=chargingCurrentRateInfo(x),fresh=chargingLiveAgeLabel(x.statusUpdatedAt),trust=chargingTrustInfo(x);
    const lat=Number(x.lat),lon=Number(x.lon),hasCoords=Number.isFinite(lat)&&Number.isFinite(lon);
    const destination=encodeURIComponent(hasCoords?(lat+","+lon):(x.name+" "+x.location)),key=chargingKey(x);
    const estimate=rate?.current&&Number.isFinite(Number(rate.value))?Math.round(Number(rate.value)*kwh):null;
    const objective=highlights.get(key)||[];
    return '<article class="charging-compare-card '+(counts.available>0?'has-open':'is-full')+'">'+
      '<div class="charging-compare-title"><div><b>'+esc(x.name)+'</b><small>'+esc(chargingOperatorLabel(x))+'</small></div><strong>'+esc(distance<10?distance.toFixed(1):Math.round(distance))+' km</strong></div>'+
      (objective.length?'<div class="charging-compare-objective">'+objective.map(tag=>'<em>'+esc(tag)+'</em>').join("")+'</div>':"")+
      '<div class="charging-compare-badges"><span class="'+esc(trust.level)+'">'+esc(trust.label)+'</span>'+(kw>=100?'<span class="fast">'+esc(Math.round(kw)+" kW 快充")+'</span>':"")+(counts.available>0?'<span class="open">'+counts.available+' 空槍</span>':'<span class="full">目前無空槍</span>')+'</div>'+
      '<div class="charging-compare-metrics">'+
        '<span class="'+(counts.available>0?'open':'full')+'"><small>空槍</small><b>'+counts.available+'/'+counts.total+' · '+Math.round((counts.total>0?counts.available/counts.total:0)*100)+'%</b></span>'+
        '<span><small>功率</small><b>'+(kw>0?esc(Math.round(kw)+" kW"):"未提供")+'</b></span>'+
        '<span class="rate"><small>'+(rate?.current?'目前費率':'費率')+'</small><b>'+esc(rate?.label||"依站點／App")+'</b></span>'+
      '</div>'+
      (estimate!=null?'<div class="charging-compare-estimate"><span>充 '+kwh+' kWh 約</span><b>'+money(estimate)+' 元</b><small>僅依目前可判讀電價估算，不含停車費或其他費用</small></div>':"")+
      '<div class="charging-compare-foot"><small>'+esc(fresh)+(rate?.detail?' · '+esc(rate.detail):"")+'</small><div class="charging-compare-actions">'+
        '<button data-charge-compare-detail="'+esc(key)+'" type="button">看站點</button>'+
        (chargingPriorityOfficialUrl(x)?'<button data-charge-compare-official="'+esc(chargingPriorityOfficialUrl(x))+'" type="button">官方</button>':"")+
        '<button class="go" data-charge-compare-go="'+destination+'" type="button">導航</button></div></div>'+
    '</article>';
  }).join("");
  $$("[data-charge-compare-detail]",grid).forEach(b=>b.onclick=()=>{
    const target=$('[data-charging-key="'+CSS.escape(b.dataset.chargeCompareDetail)+'"]');
    target?.scrollIntoView({behavior:"smooth",block:"center"});
    target?.classList.add("charging-focus");
    setTimeout(()=>target?.classList.remove("charging-focus"),1800);
  });
  $$("[data-charge-compare-official]",grid).forEach(b=>b.onclick=()=>window.open(b.dataset.chargeCompareOfficial,"_blank","noopener"));
  $$("[data-charge-compare-go]",grid).forEach(b=>b.onclick=()=>{
    const apple=/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent||"");
    window.open(apple?"https://maps.apple.com/?daddr="+b.dataset.chargeCompareGo+"&dirflg=d":"https://www.google.com/maps/dir/?api=1&destination="+b.dataset.chargeCompareGo+"&travelmode=driving","_blank","noopener");
  });
}
function syncChargingOperatorOptions(){
  const select=$("#chargingOperator");
  if(!select)return;
  const byOperator=new Map();
  (state.charging||[]).forEach(row=>{
    const value=String(row?.operator||"").trim();
    if(!value||value==="TDX")return;
    if(!byOperator.has(value))byOperator.set(value,row);
  });
  const rows=[...byOperator.entries()].map(([value,row])=>({
    value,
    label:chargingOperatorLabel(row),
    major:chargingMajorRank(row)
  })).sort((a,b)=>a.major-b.major||a.label.localeCompare(b.label,"zh-Hant")||a.value.localeCompare(b.value,"zh-Hant"));
  const signature=rows.map(row=>row.value+"|"+row.label).join("\n");
  if(select.dataset.operatorSignature!==signature){
    select.innerHTML='<option value="all">全部業者</option>'+rows.map(row=>
      '<option value="'+esc(row.value)+'">'+esc(row.label)+(row.label!==row.value?'｜'+esc(row.value):'')+'</option>'
    ).join("");
    select.dataset.operatorSignature=signature;
  }
  if(state.chargingOperator!=="all"&&rows.some(row=>row.value===state.chargingOperator))select.value=state.chargingOperator;
  else{
    state.chargingOperator="all";
    select.value="all";
  }
}
function renderCharging(){
  const root=$("#chargingList");
  if(!root)return;
  syncChargingOperatorOptions();
  renderChargingPriorityPanel();
  renderChargingFirstLayerStatus();

  const q=($("#chargingSearch")?.value||"").trim().toLowerCase();
  const candidateRows=state.charging
    .filter(x=>(state.road==="all"||x.road===state.road))
    .filter(x=>state.chargingCity==="all"||x.city===state.chargingCity)
    .filter(chargingDirectionMatch)
    .filter(x=>state.chargingConnector==="all"||chargingConnectors(x).includes(state.chargingConnector))
    .filter(x=>chargingPowerKw(x)>=Number(state.chargingPower||0))
    .filter(x=>state.chargingOperator==="all"||x.operator===state.chargingOperator)
    .filter(chargingMajorMatch)
    .filter(chargingQuickMatch)
    .filter(x=>!state.chargingFavoritesOnly||state.chargingFavorites.includes(chargingKey(x)))
    .filter(x=>!q||chargingOperatorSearchText(x).includes(q));
  let rows=state.chargingAvailableOnly
    ? candidateRows.filter(x=>x.road==="tdx"&&!x.liveStale&&chargingLiveCounts(x).available>0)
    : candidateRows;

  rows.sort((a,b)=>{
    if(state.chargingSort!=="nearby"&&state.chargingQuick==="priorityfast"){
      const trusted=chargingPriorityFastSort(a,b);
      if(trusted)return trusted;
    }
    if(state.chargingSort==="nearby"){
      const da=chargingDistanceKm(a),db=chargingDistanceKm(b);
      if(da!=null||db!=null){
        if(da==null)return 1;
        if(db==null)return -1;
        if(Math.abs(da-db)>.01)return da-db;
      }
    }
    const fa=state.chargingFavorites.includes(chargingKey(a)),fb=state.chargingFavorites.includes(chargingKey(b));
    if(fa!==fb)return Number(fb)-Number(fa);
    const rank=chargingSortRank(a)-chargingSortRank(b);
    if(rank)return rank;
    const major=chargingMajorRank(a)-chargingMajorRank(b);
    if(major)return major;
    const available=chargingLiveCounts(b).available-chargingLiveCounts(a).available;
    if(available)return available;
    const power=chargingPowerKw(b)-chargingPowerKw(a);
    if(power)return power;
    return String(a.name||"").localeCompare(String(b.name||""),"zh-Hant");
  });

  renderChargingCompare(rows);

  const resultCount=rows.length;
  const shown=rows.slice(0,120);
  const favCount=state.chargingFavorites.length;
  if($("#chargingFavoriteCount"))$("#chargingFavoriteCount").textContent=favCount;
  if($("#chargingFavoritesOnly"))$("#chargingFavoritesOnly").setAttribute("aria-pressed",String(state.chargingFavoritesOnly));
  if($("#chargingAvailableOnly")){
    $("#chargingAvailableOnly").setAttribute("aria-pressed",String(state.chargingAvailableOnly));
    const label=$("#chargingAvailableOnly").querySelector("b");
    if(label)label.textContent=state.chargingAvailableOnly?"只顯示有空槍":"只看有空槍";
  }
  if($("#chargingPriorityFast"))$("#chargingPriorityFast").setAttribute("aria-pressed",String(state.chargingQuick==="priorityfast"));
  if($("#chargingNearby")){
    $("#chargingNearby").setAttribute("aria-pressed",String(state.chargingSort==="nearby"));
    const label=$("#chargingNearby").querySelector("b");
    if(label)label.textContent=state.chargingSort==="nearby"?"依距離排序":"附近排序";
  }
  $$("[data-charge-quick]").forEach(b=>b.classList.toggle("active",b.dataset.chargeQuick===state.chargingQuick));
  $$("[data-charge-major]").forEach(b=>b.classList.toggle("active",b.dataset.chargeMajor===state.chargingMajor));
  if($("#chargingResultSummary")){
    const suffix=resultCount>shown.length?" · 先顯示前 "+shown.length+" 站":"";
    const context=[];
    if(state.chargingSort==="nearby")context.push("附近排序");
    if(state.chargingAvailableOnly)context.push("只看空槍");
    const cityText=$("#chargingCity")?.selectedOptions?.[0]?.textContent;
    if(state.chargingCity!=="all"&&cityText)context.push(cityText);
    if(state.chargingQuick==="fast")context.push("100 kW+");
    if(state.chargingQuick==="priorityfast")context.push("主力空槍快充");
    if(state.chargingQuick==="ccs2")context.push("CCS2");
    if(state.chargingQuick==="tesla")context.push("Tesla");
    if(state.chargingQuick==="ev2")context.push("電小二");
    if(state.chargingMajor!=="all"){
      const majorProfile=CHARGING_OPERATOR_PROFILES.find(x=>x.key===state.chargingMajor);
      if(majorProfile)context.push(majorProfile.brand);
    }
    if(state.chargingFavoritesOnly)context.push("只看收藏");
    if(state.road!=="all")context.push("國 "+state.road);
    if(state.chargingDirection!=="all")context.push({south:"南下",north:"北上",shared:"雙向共用"}[state.chargingDirection]||state.chargingDirection);
    if(state.chargingConnector!=="all")context.push(state.chargingConnector);
    if(Number(state.chargingPower)>0)context.push(state.chargingPower+" kW+");
    if(state.chargingOperator!=="all")context.push(state.chargingOperator);
    if(q)context.push("搜尋「"+q+"」");
    $("#chargingResultSummary").textContent=resultCount===0&&state.chargingAvailableOnly
      ?"目前沒有可確認空槍"+(state.chargingSort==="nearby"?" · 可改看附近站點":"")
      :resultCount+" 站符合"+suffix+(context.length?" · "+context.join(" · "):"");
    const clear=$("#chargingResultClear");
    if(clear)clear.hidden=context.length===0;
    $("#chargingResultBar")?.classList.toggle("has-filter",context.length>0);
  }
  if($("#chargingFindNow"))$("#chargingFindNow").setAttribute("aria-pressed",String(state.chargingSort==="nearby"&&state.chargingAvailableOnly));

  const unverifiedRows=state.chargingAvailableOnly?candidateRows.filter(x=>x?.officialSupplemental||(x.road==="tdx"&&(x.liveStale||chargingLiveCounts(x).total===0))):[];
  const unverifiedBrands=[...new Set(unverifiedRows.map(x=>chargingOperatorProfile(x)?.brand).filter(Boolean))].slice(0,3);
  const unverifiedScope=state.chargingSort==="nearby"?"附近":"目前篩選";
  const unverifiedNote=unverifiedRows.length
    ? unverifiedScope+"另有 "+unverifiedRows.length+" 站沒有可驗證的即時槍況"+(unverifiedBrands.length?"，包含 "+unverifiedBrands.join("、"):"")+"；其中業者官方已列站不代表不能充。"
    : "";

  root.innerHTML=shown.length?shown.map(x=>{
    const key=chargingKey(x);
    const favorite=state.chargingFavorites.includes(key);
    const lat=Number(x.lat),lon=Number(x.lon);
    const hasCoords=Number.isFinite(lat)&&Number.isFinite(lon);
    const destination=encodeURIComponent(hasCoords?(lat+","+lon):(x.name+" "+x.location));
    const tdx=x.road==="tdx";
    const supplemental=Boolean(x.officialSupplemental);
    const distance=chargingDistanceKm(x);
    const meta=[tdx||supplemental?x.cityName:x.direction,chargingOperatorLabel(x)].filter(Boolean).join(" · ");
    const routeTag=supplemental?"業者官方":(tdx?"TDX":("國 "+x.road));
    const availableNow=tdx&&!x.liveStale&&chargingLiveCounts(x).available>0;
    const profile=chargingOperatorProfile(x);
    const majorNetwork=CHARGING_MAJOR_KEYS.includes(profile?.key||"");
    const priorityNetwork=CHARGING_PRIORITY_KEYS.includes(profile?.key||"");
    const powerDecision=priorityNetwork?chargingDecisionPowerLabel(x):chargingPowerLabel(x);
    const rateDecision=majorNetwork?chargingDecisionRateLabel(x):chargingRateSummary(x.chargingRate);
    const rateSource=majorNetwork?chargingRateSourceLabel(x):"";
    const rateChecked=majorNetwork?chargingRateCheckedLabel(x):"";
    const priorityFastReason=state.chargingQuick==="priorityfast"?chargingPriorityFastReason(x):"";
    return '<article class="list-item charging-item '+(availableNow?'is-available ':'')+(majorNetwork?'is-major-network':'')+(priorityNetwork?' is-priority-network':'')+'" data-charging-key="'+esc(key)+'">'+
      '<div class="list-head">'+
        '<div><div class="charging-title-line"><h3>'+esc(x.name)+'</h3></div><div class="meta">'+esc(meta)+'</div></div>'+
        '<span class="route-tag">'+esc(routeTag)+'</span>'+
      '</div>'+
      chargingTrustMarkup(x)+
      chargingDecisionStripMarkup(x)+
      chargingStatusMarkup(x)+
      (priorityFastReason?'<div class="charging-match-reason">'+esc(priorityFastReason)+'</div>':"")+
      '<div class="specs charging-facts">'+
        (supplemental&&Number(x.spaces)<=0?'<span>席次未提供</span>':'<span>'+esc(x.spaces)+(supplemental?' 席':(tdx?' 充電點':' 車位'))+'</span>')+
        (rateDecision?'<span class="charging-rate">'+esc(rateDecision)+'</span>':"")+
        chargingConnectors(x).map(c=>'<span class="charging-connector">'+esc(c)+'</span>').join("")+
        chargingCapabilities(x).map(c=>'<span class="charging-capability">'+esc(c.label)+'</span>').join("")+
      '</div>'+
      '<div class="location-line"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note&&!tdx?" · "+esc(x.note):"")+'</span></div>'+
      chargingDetailMarkup(x)+
      '<div class="item-actions charging-nav-actions">'+
        '<button class="go charging-go-primary" data-charge-go="'+destination+'">直接導航</button>'+
        (chargingPriorityOfficialUrl(x)?'<button class="charging-official-primary" data-charge-official-url="'+esc(chargingPriorityOfficialUrl(x))+'">'+esc(chargingPriorityOfficialLabel(x))+'</button>':"")+
        '<button class="charging-map-choice" data-charge-nav-toggle="'+esc(key)+'">選地圖</button>'+
        '<button class="favorite-action '+(favorite?'active':'')+'" data-charge-favorite="'+esc(key)+'" aria-pressed="'+favorite+'">'+(favorite?'已收藏':'收藏')+'</button>'+
        (!tdx&&["1","3","5"].includes(String(x.road))?'<button data-camera-road="'+esc(x.road)+'">CCTV</button>':"")+
      '</div>'+
      '<div class="charging-nav-menu" data-charge-nav-menu="'+esc(key)+'" hidden>'+
        '<button data-charge-google="'+destination+'">Google Maps</button>'+
        '<button data-charge-apple="'+destination+'">Apple 地圖</button>'+
      '</div>'+
    '</article>';
  }).join(""):(state.chargingQuick==="priorityfast"
    ? '<div class="empty charging-empty charging-priority-fast-empty"><b>目前沒有同時符合的主力空槍快充</b><p>條件是 EVOASIS／U-POWER／TAIL／Tesla，且 TDX 可確認有空槍、資料未逾時、單槍功率至少 100 kW。可以先放寬其中一個條件。</p><div class="charging-empty-actions"><button class="charging-empty-primary" data-charge-relax="available">改看所有空槍</button><button class="charging-empty-secondary" data-charge-relax="fast">改看 100 kW+</button></div><small>未知槍況、逾時資料與未知功率不會混進主力快充結果。</small></div>'
    : state.chargingAvailableOnly
      ? '<div class="empty charging-empty"><b>目前沒有可確認的即時空槍</b><p>'+(unverifiedNote?esc(unverifiedNote)+" ":"")+'可能真的滿位，也可能業者尚未把即時槍況回傳 TDX。COLA GO 不會把未知狀態誤標成「現在可用」。</p><button class="charging-empty-primary" data-charge-show-nearby>改看附近充電站</button><small>保留距離排序，只取消「只看空槍」</small></div>'
      : '<div class="empty charging-empty"><b>沒有符合的充電站</b><p>可以清除篩選，或改用搜尋站名、地址、業者品牌。</p><button class="charging-empty-secondary" data-charge-clear-filters>清除充電篩選</button></div>');

  $$("[data-charge-favorite]",root).forEach(b=>b.onclick=()=>{
    const key=b.dataset.chargeFavorite;
    const i=state.chargingFavorites.indexOf(key);
    if(i>=0)state.chargingFavorites.splice(i,1); else state.chargingFavorites.push(key);
    saveChargingFavorites();
    renderCharging();
  });
  $$("[data-charge-nav-toggle]",root).forEach(b=>b.onclick=()=>{
    const menus=$$("[data-charge-nav-menu]",root);
    const target=menus.find(menu=>menu.dataset.chargeNavMenu===b.dataset.chargeNavToggle);
    menus.forEach(menu=>{if(menu!==target)menu.hidden=true;});
    if(target)target.hidden=!target.hidden;
  });
  $$("[data-charge-go]",root).forEach(b=>b.onclick=()=>{
    const apple=/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent||"");
    const url=apple
      ?"https://maps.apple.com/?daddr="+b.dataset.chargeGo+"&dirflg=d"
      :"https://www.google.com/maps/dir/?api=1&destination="+b.dataset.chargeGo+"&travelmode=driving";
    window.open(url,"_blank","noopener");
  });
  $$("[data-charge-google]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/dir/?api=1&destination="+b.dataset.chargeGoogle+"&travelmode=driving","_blank","noopener"));
  $$("[data-charge-apple]",root).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?daddr="+b.dataset.chargeApple+"&dirflg=d","_blank","noopener"));
  $$("[data-charge-official-url]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.chargeOfficialUrl,"_blank","noopener"));
  $$("[data-camera-road]",root).forEach(b=>b.onclick=()=>openCCTVForRoad(b.dataset.cameraRoad));
  $("[data-charge-show-nearby]",root)?.addEventListener("click",()=>{
    state.chargingAvailableOnly=false;
    state.chargingSort="nearby";
    renderCharging();
    toast("已改看附近充電站");
  });
  $("[data-charge-relax]",root).forEach(button=>button.addEventListener("click",()=>{
    const next=button.dataset.chargeRelax==="available"?"available":"fast";
    state.chargingQuick=next;
    state.chargingAvailableOnly=false;
    renderCharging();
    toast(next==="available"?"已改看所有可確認空槍":"已改看 100 kW+ 充電站");
  }));
  $("[data-charge-clear-filters]",root)?.addEventListener("click",()=>$("#resetChargingFilters")?.click());
}

const TAIWAN_CITIES=[{"code":"Taipei","name":"臺北市"},{"code":"NewTaipei","name":"新北市"},{"code":"Taoyuan","name":"桃園市"},{"code":"Taichung","name":"臺中市"},{"code":"Tainan","name":"臺南市"},{"code":"Kaohsiung","name":"高雄市"},{"code":"Keelung","name":"基隆市"},{"code":"Hsinchu","name":"新竹市"},{"code":"HsinchuCounty","name":"新竹縣"},{"code":"MiaoliCounty","name":"苗栗縣"},{"code":"ChanghuaCounty","name":"彰化縣"},{"code":"NantouCounty","name":"南投縣"},{"code":"YunlinCounty","name":"雲林縣"},{"code":"Chiayi","name":"嘉義市"},{"code":"ChiayiCounty","name":"嘉義縣"},{"code":"PingtungCounty","name":"屏東縣"},{"code":"YilanCounty","name":"宜蘭縣"},{"code":"HualienCounty","name":"花蓮縣"},{"code":"TaitungCounty","name":"臺東縣"},{"code":"PenghuCounty","name":"澎湖縣"},{"code":"KinmenCounty","name":"金門縣"},{"code":"LienchiangCounty","name":"連江縣"}];
const TDX_PARKING_BASE="https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/CarPark";

function parkingCityName(code){
  return TAIWAN_CITIES.find(x=>x.code===code)?.name||"全台灣";
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
  if(state.parkingCity==="Tainan"&&["live","stale"].includes(state.parkingLive?.status)){
    return (state.parkingLive.items||[]).map(x=>({
      id:String(x.id||x.code||x.name),
      city:"Tainan",
      name:x.name,
      town:x.zone||"",
      address:x.address||"",
      fare:x.chargeFee||"",
      total:Number(x.carTotal||0),
      available:x.car==null?null:Number(x.car),
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

  grid.innerHTML=TAIWAN_CITIES.map(x=>
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
    root.innerHTML='<div class="parking-national-intro"><b>全台停車快速入口</b><p>選擇縣市後，可使用 Google Maps／Apple 地圖快速尋找附近停車場；有官方即時資料時會同步顯示。</p><div class="item-actions"><button class="go" data-national-map="google">Google Maps 找附近</button><button data-national-map="apple">Apple 地圖找附近</button></div></div>';
  }else if(city==="Tainan"){
    const rows=parkingSelectedRows().filter(x=>!query||[x.name,x.town,x.address].join(" ").toLowerCase().includes(query)).sort((a,b)=>(b.available??-1)-(a.available??-1));
    const tainanLive=state.parkingLive?.status==="live";
    const tainanStale=state.parkingLive?.status==="stale";
    $("#parkingLiveTime").textContent=tainanLive?(state.parkingLive.updatedAt||"官方即時"):tainanStale?(state.parkingLive.updatedAt||"最後可用"):"官方即時暫不可用";
    $("#parkingScopeStatus").textContent=tainanLive?"已接臺南市 TDX 即時剩餘車位":tainanStale?"TDX 更新暫時中斷，顯示最後可用資料":"仍可使用全台地圖搜尋";
    root.innerHTML=rows.length?rows.map(renderParkingCard).join(""):'<div class="empty"><b>'+(query?"找不到符合的臺南停車場":"臺南官方即時資料暫時無法取得")+'</b><p>即時車位資料暫時無法取得，仍可使用 Google Maps 或 Apple 地圖找停車場。</p></div>';
  }else if(state.parkingRemote.status==="loading"&&state.parkingRemote.city===city){
    $("#parkingLiveTime").textContent="讀取官方資料中";
    $("#parkingScopeStatus").textContent="正在讀取 "+cityName+" 官方停車資料";
    root.innerHTML='<div class="empty"><b>正在讀取 '+esc(cityName)+' 停車資料</b><p>官方停車資料暫時無法取得時，仍可使用地圖搜尋附近停車場。</p></div>';
  }else if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===city){
    const rows=parkingSelectedRows().filter(x=>!query||[x.name,x.town,x.address,x.fare].join(" ").toLowerCase().includes(query));
    $("#parkingLiveTime").textContent=state.parkingRemote.updatedAt||"官方資料";
    $("#parkingScopeStatus").textContent="官方停車場資料 · "+state.parkingRemote.items.length+" 筆";
    root.innerHTML=rows.length?rows.map(renderParkingCard).join(""):'<div class="empty"><b>找不到符合的停車場</b><p>換個停車場名稱、行政區或地址試試。</p></div>';
  }else{
    $("#parkingLiveTime").textContent="地圖搜尋";
    $("#parkingScopeStatus").textContent=cityName+" 可直接搜尋與導航";
    root.innerHTML='<div class="market-empty"><b>'+esc(cityName)+' 停車快速搜尋</b><p>可直接開啟地圖搜尋 '+esc(cityName)+' 停車場並開始導航。</p><div class="item-actions"><button class="go" data-city-map="google">Google Maps</button><button data-city-map="apple">Apple 地圖</button></div></div>';
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

function cctvCoordinate(value){
  return value===null||value===undefined||String(value).trim()===""?null:Number(value);
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
    lat:cctvCoordinate(x.PositionLat??x.positionLat??x.lat),
    lon:cctvCoordinate(x.PositionLon??x.positionLon??x.lon)
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

const CCTV_DIRECTIONS={all:"全部方向",north:"北上",south:"南下",east:"東向",west:"西向",other:"其他"};
function cctvDirectionKey(value){
  const text=String(value??"").trim().toUpperCase();
  if(/^(N|NB|NORTH|NORTHBOUND|北|北上|北向)$/.test(text))return "north";
  if(/^(S|SB|SOUTH|SOUTHBOUND|南|南下|南向)$/.test(text))return "south";
  if(/^(E|EB|EAST|EASTBOUND|東|東向|東行)$/.test(text))return "east";
  if(/^(W|WB|WEST|WESTBOUND|西|西向|西行)$/.test(text))return "west";
  return "other";
}
function cctvDirectionLabel(value){
  const key=cctvDirectionKey(value);
  return key==="other"?(String(value??"").trim()||"方向未提供"):CCTV_DIRECTIONS[key];
}
function cctvMileNumber(value){
  const match=String(value??"").trim().match(/^(\d+(?:\.\d+)?)\s*(?:K|公里)?(?:\s*\+\s*(\d+))?$/i);
  return match?Number(match[1])+Number(match[2]||0)/1000:Infinity;
}
function cctvMileLabel(value){
  const number=cctvMileNumber(value);
  return Number.isFinite(number)?Number(number.toFixed(3))+"K":"里程未提供";
}
function cctvCameraLandmark(x){
  const id=String(x?.id||"").trim();
  const match=id.match(/^CCTV-[^-]+-[^-]+-[^-]+-[A-Z]+-(.+)$/i);
  if(!match)return "";
  return match[1].replace(/-/g," · ").trim();
}
function cctvGroupLandmarks(group){
  const names=[...new Set((group?.items||[]).map(cctvCameraLandmark).filter(Boolean))];
  return names.slice(0,3);
}
function cctvLandmarkPriority(name){
  const value=String(name||"");
  if(/交流道/.test(value))return 0;
  if(/系統/.test(value))return 1;
  if(/服務區/.test(value))return 2;
  if(/隧道/.test(value))return 3;
  if(/地磅站|休息站/.test(value))return 4;
  return 5;
}
function cctvQuickLandmarkRows(rows){
  const map=new Map();
  (rows||[]).forEach(row=>{
    const name=cctvCameraLandmark(row);
    if(!name)return;
    if(!map.has(name))map.set(name,{name,row,mile:cctvMileNumber(row.mile)});
  });
  return [...map.values()].sort((a,b)=>cctvLandmarkPriority(a.name)-cctvLandmarkPriority(b.name)||(a.mile-b.mile)||a.name.localeCompare(b.name,"zh-Hant")).slice(0,18);
}
function renderCCTVQuickLandmarks(rows){
  const root=$("#cctvQuickLandmarks");
  if(!root)return;
  if(state.cctvRoad==="all"){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  const scoped=(rows||[]).filter(x=>state.cctvDirection==="all"||cctvDirectionKey(x.direction)===state.cctvDirection);
  const quick=cctvQuickLandmarkRows(scoped);
  root.hidden=!quick.length;
  root.innerHTML=quick.map(item=>'<button type="button" data-cctv-landmark="'+esc(item.name)+'">'+esc(item.name)+'</button>').join("");
  $$("[data-cctv-landmark]",root).forEach(button=>button.onclick=()=>{
    const input=$("#cctvSearch");
    if(input)input.value=button.dataset.cctvLandmark||"";
    renderCCTV();
    $("#cctvList")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
function cctvRoadLabel(x){return String(x.road||"").trim()||(x.roadNo?"國道 "+x.roadNo+" 號":"道路未提供");}
function cctvPlaceLabel(x){
  const start=String(x.start||"").trim(),end=String(x.end||"").trim();
  if(start&&end)return start===end?start:start+" → "+end;
  // Retain a provided official endpoint; do not invent its missing counterpart.
  if(start||end)return start?start+" → 終點未提供":"起點未提供 → "+end;
  const mile=cctvMileNumber(x.mile),base=Math.floor(mile/10)*10;
  return cctvRoadLabel(x)+(Number.isFinite(mile)?"・"+base+"–"+(base+9)+"K 路段（里程分段）":"・起訖與里程未提供");
}
function cctvGroupKey(x){
  const direction=cctvDirectionKey(x.direction);
  return JSON.stringify([String(x.roadNo||""),cctvRoadLabel(x),direction,
    direction==="other"?String(x.direction||"").trim():"",String(x.start||"").trim(),String(x.end||"").trim(),
    x.start||x.end?"official":cctvPlaceLabel(x)]);
}
function cctvGroupRows(rows){
  const groups=new Map();
  rows.forEach(x=>{
    const key=cctvGroupKey(x);
    if(!groups.has(key))groups.set(key,{key,road:cctvRoadLabel(x),roadNo:String(x.roadNo||""),direction:cctvDirectionLabel(x.direction),place:cctvPlaceLabel(x),items:[]});
    groups.get(key).items.push(x);
  });
  const compare=(a,b)=>a===b?0:a<b?-1:1;
  const result=[...groups.values()];
  result.forEach(g=>g.items.sort((a,b)=>compare(cctvMileNumber(a.mile),cctvMileNumber(b.mile))||String(a.id).localeCompare(String(b.id))));
  return result.sort((a,b)=>(Number(a.roadNo)||99)-(Number(b.roadNo)||99)||compare(cctvMileNumber(a.items[0].mile),cctvMileNumber(b.items[0].mile))||a.place.localeCompare(b.place,"zh-Hant")||a.direction.localeCompare(b.direction,"zh-Hant"));
}
function cctvDistanceKm(x){
  if(!state.cctvOrigin||!cctvHasMap(x))return null;
  const lat=Number(x.lat),lon=Number(x.lon),toRad=v=>v*Math.PI/180;
  const a=toRad(lat-state.cctvOrigin.lat),b=toRad(lon-state.cctvOrigin.lon);
  const c=Math.sin(a/2)**2+Math.cos(toRad(state.cctvOrigin.lat))*Math.cos(toRad(lat))*Math.sin(b/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(c),Math.sqrt(1-c));
}
function cctvNearbyRows(rows){
  if(!state.cctvOrigin)return [];
  return (rows||[])
    .filter(row=>state.cctvDirection==="all"||cctvDirectionKey(row.direction)===state.cctvDirection)
    .filter(cctvHasMap).map(row=>({row,distance:cctvDistanceKm(row)}))
    .filter(item=>item.distance!=null)
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,6);
}
function cctvNearbyScopeSummary(rows){
  const nearby=cctvNearbyRows(rows);
  if(!nearby.length)return "附近暫無可定位鏡頭";
  const roads=[...new Set(nearby.map(item=>cctvRoadLabel(item.row)))].slice(0,3);
  const directions=[...new Set(nearby.map(item=>cctvDirectionLabel(item.row.direction)))];
  return "最近 "+nearby.length+" 支 · "+roads.join("／")+(directions.length?" · "+directions.join("／"):"");
}
function cctvAdjacentCamera(x,delta){
  const roadNo=String(x?.roadNo||""),road=cctvRoadLabel(x),direction=cctvDirectionKey(x?.direction);
  const rows=(state.cctv.items||[]).filter(row=>
    (String(row?.roadNo||"")===roadNo||(!roadNo&&cctvRoadLabel(row)===road))&&
    cctvDirectionKey(row?.direction)===direction&&Number.isFinite(cctvMileNumber(row?.mile))
  ).sort((a,b)=>cctvMileNumber(a.mile)-cctvMileNumber(b.mile)||String(a.id).localeCompare(String(b.id)));
  const index=rows.findIndex(row=>String(row.id)===String(x?.id));
  if(index<0)return null;
  return rows[index+delta]||null;
}
function cctvAdjacentActionMarkup(x){
  const prev=cctvAdjacentCamera(x,-1),next=cctvAdjacentCamera(x,1);
  const prevStream=prev?safeHttpUrl(prev.stream):"",nextStream=next?safeHttpUrl(next.stream):"";
  if(!prevStream&&!nextStream)return "";
  return '<div class="cctv-adjacent-actions">'+
    (prevStream?'<button data-cctv-stream="'+esc(encodeURIComponent(prevStream))+'" title="'+esc(cctvMileLabel(prev.mile))+'">前一支</button>':"")+
    (nextStream?'<button data-cctv-stream="'+esc(encodeURIComponent(nextStream))+'" title="'+esc(cctvMileLabel(next.mile))+'">後一支</button>':"")+
  '</div>';
}
function renderCCTVNearby(rows){
  const nearby=cctvNearbyRows(rows);
  if(!nearby.length)return '<div class="empty"><b>附近沒有可定位的官方攝影機</b><p>可以改用道路或地名搜尋。</p></div>';
  return '<div class="cctv-nearby-list">'+nearby.map(({row,distance},index)=>{
    const stream=safeHttpUrl(row.stream),landmark=cctvCameraLandmark(row),title=landmark||cctvMileLabel(row.mile);
    return '<article class="cctv-nearby-card">'+
      '<div class="cctv-nearby-rank">'+(index+1)+'</div>'+
      '<div class="cctv-nearby-info"><div class="cctv-nearby-route"><i>'+esc(cctvRoadLabel(row))+'</i><i>'+esc(cctvDirectionLabel(row.direction))+'</i></div><b>'+esc(title)+'</b><small>'+esc(cctvMileLabel(row.mile))+' · 攝影機 '+esc(row.id)+'</small><span>'+esc(distance<10?distance.toFixed(1):Math.round(distance))+' km</span></div>'+
      '<div class="cctv-nearby-actions">'+(stream?'<button class="go" data-cctv-stream="'+esc(encodeURIComponent(stream))+'">看影像</button>':"")+
      '<button data-cctv-map="'+row.lat+','+row.lon+'">地圖</button>'+cctvAdjacentActionMarkup(row)+'</div>'+
    '</article>';
  }).join("")+'</div>';
}
function requestCCTVNearby(){
  if(state.cctvNearby&&state.cctvOrigin){
    state.cctvNearby=false;
    $("#cctvNearbyBtn")?.setAttribute("aria-pressed","false");
    renderCCTV();
    return;
  }
  if(!navigator.geolocation)return toast("此瀏覽器無法取得目前位置");
  toast("正在尋找附近官方鏡頭");
  navigator.geolocation.getCurrentPosition(pos=>{
    state.cctvOrigin={lat:pos.coords.latitude,lon:pos.coords.longitude};
    state.cctvNearby=true;
    state.cctvRoad="all";
    state.cctvDirection="all";
    const search=$("#cctvSearch"); if(search)search.value="";
    $$("#cctvRoadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.cctvRoad==="all"));
    $$("[data-cctv-direction]").forEach(b=>b.classList.toggle("active",b.dataset.cctvDirection==="all"));
    renderCCTV();
    toast("已依目前位置排序附近鏡頭");
  },()=>toast("無法取得位置，請確認定位權限"),{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
}
function cctvHasMap(x){
  return typeof x.lat==="number"&&typeof x.lon==="number"&&Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Math.abs(x.lat)<=90&&Math.abs(x.lon)<=180&&!(x.lat===0&&x.lon===0);
}
function syncCCTVDirectionFilter(rows){
  const filter=$("#cctvDirectionFilter");
  if(!filter)return;
  const available=new Set(rows.map(x=>cctvDirectionKey(x.direction)));
  if(state.cctvDirection!=="all"&&!available.has(state.cctvDirection))state.cctvDirection="all";
  filter.hidden=(state.cctvRoad==="all"&&!state.cctvNearby)||state.cctv.status!=="ready";
  $$("[data-cctv-direction]",filter).forEach(b=>{
    const key=b.dataset.cctvDirection;
    b.hidden=key!=="all"&&!available.has(key);
    b.classList.toggle("active",key===state.cctvDirection);
    b.setAttribute("aria-pressed",String(key===state.cctvDirection));
  });
}
function renderCCTVRoadOverview(rows){
  const roadNumbers=["1","2","3","4","5","6"];
  const cards=roadNumbers.map(no=>{
    const items=rows.filter(x=>String(x.roadNo)===no);
    const directions=[...new Set(items.map(x=>cctvDirectionLabel(x.direction)))];
    const landmarks=cctvQuickLandmarkRows(items).slice(0,3).map(x=>x.name);
    return '<button class="cctv-road-card" data-cctv-select="'+no+'"><span class="cctv-road-title">國 '+no+'<span aria-hidden="true">→</span></span><b>'+cctvGroupRows(items).length+' 路段 · '+items.length+' 支鏡頭</b><small>'+(landmarks.length?esc(landmarks.join(" · ")):esc(directions.join(" · ")||"目前無攝影機資料"))+'</small></button>';
  });
  const others=rows.filter(x=>!roadNumbers.includes(String(x.roadNo)));
  if(others.length)cards.push('<button class="cctv-road-card" data-cctv-select="other"><span class="cctv-road-title">其他道路<span aria-hidden="true">→</span></span><b>'+cctvGroupRows(others).length+' 路段 · '+others.length+' 支鏡頭</b><small>依官方道路名稱查看</small></button>');
  return '<div class="cctv-road-grid">'+cards.join("")+'</div>';
}
function renderCCTVGroups(groups){
  if(!groups.length)return '<div class="empty"><b>沒有符合的攝影機</b><p>可搜尋交流道、服務區、地名或里程。官方資料缺少地名時，請改用道路或里程查找。</p></div>';
  return groups.map((g,index)=>{
    const miles=g.items.map(x=>cctvMileNumber(x.mile)).filter(Number.isFinite);
    const range=miles.length?(cctvMileLabel(Math.min(...miles))+(Math.max(...miles)!==Math.min(...miles)?"–"+cctvMileLabel(Math.max(...miles)):"")):"里程未提供";
    const landmarks=cctvGroupLandmarks(g);
    return '<details class="cctv-group"'+(index===0?' open':'')+'><summary><span class="cctv-group-kicker">'+esc(g.direction)+' · '+esc(g.road)+'</span><strong>'+esc(g.place)+'</strong>'+(landmarks.length?'<span class="cctv-group-landmarks">'+landmarks.map(name=>'<i>'+esc(name)+'</i>').join("")+'</span>':"")+'<span class="cctv-group-meta">'+g.items.length+' 支鏡頭 · '+esc(range)+'</span><span class="cctv-group-toggle" aria-hidden="true">⌄</span></summary><div class="cctv-cameras">'+g.items.map(x=>{
      const stream=safeHttpUrl(x.stream),landmark=cctvCameraLandmark(x);
      return '<article class="cctv-camera'+(landmark?' has-landmark':'')+'"><div class="cctv-camera-info"><b>'+esc(landmark||cctvMileLabel(x.mile))+'</b><small>'+(landmark?esc(cctvMileLabel(x.mile))+' · ':"")+'攝影機 '+esc(x.id)+'</small></div><div class="cctv-camera-actions">'+
        (stream?'<button class="go" data-cctv-stream="'+esc(encodeURIComponent(stream))+'">觀看即時影像</button>':'<span class="muted">影像網址未提供</span>')+
        (cctvHasMap(x)?'<button data-cctv-map="'+x.lat+','+x.lon+'">地圖位置</button>':"")+
        cctvAdjacentActionMarkup(x)+'</div></article>';
    }).join("")+'</div></details>';
  }).join("");
}
function selectCCTVRoad(road){
  state.cctvNearby=false;
  state.cctvRoad=String(road||"all");
  state.cctvDirection="all";
  $("#cctvNearbyBtn")?.setAttribute("aria-pressed","false");
  $$("#cctvRoadFilter button").forEach(b=>{
    const active=b.dataset.cctvRoad===state.cctvRoad;
    b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
  });
  renderCCTV();
}
function renderCCTV(){
  const root=$("#cctvList"),status=$("#cctvSourceState"),summary=$("#cctvResultSummary");
  if(!root||!status)return;
  if(state.cctv.status!=="ready"){
    syncCCTVDirectionFilter([]);
    const loading=state.cctv.status==="loading",idle=state.cctv.status==="idle";
    status.textContent=loading?"讀取官方攝影機清單中…":idle?"點進頁面後讀取官方清單":"官方清單暫時無法讀取";
    if(summary)summary.textContent=loading?"正在整理道路與路段":"等待官方清單";
    root.innerHTML=idle?"":'<div class="empty"><b>'+ (loading?"正在連線官方資料":"目前無法載入站內攝影機清單")+'</b><p>可使用下方 1968／幸福公路入口直接查看。</p></div>';
    return;
  }
  const all=state.cctv.items||[],q=($("#cctvSearch")?.value||"").trim().toLowerCase();
  const roadRows=all.filter(x=>state.cctvRoad==="all"||(state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(x.roadNo)):String(x.roadNo)===state.cctvRoad));
  syncCCTVDirectionFilter(roadRows);
  renderCCTVQuickLandmarks(state.cctvNearby?[]:roadRows);
  status.textContent=state.cctv.source+" · "+all.length+" 支";
  const nearbyBtn=$("#cctvNearbyBtn"),nearbyActive=Boolean(state.cctvNearby&&state.cctvOrigin);
  if(nearbyBtn){
    nearbyBtn.setAttribute("aria-pressed",String(nearbyActive));
    const title=nearbyBtn.querySelector("b"),hint=nearbyBtn.querySelector("small");
    if(title)title.textContent=nearbyActive?"返回道路列表":"找附近鏡頭";
    if(hint)hint.textContent=nearbyActive?"關閉附近模式，回到國道／道路選擇":"裝置內依距離排序，不上傳位置";
  }
  if(nearbyActive){
    root.innerHTML=renderCCTVNearby(all);
    if(summary)summary.textContent="依目前位置排序 · "+cctvNearbyScopeSummary(all);
  }else if(state.cctvRoad==="all"&&!q){
    root.innerHTML=renderCCTVRoadOverview(all);
    const count=new Set(all.filter(x=>["1","2","3","4","5","6"].includes(String(x.roadNo))).map(x=>String(x.roadNo))).size;
    if(summary)summary.textContent=count+" 條國道 · "+all.length+" 支鏡頭（含其他道路）";
  }else{
    const matched=roadRows.filter(x=>(state.cctvDirection==="all"||cctvDirectionKey(x.direction)===state.cctvDirection)&&(!q||[x.road,x.direction,cctvDirectionLabel(x.direction),x.start,x.end,x.mile,cctvMileLabel(x.mile),x.id,cctvCameraLandmark(x),x.roadNo?"國 "+x.roadNo:""].join(" ").toLowerCase().includes(q)));
    const groups=cctvGroupRows(matched);
    root.innerHTML=renderCCTVGroups(groups);
    if(summary)summary.textContent=(state.cctvRoad==="all"?"全部道路":state.cctvRoad==="other"?"其他道路":"國 "+state.cctvRoad)+(state.cctvDirection!=="all"?" · "+CCTV_DIRECTIONS[state.cctvDirection]:"")+" · "+groups.length+" 路段 · "+matched.length+" 支鏡頭";
  }
  $$("[data-cctv-select]",root).forEach(b=>b.onclick=()=>selectCCTVRoad(b.dataset.cctvSelect));
  $$("[data-cctv-stream]",root).forEach(b=>b.onclick=()=>window.open(decodeURIComponent(b.dataset.cctvStream),"_blank","noopener"));
  $$("[data-cctv-map]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(b.dataset.cctvMap),"_blank","noopener"));
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
  selectCCTVRoad(road);
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
  ).join(""):'<div class="empty"><b>國 '+state.highway+' 自動同步目前沒有資料</b><p>即時路況資料暫時無法取得，可直接開啟高公局 1968 查看。</p></div>';

  const statusNote=state.traffic?.status==="stale"
    ? '<div class="notice">TDX 暫時無法更新，以下顯示最後可用資料 · '+esc(formatTime(state.traffic?.updatedAt))+'</div>'
    : "";
  root.innerHTML=statusNote+list+official;
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

  const statusNote=state.tunnel?.status==="stale"
    ? '<div class="notice">TDX 暫時無法更新，以下顯示最後可用資料 · '+esc(formatTime(state.tunnel?.updatedAt))+'</div>'
    : "";
  root.innerHTML=statusNote+list+official;
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
          '<b>目前尚無公開車輛</b>'+
          '<p>車主與車商皆可申請刊登，經基本資料確認後公開。</p>'+
          '<button class="primary" data-url="https://lin.ee/Tu89Qyk">聯絡 COLA GO・申請刊登</button>'+
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
          '<b>目前尚無二手配件</b>'+
          '<p>免費刊登已開放，不收刊登費、不收成交佣金。</p>'+
          '<button class="primary" data-url="https://lin.ee/Tu89Qyk">刊登第一件配件</button>'+
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
          '<b>加入 COLA GO 合作夥伴</b>'+
          '<p>汽車相關店家與服務歡迎加入 COLA GO 合作夥伴。</p>'+
          '<button class="primary" data-url="https://lin.ee/Tu89Qyk">聯絡 COLA GO・洽談合作</button>'+
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
    ).join(""):'<div class="market-empty"><b>目前尚無公開社群</b><p>歡迎車友社群加入 COLA GO，審核後即可公開讓更多車友找到。</p><button class="primary" data-url="https://lin.ee/Tu89Qyk">聯絡 COLA GO・加入社群</button></div>';
  }

  const eventRoot=$("#eventList");
  if(eventRoot){
    eventRoot.innerHTML=events.length?events.map(x=>
      '<article class="community-card"><h3>'+esc(x.name)+'</h3><div class="badges"><span>'+esc(x.date||"")+'</span><span>'+esc(x.area||"")+'</span></div><p>'+esc(x.description||"")+'</p><button class="external-btn" data-url="'+esc(x.url)+'">活動詳情<svg><use href="#i-external"/></svg></button></article>'
    ).join(""):'<div class="market-empty"><b>目前尚無公開車主活動</b><p>歡迎提供車聚、露營、講座與其他車友活動資訊。</p><button class="primary" data-url="https://lin.ee/Tu89Qyk">聯絡 COLA GO・提供活動</button></div>';
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
  bindSelect("chargingCity","chargingCity");
  bindSelect("chargingDirection","chargingDirection");
  bindSelect("chargingConnector","chargingConnector");
  bindSelect("chargingPower","chargingPower",Number);
  const chargingOperatorSelect=$("#chargingOperator");
  if(chargingOperatorSelect)chargingOperatorSelect.onchange=()=>{
    state.chargingOperator=chargingOperatorSelect.value;
    state.chargingMajor="all";
    renderCharging();
  };

  $$("[data-charge-quick]").forEach(b=>b.addEventListener("click",()=>{
    state.chargingQuick=b.dataset.chargeQuick||"all";
    renderCharging();
  }));
  $$("[data-charge-major]").forEach(b=>b.addEventListener("click",()=>{
    state.chargingMajor=b.dataset.chargeMajor||"all";
    state.chargingOperator="all";
    if($("#chargingOperator"))$("#chargingOperator").value="all";
    renderCharging();
  }));

  const requestChargingOrigin=(availableOnly=false)=>{
    if(!navigator.geolocation)return toast("此瀏覽器無法取得目前位置");
    toast(availableOnly?"正在尋找附近可用充電站":"正在取得目前位置");
    navigator.geolocation.getCurrentPosition(pos=>{
      state.chargingOrigin={lat:pos.coords.latitude,lon:pos.coords.longitude};
      state.chargingSort="nearby";
      if(availableOnly){
        state.chargingAvailableOnly=true;
        state.chargingCity="all";
        state.road="all";
        state.chargingDirection="all";
        state.chargingFavoritesOnly=false;
        if($("#chargingCity"))$("#chargingCity").value="all";
        if($("#chargingDirection"))$("#chargingDirection").value="all";
        $$("#roadFilter button").forEach((b,i)=>b.classList.toggle("active",i===0));
      }
      renderCharging();
      toast(availableOnly?"已顯示附近可確認的空槍":"已依距離排序充電站");
    },()=>toast("無法取得位置，請確認定位權限"),{
      enableHighAccuracy:false,timeout:8000,maximumAge:300000
    });
  };

  $("#chargingFindNow")?.addEventListener("click",()=>requestChargingOrigin(true));

  $("#chargingNearby")?.addEventListener("click",()=>{
    if(state.chargingSort==="nearby"){
      state.chargingSort="smart";
      state.chargingOrigin=null;
      renderCharging();
      return;
    }
    requestChargingOrigin(false);
  });

  $("#chargingAvailableOnly")?.addEventListener("click",()=>{
    state.chargingAvailableOnly=!state.chargingAvailableOnly;
    renderCharging();
  });

  $("#chargingPriorityFast")?.addEventListener("click",()=>{
    const active=state.chargingQuick==="priorityfast";
    state.chargingQuick=active?"all":"priorityfast";
    state.chargingMajor="all";
    state.chargingOperator="all";
    state.chargingAvailableOnly=false;
    state.chargingFavoritesOnly=false;
    state.chargingSort="smart";
    state.chargingOrigin=null;
    state.road="all";
    state.chargingDirection="all";
    state.chargingConnector="all";
    state.chargingPower=0;
    if($("#chargingOperator"))$("#chargingOperator").value="all";
    if($("#chargingDirection"))$("#chargingDirection").value="all";
    if($("#chargingConnector"))$("#chargingConnector").value="all";
    if($("#chargingPower"))$("#chargingPower").value="0";
    if($("#chargingSearch"))$("#chargingSearch").value="";
    $("#roadFilter button").forEach((b,i)=>b.classList.toggle("active",i===0));
    renderCharging();
    toast(active?"已取消主力空槍快充":"已套用主力空槍快充");
  });

  $("#chargingFavoritesOnly")?.addEventListener("click",()=>{
    state.chargingFavoritesOnly=!state.chargingFavoritesOnly;
    renderCharging();
  });

  $("#chargingResultClear")?.addEventListener("click",()=>$("#resetChargingFilters")?.click());

  $("#resetChargingFilters")?.addEventListener("click",()=>{
    state.road="all";
    state.chargingCity="all";
    state.chargingDirection="all";
    state.chargingConnector="all";
    state.chargingPower=0;
    state.chargingOperator="all";
    state.chargingQuick="all";
    state.chargingMajor="all";
    state.chargingAvailableOnly=false;
    state.chargingSort="smart";
    state.chargingOrigin=null;
    state.chargingFavoritesOnly=false;
    $$("#roadFilter button").forEach((b,i)=>b.classList.toggle("active",i===0));
    if($("#chargingCity"))$("#chargingCity").value="all";
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
  $("#parkingCitySelect")?.addEventListener("change",e=>{
    state.parkingCity=e.target.value;
    if($("#parkingSearch"))$("#parkingSearch").value="";
    renderParking();
  });
  $("#parkingNearbyGoogle")?.addEventListener("click",()=>openParkingMap("google","停車場"));
  $("#parkingNearbyApple")?.addEventListener("click",()=>openParkingMap("apple","停車場"));
  if($("#cctvSearch"))$("#cctvSearch").oninput=()=>{
    state.cctvNearby=false;
    $("#cctvNearbyBtn")?.setAttribute("aria-pressed","false");
    renderCCTV();
  };
  $("#cctvNearbyBtn")?.addEventListener("click",requestCCTVNearby);
  $$("#cctvRoadFilter button").forEach(b=>b.onclick=()=>selectCCTVRoad(b.dataset.cctvRoad));
  $$("[data-cctv-direction]").forEach(b=>b.onclick=()=>{
    state.cctvDirection=b.dataset.cctvDirection;
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

function fillRoute(from,to){
  $("#tripFrom").value=from;
  $("#tripTo").value=to;
  show("trip");
}

function bindTrip(){
  $$("[data-route]").forEach(b=>b.onclick=()=>{
    const parts=b.dataset.route.split("|");
    $("#tripFrom").value=parts[0];
    $("#tripTo").value=parts[1];
  });

  $$("[data-fill-route]").forEach(b=>b.onclick=()=>{
    const parts=b.dataset.fillRoute.split("|");
    fillRoute(parts[0],parts[1]);
  });

  $("#planTripBtn").onclick=()=>{
    const from=$("#tripFrom").value.trim()||"目前位置";
    const to=$("#tripTo").value.trim();
    if(!to)return toast("請先輸入目的地");

    $("#tripResult").innerHTML=
      '<div class="list-item">'+
        '<h3>'+esc(from)+' → '+esc(to)+'</h3>'+
        '<div class="meta">先看路況與充電，再直接交給你慣用的導航工具。</div>'+
        '<div class="item-actions"><button class="go" data-map="google">Google Maps</button><button data-map="apple">Apple 地圖</button></div>'+
        '<div class="item-actions"><button data-next="highway">國道路況</button><button data-next="charging">沿途充電</button><button data-next="parking">停車</button></div>'+
      '</div>';

    $$("[data-next]",$("#tripResult")).forEach(b=>b.onclick=()=>show(b.dataset.next));
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
  };
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
bindCopy();
bindChargingTools();
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
