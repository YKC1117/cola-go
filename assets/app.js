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
  cctvGroupLimit:24,
  cctvCorridorIndex:0,
  cctvCorridorMode:"all",
  cctvSegmentStartId:"",
  cctvSegmentEndId:"",
  cctvSavedSegments:[],
  cctvRecentSegments:[],
  cctvViewerId:"",
  cctvOrigin:null,
  cctvNearby:false,
  cctvLoading:false,
  cctvLastAttempt:0,
  trafficFallbackStatus:"idle",
  trafficFallbackAt:0,
  installPrompt:null
};

const APP_RELEASE="Public Beta V24";
const VIEW_LABELS={
  home:"首頁",trip:"路線規劃",charging:"充電",parking:"停車",highway:"國道路況",tunnel:"雪隧",
  cctv:"CCTV 即時影像",plate:"車牌中心",tools:"車主工具",shortcuts:"車用捷徑",market:"買車・賣車",
  "tesla-db":"Tesla 車系比較",locations:"原廠據點",community:"社群・活動",partners:"合作專區",
  vin:"VIN 解碼",calculator:"電費計算",delivery:"驗車清單",maintenance:"保養週期",parts:"Tesla 零件",
  lucky:"車牌數字",warranty:"保固剩餘",connector:"充電接頭"
};

const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(Math.round(v||0));

function toast(message,duration=1800){
  const el=$("#toast");
  if(!el)return;
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove("show"),duration);
}

function resetViewDisclosures(view){
  const root=$$(".view").find(el=>el.dataset.view===view);
  if(!root)return;
  $$("details",root).forEach(el=>{
    if(!el.hasAttribute("data-keep-open"))el.open=false;
  });
}
function show(view,push=true){
  if(!$$(".view").some(el=>el.dataset.view===view))view="home";
  state.view=view;
  $$(".view").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  resetViewDisclosures(view);
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
function bindDisclosureBehavior(){
  document.addEventListener("toggle",event=>{
    const current=event.target;
    if(!(current instanceof HTMLDetailsElement)||!current.open||current.hasAttribute("data-allow-multi"))return;
    const view=current.closest(".view");
    if(!view)return;
    $$("details",view).forEach(other=>{
      if(other===current||other.contains(current)||current.contains(other)||other.hasAttribute("data-allow-multi"))return;
      other.open=false;
    });
  },true);
}

function bindExternal(root=document){
  $$("[data-url]",root).forEach(el=>{
    el.onclick=()=>window.open(el.dataset.url,"_blank","noopener");
  });
}
function copyTextBestEffort(text){
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(text).catch(()=>{});
    return;
  }
  try{
    const area=document.createElement("textarea");
    area.value=text;
    area.setAttribute("readonly","");
    area.style.position="fixed";
    area.style.opacity="0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }catch{}
}
function feedbackContext(){
  const view=state.view||location.hash.slice(1)||"home";
  const label=VIEW_LABELS[view]||view;
  return [
    "COLA GO 問題回報",
    "功能："+label,
    "頁面："+location.origin+location.pathname+"#"+view,
    "版本："+APP_RELEASE,
    "",
    "問題："
  ].join("\n");
}
function bindFeedback(root=document){
  $$("[data-feedback]",root).forEach(el=>{
    el.addEventListener("click",()=>{
      copyTextBestEffort(feedbackContext());
      toast("已複製回報格式，貼到 LINE 後補充問題",3000);
    });
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

function dataAgeInfo(value,maxAgeMs=45*60*1000,now=Date.now()){
  const time=Date.parse(value||"");
  if(!Number.isFinite(time))return {known:false,fresh:false,stale:true,ageMs:Infinity,label:"更新時間未提供"};
  const ageMs=Math.max(0,now-time);
  const minutes=Math.floor(ageMs/60000);
  let label="";
  if(minutes<1)label="剛剛更新";
  else if(minutes<60)label=minutes+" 分鐘前更新";
  else if(minutes<1440)label=Math.floor(minutes/60)+" 小時前更新";
  else label=new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(time))+" 更新";
  return {known:true,fresh:ageMs<=maxAgeMs,stale:ageMs>maxAgeMs,ageMs,label};
}
function formatTime(value){
  if(!value)return "尚無更新時間";
  const info=dataAgeInfo(value,Infinity);
  return info.known?info.label:String(value);
}
function dataStatusInfo(data,maxAgeMs=45*60*1000){
  const stamp=data?.liveUpdatedAt||data?.updatedAt||"";
  const age=dataAgeInfo(stamp,maxAgeMs);
  const explicitStale=Boolean(data?.stale||data?.status==="stale");
  const hasData=Boolean(data&&stamp);
  return {
    ...age,
    hasData,
    stale:hasData&&(explicitStale||!age.fresh),
    live:hasData&&!explicitStale&&age.fresh,
    label:!hasData?"尚無資料":explicitStale||!age.fresh?"資料較舊":data?.status==="live"?"即時":"官方資料"
  };
}

function avg(rows){
  const values=(rows||[]).map(x=>Number(x.speed)).filter(v=>v>0&&v<200);
  return values.length?Math.round(values.reduce((sum,v)=>sum+v,0)/values.length):null;
}

function metricClass(v){
  return v>=80?"good":v>=50?"mid":"bad";
}

async function load(){
  loadCCTVSegmentStorage();
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
  if(location.hash==="#cctv"){
    if(readCCTVSharedCamera())requestAnimationFrame(()=>applyCCTVSharedCamera());
    else if(readCCTVSharedSegment())requestAnimationFrame(()=>applyCCTVSharedSegment());
  }
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
  renderHomeCCTVQuickRoutes();

  const trafficInfo=dataStatusInfo(state.traffic);
  $("#syncState").classList.toggle("ready",trafficInfo.live);
  $("#syncState").classList.toggle("stale",trafficInfo.stale);
  $("#syncText").textContent=trafficInfo.live?"即時":trafficInfo.hasData?"資料較舊":"更新中";
  $("#lastUpdate").textContent=trafficInfo.known?trafficInfo.label:"尚無更新時間";

  $("#chargeQuick").textContent=state.charging.length?state.charging.length+" 處":"服務區";
  $("#chargeValue").textContent=state.charging.length||"—";

  const h1=avg(state.traffic?.highways?.["1"]||[]);
  $("#trafficValue").textContent=h1?h1+" km/h":"—";
  $("#trafficDot").className=trafficInfo.live?"dot ready":"dot pending";
  $("#trafficCaption").textContent=trafficInfo.live&&h1?"國 1 平均":trafficInfo.hasData&&h1?"最後可用 · "+trafficInfo.label:"可開 1968 即時查看";

  const snow=avg([...(state.tunnel?.south||[]),...(state.tunnel?.north||[])]);
  const tunnelInfo=dataStatusInfo(state.tunnel);
  $("#tunnelValue").textContent=snow?snow+" km/h":"—";
  $("#tunnelDot").className=tunnelInfo.live&&snow?"dot ready":"dot pending";
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
  const statusRows=rows.filter(x=>{
    const tier=chargingAvailabilityInfo(x).tier;
    return tier==="live"||tier==="recent";
  });
  const liveRows=statusRows.filter(x=>chargingAvailabilityInfo(x).tier==="live");
  const recentRows=statusRows.filter(x=>chargingAvailabilityInfo(x).tier==="recent");
  const available=statusRows.reduce((sum,x)=>sum+chargingLiveCounts(x).available,0);
  const maxKw=Math.max(0,...rows.map(chargingPowerKw).filter(v=>Number.isFinite(v)&&v>0));
  const updatedTimes=statusRows.map(x=>Date.parse(x.statusUpdatedAt||"")).filter(Number.isFinite);
  const latestUpdatedAt=updatedTimes.length?new Date(Math.max(...updatedTimes)).toISOString():"";
  return {rows,statusRows,liveRows,recentRows,available,maxKw,latestUpdatedAt};
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
    const coverage=stats.liveRows.length
      ?stats.liveRows.length+" 站即時"+(stats.recentRows.length?" · "+stats.recentRows.length+" 站最近回報":"")
      :stats.recentRows.length
        ?stats.recentRows.length+" 站最近回報"
        :"槍況覆蓋待補";
    const open=stats.statusRows.length?stats.available+" 空槍":"-- 空槍";
    const freshness=stats.latestUpdatedAt?chargingLiveAgeLabel(stats.latestUpdatedAt):"更新時間待補";
    return '<button type="button" data-charge-priority="'+esc(key)+'">'+
      '<span class="charging-coverage-brand"><b>'+esc(profile.brand)+'</b><small>'+esc(chargingIntegrationLabel(key))+'</small></span>'+
      '<span class="charging-coverage-stats"><strong>'+esc(open)+'</strong><small>'+esc(coverage)+'</small><em>最高功率 '+esc(power)+'</em><em class="charging-priority-freshness">'+esc(freshness)+'</em></span>'+
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
  const info=chargingAvailabilityInfo(x);
  if(!["live","recent"].includes(info.tier)||info.counts.available<=0)return false;
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
  const rows=(state.charging||[]).filter(x=>
    (state.chargingCity==="all"||x.city===state.chargingCity)&&chargingHasAvailableReport(x)
  );
  const snapshot=chargingSnapshot(rows);
  const liveRows=rows.filter(x=>chargingAvailabilityInfo(x).tier==="live");
  const recentRows=rows.filter(x=>chargingAvailabilityInfo(x).tier==="recent");
  const live=chargingSnapshot(liveRows);
  const recent=chargingSnapshot(recentRows);
  return {...snapshot,liveStations:live.stations,liveAvailable:live.available,recentStations:recent.stations,recentAvailable:recent.available};
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
  if(availableStatus){
    availableStatus.textContent=available.liveStations
      ?available.stations+" 站 · "+available.available+" 空槍"+(available.recentStations?"（含最近回報）":"")
      :available.recentStations
        ?available.recentStations+" 站 · "+available.recentAvailable+" 最近回報"
        :"目前無可用槍況回報";
  }
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
  const counts=chargingLiveCounts(x),info=chargingAvailabilityInfo(x);
  const availability=info.tier==="live"
    ?(counts.available>0?"空槍 "+counts.available+"/"+counts.total:"目前無空槍")
    :info.tier==="recent"
      ?(counts.available>0?"最近 "+counts.available+"/"+counts.total:"最近回報已滿")
      :(info.tier==="stale"?"槍況已逾時":x?.officialSupplemental?"即時未驗證":"空槍未確認");
  const availabilityClass=info.tier==="live"
    ?(counts.available>0?" is-open":" is-full")
    :info.tier==="recent"
      ?" is-recent"
      :" is-muted";
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
    return chargingHasAvailableReport(x);
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
  if(x?.officialSupplemental)return 6;
  if(x.road!=="tdx")return 7;
  const info=chargingAvailabilityInfo(x);
  if(info.tier==="live"&&info.counts.available>0)return 0;
  if(info.tier==="recent"&&info.counts.available>0)return 1;
  if(info.tier==="live")return 2;
  if(info.tier==="recent")return 3;
  if(info.tier==="stale")return 5;
  if(Number(x.liveStateCount)>0)return 4;
  return 6;
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
const CHARGING_LIVE_MAX_AGE_MS=45*60*1000;
const CHARGING_RECENT_MAX_AGE_MS=6*60*60*1000;
function chargingAvailabilityInfo(x,now=Date.now()){
  const counts=chargingLiveCounts(x);
  if(x?.road!=="tdx"||counts.total<=0)return {tier:"unknown",counts,ageMs:Infinity,updatedAt:x?.statusUpdatedAt||""};
  const ts=Date.parse(x?.statusUpdatedAt||"");
  if(!Number.isFinite(ts))return {tier:"unknown",counts,ageMs:Infinity,updatedAt:""};
  const ageMs=Math.max(0,now-ts);
  if(ageMs<=CHARGING_LIVE_MAX_AGE_MS&&!x?.liveStale)return {tier:"live",counts,ageMs,updatedAt:x.statusUpdatedAt};
  if(ageMs<=CHARGING_RECENT_MAX_AGE_MS)return {tier:"recent",counts,ageMs,updatedAt:x.statusUpdatedAt};
  return {tier:"stale",counts,ageMs,updatedAt:x.statusUpdatedAt};
}
function chargingHasAvailableReport(x){
  const info=chargingAvailabilityInfo(x);
  return (info.tier==="live"||info.tier==="recent")&&info.counts.available>0;
}
function chargingLiveDatasetReady(){
  return (state.charging||[]).some(x=>x?.road==="tdx");
}
function chargingTrustInfo(x){
  const profile=chargingOperatorProfile(x);
  if(x?.officialSupplemental)return {level:"official",label:"業者官方站點",detail:"即時空槍未由 TDX 驗證"};
  if(x?.road!=="tdx")return {level:"source",label:"站點資料",detail:"即時槍況未提供"};
  const updated=chargingLiveAgeLabel(x?.statusUpdatedAt);
  const info=chargingAvailabilityInfo(x);
  if(info.tier==="live")return {level:"live",label:"TDX 即時驗證",detail:updated};
  if(info.tier==="recent")return {level:"recent",label:"TDX 最近回報",detail:updated+" · 非即時"};
  if(info.tier==="stale")return {level:"stale",label:"TDX 槍況逾時",detail:updated};
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
  const availabilityInfo=chargingAvailabilityInfo(x);
  const counts=chargingLiveCounts(x);
  if(availabilityInfo.tier==="recent"){
    return note(
      counts.available>0?"最近回報有空槍":"最近回報已滿",
      "TDX "+updated+" · 非即時，出發前建議再看業者 App／現場。",
      "is-recent"
    );
  }
  if(availabilityInfo.tier==="stale"){
    const detail=profile?.key==="tesla"
      ?"TDX 狀態已逾時；Tesla App 可查看官方可用充電座。"
      :"超過 6 小時，不列入「有空槍」結果 · "+updated;
    return note("即時槍況已逾時",detail,"is-stale");
  }
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
  return '<details class="charging-live-detail">'+
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
    const d=chargingDistanceKm(x),info=chargingAvailabilityInfo(x);
    return d!=null&&["live","recent"].includes(info.tier)&&info.counts.total>0;
  }).sort((a,b)=>{
    const ta=chargingAvailabilityInfo(a).tier==="live"?0:1;
    const tb=chargingAvailabilityInfo(b).tier==="live"?0:1;
    return ta-tb||chargingDistanceKm(a)-chargingDistanceKm(b);
  }).slice(0,12);
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
    const availabilityInfo=chargingAvailabilityInfo(x);
    return '<article class="charging-compare-card '+(counts.available>0?'has-open':'is-full')+(availabilityInfo.tier==="recent"?' is-recent':'')+'">'+
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
  const nearbyAvailableMode=state.chargingSort==="nearby"&&state.chargingAvailableOnly&&Boolean(state.chargingOrigin);
  const nearbyRadiusKm=25;
  let rows=nearbyAvailableMode
    ? candidateRows.filter(x=>{
        const distance=chargingDistanceKm(x);
        return distance!=null&&distance<=nearbyRadiusKm;
      })
    : (state.chargingAvailableOnly?candidateRows.filter(chargingHasAvailableReport):candidateRows);

  rows.sort((a,b)=>{
    if(state.chargingSort!=="nearby"&&state.chargingQuick==="priorityfast"){
      const trusted=chargingPriorityFastSort(a,b);
      if(trusted)return trusted;
    }
    if(state.chargingSort==="nearby"){
      if(nearbyAvailableMode){
        const rank=chargingSortRank(a)-chargingSortRank(b);
        if(rank)return rank;
      }
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
    if(label)label.textContent=nearbyAvailableMode?"附近空槍結果":(state.chargingAvailableOnly?"只顯示有空槍":"只看有空槍");
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
    if(state.chargingSort==="nearby")context.push(nearbyAvailableMode?"25 km 內":"附近排序");
    if(state.chargingAvailableOnly&&!nearbyAvailableMode)context.push("只看空槍");
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
    if(resultCount===0&&state.chargingAvailableOnly&&!chargingLiveDatasetReady()){
      $("#chargingResultSummary").textContent="正在載入官方即時槍況…";
    }else if(nearbyAvailableMode){
      const confirmed=rows.filter(x=>chargingAvailabilityInfo(x).tier==="live"&&chargingLiveCounts(x).available>0).length;
      const recent=rows.filter(x=>chargingAvailabilityInfo(x).tier==="recent"&&chargingLiveCounts(x).available>0).length;
      const unknown=rows.filter(x=>{
        const tier=chargingAvailabilityInfo(x).tier;
        return x?.officialSupplemental||tier==="unknown"||tier==="stale";
      }).length;
      $("#chargingResultSummary").textContent="25 km 內 "+resultCount+" 站 · 已確認有空槍 "+confirmed+" 站"+(recent?" · 最近回報 "+recent+" 站":"")+(unknown?" · 空槍未確認 "+unknown+" 站":"")+suffix;
    }else if(resultCount===0&&state.chargingAvailableOnly){
      $("#chargingResultSummary").textContent="目前沒有 6 小時內的空槍回報"+(state.chargingSort==="nearby"?" · 可改看附近站點":"");
    }else if(state.chargingAvailableOnly){
      const liveCount=rows.filter(x=>chargingAvailabilityInfo(x).tier==="live").length;
      const recentCount=rows.filter(x=>chargingAvailabilityInfo(x).tier==="recent").length;
      const availabilityText=liveCount
        ?resultCount+" 站有空槍"+(recentCount?" · "+recentCount+" 站為最近回報":"")
        :resultCount+" 站最近回報有空槍 · 非即時";
      $("#chargingResultSummary").textContent=availabilityText+suffix+(context.length?" · "+context.join(" · "):"");
    }else{
      $("#chargingResultSummary").textContent=resultCount+" 站符合"+suffix+(context.length?" · "+context.join(" · "):"");
    }
    const clear=$("#chargingResultClear");
    if(clear)clear.hidden=context.length===0;
    $("#chargingResultBar")?.classList.toggle("has-filter",context.length>0);
  }
  if($("#chargingFindNow"))$("#chargingFindNow").setAttribute("aria-pressed",String(state.chargingSort==="nearby"&&state.chargingAvailableOnly));

  const unverifiedRows=state.chargingAvailableOnly?(nearbyAvailableMode?rows:candidateRows).filter(x=>{
    if(x?.officialSupplemental)return true;
    if(x?.road!=="tdx")return false;
    const tier=chargingAvailabilityInfo(x).tier;
    return tier==="stale"||tier==="unknown";
  }):[];
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
    const availabilityInfo=chargingAvailabilityInfo(x);
    const availableNow=availabilityInfo.tier==="live"&&chargingLiveCounts(x).available>0;
    const recentAvailable=availabilityInfo.tier==="recent"&&chargingLiveCounts(x).available>0;
    const profile=chargingOperatorProfile(x);
    const majorNetwork=CHARGING_MAJOR_KEYS.includes(profile?.key||"");
    const priorityNetwork=CHARGING_PRIORITY_KEYS.includes(profile?.key||"");
    const powerDecision=priorityNetwork?chargingDecisionPowerLabel(x):chargingPowerLabel(x);
    const rateDecision=majorNetwork?chargingDecisionRateLabel(x):chargingRateSummary(x.chargingRate);
    const rateSource=majorNetwork?chargingRateSourceLabel(x):"";
    const rateChecked=majorNetwork?chargingRateCheckedLabel(x):"";
    const priorityFastReason=state.chargingQuick==="priorityfast"?chargingPriorityFastReason(x):"";
    return '<article class="list-item charging-item '+(availableNow?'is-available ':'')+(recentAvailable?'is-recent-available ':'')+(majorNetwork?'is-major-network':'')+(priorityNetwork?' is-priority-network':'')+'" data-charging-key="'+esc(key)+'">'+
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
    ? '<div class="empty charging-empty charging-priority-fast-empty"><b>目前沒有同時符合的主力空槍快充</b><p>條件是 EVOASIS／U-POWER／TAIL／Tesla，且 TDX 即時或 6 小時內最近回報有空槍、單槍功率至少 100 kW。最近回報會清楚標示非即時。</p><div class="charging-empty-actions"><button class="charging-empty-primary" data-charge-relax="available">改看所有空槍</button><button class="charging-empty-secondary" data-charge-relax="fast">改看 100 kW+</button></div><small>未知槍況、逾時資料與未知功率不會混進主力快充結果。</small></div>'
    : state.chargingAvailableOnly&&!chargingLiveDatasetReady()
      ? '<div class="empty charging-empty"><b>正在載入官方即時槍況</b><p>定位已完成，TDX 充電狀態載入後會自動依距離顯示空槍，不會把尚未載入誤判成 0。</p><small>通常不需要重新按一次。</small></div>'
      : state.chargingAvailableOnly
        ? '<div class="empty charging-empty"><b>目前沒有 6 小時內的空槍回報</b><p>'+(unverifiedNote?esc(unverifiedNote)+" ":"")+'可能真的滿位，也可能業者尚未回傳新槍況。超過 6 小時的舊狀態不會被 COLA GO 當成可用。</p><button class="charging-empty-primary" data-charge-show-nearby>改看附近充電站</button><small>保留距離排序，只取消「只看空槍」</small></div>'
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
  $$("[data-charge-relax]",root).forEach(button=>button.addEventListener("click",()=>{
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
  const hasAvailability=x.available!==null&&x.available!==undefined&&Number.isFinite(Number(x.available));
  const freshness=dataAgeInfo(x.dataCollectTime);
  const live=hasAvailability&&freshness.fresh;
  const staleAvailability=hasAvailability&&!freshness.fresh;
  const available=hasAvailability?Number(x.available):null;
  const cls=!live?"":available>=20?"good":available>=5?"mid":"bad";
  const query=encodeURIComponent(x.address||((x.name||"")+" "+parkingCityName(x.city)));
  const meta=[parkingCityName(x.city),x.town].filter(Boolean).join(" · ");
  return '<article class="parking-card'+(staleAvailability?' is-stale-data':'')+'">'+
    '<div class="parking-card-top"><div><h3>'+esc(x.name||"停車場")+'</h3><span class="parking-zone">'+esc(meta)+'</span></div>'+
    (hasAvailability?'<div class="parking-space"><b class="'+cls+'">'+available+'</b><small>'+(live?'汽車剩餘':'最後剩餘')+'</small></div>':'<span class="parking-static-chip">停車場資料</span>')+
    '</div>'+
    '<div class="parking-specs">'+
      '<div><small>總格數</small><b>'+(x.total?money(Number(x.total)):"—")+'</b></div>'+
      '<div><small>車位狀態</small><b>'+(live?"官方即時":staleAvailability?"資料較舊":"未提供")+'</b></div>'+
      '<div><small>收費</small><b>'+esc(x.fare||x.chargeTime||"依現場")+'</b></div>'+
    '</div>'+
    '<div class="parking-address">'+esc(x.address||"地址由官方資料提供")+'</div>'+
    '<div class="parking-update '+(freshness.stale?'stale':'')+'">'+esc(freshness.label)+(staleAvailability?' · 請以現場為準':'')+'</div>'+
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
    const tainanInfo=dataStatusInfo(state.parkingLive);
    $("#parkingLiveTime").textContent=tainanInfo.known?tainanInfo.label:"尚無更新時間";
    $("#parkingScopeStatus").textContent=tainanInfo.live?"臺南官方即時剩餘車位":tainanInfo.hasData?"資料較舊，剩餘車位僅供參考":"即時資料暫不可用，仍可使用地圖搜尋";
    root.innerHTML=rows.length?rows.map(renderParkingCard).join(""):'<div class="empty"><b>'+(query?"找不到符合的臺南停車場":"臺南官方即時資料暫時無法取得")+'</b><p>即時車位資料暫時無法取得，仍可使用 Google Maps 或 Apple 地圖找停車場。</p></div>';
  }else if(state.parkingRemote.status==="loading"&&state.parkingRemote.city===city){
    $("#parkingLiveTime").textContent="讀取官方資料中";
    $("#parkingScopeStatus").textContent="正在讀取 "+cityName+" 官方停車資料";
    root.innerHTML='<div class="empty"><b>正在讀取 '+esc(cityName)+' 停車資料</b><p>官方停車資料暫時無法取得時，仍可使用地圖搜尋附近停車場。</p></div>';
  }else if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===city){
    const rows=parkingSelectedRows().filter(x=>!query||[x.name,x.town,x.address,x.fare].join(" ").toLowerCase().includes(query));
    const remoteInfo=dataStatusInfo(state.parkingRemote);
    $("#parkingLiveTime").textContent=remoteInfo.known?remoteInfo.label:"官方資料";
    $("#parkingScopeStatus").textContent=(remoteInfo.live?"官方停車資料":remoteInfo.stale?"資料較舊":"官方停車資料")+" · "+state.parkingRemote.items.length+" 筆";
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

async function ensureCCTV(force=false){
  if(!force&&(state.cctv.status==="ready"||state.cctvLoading))return;
  if(force&&state.cctvLoading)return;
  if(!force&&state.cctv.status==="unavailable"&&Date.now()-state.cctvLastAttempt<60000)return;
  state.cctvLastAttempt=Date.now();
  state.cctvLoading=true;
  state.cctv={...state.cctv,status:"loading",error:""};
  renderCCTV();

  try{
    const cached=force?null:JSON.parse(sessionStorage.getItem("cola-go-cctv-v1")||"null");
    if(cached&&Date.now()-cached.savedAt<6*60*60*1000&&Array.isArray(cached.items)&&cached.items.length){
      state.cctv={status:"ready",items:cached.items,source:cached.source||"官方快取",updatedAt:cached.updatedAt||new Date(cached.savedAt).toISOString(),error:""};
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
      const updatedAt=new Date().toISOString();
      state.cctv={status:"ready",items:rows,source:"TDX／交通部高速公路局",updatedAt,error:""};
      try{sessionStorage.setItem("cola-go-cctv-v1",JSON.stringify({savedAt:Date.now(),updatedAt,source:state.cctv.source,items:rows}));}catch{}
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
      const updatedAt=new Date().toISOString();
      state.cctv={status:"ready",items:rows,source:"交通部高速公路局 CCTV.xml",updatedAt,error:""};
      try{sessionStorage.setItem("cola-go-cctv-v1",JSON.stringify({savedAt:Date.now(),updatedAt,source:state.cctv.source,items:rows}));}catch{}
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

function cctvListFreshnessLabel(value,now=Date.now()){
  const time=Date.parse(value||"");
  if(!Number.isFinite(time))return "清單時間未提供";
  const minutes=Math.max(0,Math.round((now-time)/60000));
  if(minutes<2)return "清單剛更新";
  if(minutes<60)return "清單 "+minutes+" 分前更新";
  if(minutes<1440)return "清單 "+Math.round(minutes/60)+" 小時前更新";
  return "清單 "+new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(time))+" 更新";
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
    const name=button.dataset.cctvLandmark||"";
    const corridor=cctvCorridorRows(rows);
    const index=corridor.findIndex(row=>cctvCameraLandmark(row)===name);
    if(index>=0)state.cctvCorridorIndex=index;
    const input=$("#cctvSearch");
    if(input)input.value=name;
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
function cctvCorridorTravelFactor(){
  if(!["1","2","3","4","5","6"].includes(String(state.cctvRoad)))return 1;
  return state.cctvDirection==="north"||state.cctvDirection==="west"?-1:1;
}
function cctvCorridorBaseRows(rows){
  if(state.cctvRoad==="all"||state.cctvNearby||state.cctvDirection==="all")return [];
  const factor=cctvCorridorTravelFactor();
  return (rows||[])
    .filter(row=>cctvDirectionKey(row.direction)===state.cctvDirection&&Number.isFinite(cctvMileNumber(row.mile))&&Boolean(safeHttpUrl(row.stream)))
    .sort((a,b)=>factor*(cctvMileNumber(a.mile)-cctvMileNumber(b.mile))||String(a.id).localeCompare(String(b.id)));
}
function cctvCorridorRows(rows){
  const base=cctvCorridorBaseRows(rows);
  let scoped=base;
  if(state.cctvSegmentStartId&&state.cctvSegmentEndId){
    const a=base.findIndex(row=>String(row.id)===String(state.cctvSegmentStartId));
    const b=base.findIndex(row=>String(row.id)===String(state.cctvSegmentEndId));
    if(a>=0&&b>=0)scoped=base.slice(Math.min(a,b),Math.max(a,b)+1);
  }
  return state.cctvCorridorMode==="landmarks"?scoped.filter(row=>Boolean(cctvCameraLandmark(row))):scoped;
}
function cctvCorridorSegmentLandmarks(rows){
  return cctvCorridorNamedRows(cctvCorridorBaseRows(rows));
}
function clearCCTVSegment(){
  state.cctvSegmentStartId="";
  state.cctvSegmentEndId="";
  state.cctvCorridorIndex=0;
}
function cctvCorridorNamedRows(corridor){
  return (corridor||[]).map((row,index)=>({row,index,name:cctvCameraLandmark(row)})).filter(item=>item.name);
}
function cctvCorridorLandmarkWindow(corridor,index){
  const named=cctvCorridorNamedRows(corridor);
  if(named.length<=8)return named;
  let pivot=named.findIndex(item=>item.index>=index);
  if(pivot<0)pivot=named.length-1;
  const start=Math.max(0,Math.min(named.length-8,pivot-3));
  return named.slice(start,start+8);
}
function cctvCorridorNextLandmark(corridor,index){
  const item=cctvCorridorNamedRows(corridor).find(entry=>entry.index>index);
  if(!item)return null;
  const currentMile=cctvMileNumber(corridor[index]?.mile),targetMile=cctvMileNumber(item.row?.mile);
  const gap=Number.isFinite(currentMile)&&Number.isFinite(targetMile)?Math.abs(targetMile-currentMile):null;
  return {...item,gap};
}
const CCTV_SEGMENT_STORAGE_KEY="cola-go-cctv-segments-v1";
function loadCCTVSegmentStorage(){
  try{
    const saved=JSON.parse(localStorage.getItem(CCTV_SEGMENT_STORAGE_KEY)||"null");
    state.cctvSavedSegments=Array.isArray(saved?.favorites)?saved.favorites.slice(0,8):[];
    state.cctvRecentSegments=Array.isArray(saved?.recent)?saved.recent.slice(0,5):[];
  }catch{
    state.cctvSavedSegments=[];
    state.cctvRecentSegments=[];
  }
}
function persistCCTVSegmentStorage(){
  try{
    localStorage.setItem(CCTV_SEGMENT_STORAGE_KEY,JSON.stringify({
      favorites:(state.cctvSavedSegments||[]).slice(0,8),
      recent:(state.cctvRecentSegments||[]).slice(0,5)
    }));
  }catch{}
}
function cctvSegmentIdentity(segment){
  return [segment?.road,segment?.direction,segment?.startId,segment?.endId].join("|");
}
function cctvCurrentSegment(rows){
  if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return null;
  const base=cctvCorridorBaseRows(rows),start=base.find(row=>String(row.id)===String(state.cctvSegmentStartId)),end=base.find(row=>String(row.id)===String(state.cctvSegmentEndId));
  if(!start||!end)return null;
  return {
    road:state.cctvRoad,
    direction:state.cctvDirection,
    startId:start.id,
    endId:end.id,
    startName:cctvCameraLandmark(start)||cctvMileLabel(start.mile),
    endName:cctvCameraLandmark(end)||cctvMileLabel(end.mile),
    mode:state.cctvCorridorMode==="landmarks"?"landmarks":"all",
    savedAt:Date.now()
  };
}
function rememberCCTVSegment(segment){
  if(!segment)return;
  const key=cctvSegmentIdentity(segment);
  state.cctvRecentSegments=[segment,...(state.cctvRecentSegments||[]).filter(item=>cctvSegmentIdentity(item)!==key)].slice(0,5);
  persistCCTVSegmentStorage();
}
function toggleSavedCCTVSegment(segment){
  if(!segment)return false;
  const key=cctvSegmentIdentity(segment),exists=(state.cctvSavedSegments||[]).some(item=>cctvSegmentIdentity(item)===key);
  state.cctvSavedSegments=exists
    ?state.cctvSavedSegments.filter(item=>cctvSegmentIdentity(item)!==key)
    :[segment,...state.cctvSavedSegments.filter(item=>cctvSegmentIdentity(item)!==key)].slice(0,8);
  persistCCTVSegmentStorage();
  return !exists;
}
function findCCTVSegmentEndpoint(base,id,name){
  return base.find(row=>String(row.id)===String(id))||
    base.find(row=>String(cctvCameraLandmark(row)||cctvMileLabel(row.mile))===String(name||""))||
    null;
}
function applyStoredCCTVSegment(segment){
  if(!segment)return;
  state.cctvNearby=false;
  state.cctvRoad=String(segment.road||"all");
  state.cctvDirection=String(segment.direction||"all");
  state.cctvCorridorMode=segment.mode==="landmarks"?"landmarks":"all";
  const roadRows=(state.cctv.items||[]).filter(item=>state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(item.roadNo)):String(item.roadNo)===state.cctvRoad);
  clearCCTVSegment();
  const base=cctvCorridorBaseRows(roadRows);
  const start=findCCTVSegmentEndpoint(base,segment.startId,segment.startName),end=findCCTVSegmentEndpoint(base,segment.endId,segment.endName);
  if(start&&end){
    state.cctvSegmentStartId=start.id;
    state.cctvSegmentEndId=end.id;
    state.cctvCorridorIndex=0;
    rememberCCTVSegment({...segment,startId:start.id,endId:end.id,startName:cctvCameraLandmark(start)||cctvMileLabel(start.mile),endName:cctvCameraLandmark(end)||cctvMileLabel(end.mile),mode:state.cctvCorridorMode,savedAt:Date.now()});
  }
  const search=$("#cctvSearch"); if(search)search.value="";
  $$("#cctvRoadFilter button").forEach(button=>{
    const active=button.dataset.cctvRoad===state.cctvRoad;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  renderCCTV();
  void maybeEnsureCCTVTraffic();
  if(start&&end){
    $("#cctvCorridor")?.scrollIntoView({behavior:"smooth",block:"start"});
    toast("已開啟常用路段");
  }else{
    toast("這組地標目前找不到，已切到原道路與方向");
  }
}
function cctvCameraShareUrl(row){
  if(!row?.id)return "";
  const url=new URL(location.href);
  ["cctvRoad","cctvDir","cctvStart","cctvEnd","cctvStartName","cctvEndName","cctvMode","cctvCamera"].forEach(key=>url.searchParams.delete(key));
  url.searchParams.set("cctvCamera",String(row.id));
  url.hash="#cctv";
  return url.toString();
}
async function shareCCTVCamera(row){
  const url=cctvCameraShareUrl(row);
  if(!url)return;
  const title=cctvCameraLandmark(row)||cctvMileLabel(row.mile);
  const text=[cctvRoadLabel(row),cctvDirectionLabel(row.direction),title].filter(Boolean).join(" · ");
  if(navigator.share){
    try{
      await navigator.share({title:"COLA GO CCTV",text,url});
      return;
    }catch(error){
      if(error?.name==="AbortError")return;
    }
  }
  try{
    await navigator.clipboard.writeText(text+"\n"+url);
    toast("鏡頭分享連結已複製");
  }catch{
    const area=document.createElement("textarea");
    area.value=text+"\n"+url;area.setAttribute("readonly","");area.style.position="fixed";area.style.opacity="0";
    document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
    toast("鏡頭分享連結已複製");
  }
}
function readCCTVSharedCamera(){
  return new URLSearchParams(location.search).get("cctvCamera")||"";
}
function applyCCTVSharedCamera(){
  const id=readCCTVSharedCamera();
  if(!id||(location.hash&&location.hash!=="#cctv"))return false;
  const row=(state.cctv.items||[]).find(item=>String(item.id)===String(id));
  if(!row){
    toast("分享的鏡頭目前不在清單中");
    return false;
  }
  const direction=cctvDirectionKey(row.direction);
  state.cctvNearby=false;
  if(direction!=="other"){
    state.cctvRoad=["1","2","3","4","5","6"].includes(String(row.roadNo))?String(row.roadNo):"other";
    state.cctvDirection=direction;
    state.cctvCorridorMode="all";
    clearCCTVSegment();
    const roadRows=(state.cctv.items||[]).filter(item=>state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(item.roadNo)):String(item.roadNo)===state.cctvRoad);
    const corridor=cctvCorridorRows(roadRows);
    const index=corridor.findIndex(item=>String(item.id)===String(row.id));
    state.cctvCorridorIndex=index>=0?index:0;
  }
  renderCCTV();
  openCCTVViewer(row.id);
  return true;
}
function cctvSegmentShareUrl(segment){
  if(!segment)return "";
  const url=new URL(location.href);
  ["cctvRoad","cctvDir","cctvStart","cctvEnd","cctvStartName","cctvEndName","cctvMode","cctvCamera"].forEach(key=>url.searchParams.delete(key));
  url.searchParams.set("cctvRoad",segment.road||"");
  url.searchParams.set("cctvDir",segment.direction||"");
  url.searchParams.set("cctvStart",segment.startId||"");
  url.searchParams.set("cctvEnd",segment.endId||"");
  if(segment.startName)url.searchParams.set("cctvStartName",segment.startName);
  if(segment.endName)url.searchParams.set("cctvEndName",segment.endName);
  if(segment.mode==="landmarks")url.searchParams.set("cctvMode","landmarks");
  url.hash="#cctv";
  return url.toString();
}
async function shareCCTVSegment(segment){
  const url=cctvSegmentShareUrl(segment);
  if(!url)return;
  const text=(segment.startName&&segment.endName?segment.startName+" → "+segment.endName+"\n":"")+url;
  if(navigator.share){
    try{
      await navigator.share({title:"COLA GO CCTV 路段",text:segment.startName+" → "+segment.endName,url});
      return;
    }catch(error){
      if(error?.name==="AbortError")return;
    }
  }
  try{
    await navigator.clipboard.writeText(text);
    toast("路段分享連結已複製");
  }catch{
    const area=document.createElement("textarea");
    area.value=text;area.setAttribute("readonly","");area.style.position="fixed";area.style.opacity="0";
    document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
    toast("路段分享連結已複製");
  }
}
function readCCTVSharedSegment(){
  const params=new URLSearchParams(location.search);
  const road=params.get("cctvRoad"),direction=params.get("cctvDir"),startId=params.get("cctvStart"),endId=params.get("cctvEnd");
  if(!road||!direction||!startId||!endId)return null;
  return {
    road,direction,startId,endId,
    startName:params.get("cctvStartName")||"",
    endName:params.get("cctvEndName")||"",
    mode:params.get("cctvMode")==="landmarks"?"landmarks":"all",
    savedAt:Date.now()
  };
}
function applyCCTVSharedSegment(){
  const segment=readCCTVSharedSegment();
  if(!segment||(location.hash&&location.hash!=="#cctv"))return false;
  const before=state.cctvSegmentStartId+"|"+state.cctvSegmentEndId;
  applyStoredCCTVSegment(segment);
  const after=state.cctvSegmentStartId+"|"+state.cctvSegmentEndId;
  return after!==before&&Boolean(state.cctvSegmentStartId&&state.cctvSegmentEndId);
}
function renderCCTVSavedRoutes(){
  const root=$("#cctvSavedRoutes");
  if(!root)return;
  const favorites=(state.cctvSavedSegments||[]).slice(0,4),recent=(state.cctvRecentSegments||[]).filter(item=>!favorites.some(f=>cctvSegmentIdentity(f)===cctvSegmentIdentity(item))).slice(0,3);
  if(!favorites.length&&!recent.length){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  const card=(item,type,index)=>{
    const dir=CCTV_DIRECTIONS[item.direction]||item.direction||"方向";
    return '<article class="cctv-saved-route-card"><button type="button" data-cctv-saved-type="'+type+'" data-cctv-saved-index="'+index+'">'+
      '<span>'+(type==="favorite"?"常用":"最近")+'</span><b>'+esc(item.road==="other"?"其他道路":"國 "+item.road+" · "+dir)+'</b>'+
      '<small>'+esc(item.startName||"起點")+' → '+esc(item.endName||"終點")+(item.mode==="landmarks"?' · 只看地標':'')+'</small></button>'+
      '<div class="cctv-saved-route-actions"><button class="share" type="button" data-cctv-saved-share="'+type+':'+index+'" aria-label="分享這個路段">分享</button>'+
      '<button class="remove" type="button" data-cctv-saved-remove="'+type+':'+index+'" aria-label="'+(type==="favorite"?"取消常用":"移除最近")+'">'+(type==="favorite"?"取消":"移除")+'</button></div></article>';
  };
  root.hidden=false;
  root.innerHTML=
    '<div class="cctv-saved-routes-head"><div><span class="mini-label">QUICK ROUTES</span><b>常用／最近路段</b></div><div class="cctv-saved-head-actions"><small>只存在這台裝置</small>'+(recent.length?'<button type="button" data-cctv-clear-recents>清除最近</button>':"")+'</div></div>'+
    '<div class="cctv-saved-routes-list">'+
      favorites.map((item,index)=>card(item,"favorite",index)).join("")+
      recent.map((item,index)=>card(item,"recent",index)).join("")+
    '</div>';
  $$("[data-cctv-saved-type]",root).forEach(button=>button.onclick=()=>{
    const list=button.dataset.cctvSavedType==="favorite"?favorites:recent;
    applyStoredCCTVSegment(list[Number(button.dataset.cctvSavedIndex)||0]);
  });
  $$("[data-cctv-saved-share]",root).forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const [type,index]=String(button.dataset.cctvSavedShare||"").split(":");
    const list=type==="favorite"?favorites:recent;
    shareCCTVSegment(list[Number(index)||0]);
  });
  $$("[data-cctv-saved-remove]",root).forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const [type,indexRaw]=String(button.dataset.cctvSavedRemove||"").split(":"),index=Number(indexRaw)||0;
    if(type==="favorite"){
      const item=favorites[index];
      state.cctvSavedSegments=(state.cctvSavedSegments||[]).filter(row=>cctvSegmentIdentity(row)!==cctvSegmentIdentity(item));
      toast("已取消常用路段");
    }else{
      const item=recent[index];
      state.cctvRecentSegments=(state.cctvRecentSegments||[]).filter(row=>cctvSegmentIdentity(row)!==cctvSegmentIdentity(item));
      toast("已移除最近路段");
    }
    persistCCTVSegmentStorage();
    renderCCTVSavedRoutes();
    const roadRows=(state.cctv.items||[]).filter(item=>state.cctvRoad==="all"||state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(item.roadNo)):String(item.roadNo)===state.cctvRoad);
    renderCCTVCorridor(roadRows);
  });
  $("[data-cctv-clear-recents]",root)?.addEventListener("click",()=>{
    state.cctvRecentSegments=[];
    persistCCTVSegmentStorage();
    renderCCTVSavedRoutes();
    toast("最近路段已清除");
  });
  renderHomeCCTVQuickRoutes();
}
function renderHomeCCTVQuickRoutes(){
  const root=$("#homeCctvSaved");
  if(!root)return;
  const favorites=(state.cctvSavedSegments||[]).slice(0,3);
  if(!favorites.length){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  root.hidden=false;
  root.innerHTML=
    '<div class="home-cctv-saved-head"><span>常用 CCTV 路段</span><button type="button" data-go-cctv-all>全部鏡頭</button></div>'+
    '<div class="home-cctv-saved-list">'+favorites.map((item,index)=>{
      const dir=CCTV_DIRECTIONS[item.direction]||item.direction||"方向";
      const traffic=cctvRoadDirectionTrafficSummary(item.road,item.direction);
      const trafficFresh=traffic?.available?cctvTrafficFreshnessLabel(traffic):"";
      const trafficText=traffic?.available
        ?(trafficFresh+" · 同方向整體 "+traffic.speed+" km/h · "+traffic.label+(traffic.slowCount?" · "+traffic.slowCount+" 段低於 50":""))
        :"路況待取得";
      const trafficClass=traffic?.available?(traffic.speed>=80?"good":traffic.speed>=50?"mid":"bad"):"";
      return '<button type="button" data-home-cctv-route="'+index+'"><span>'+esc(item.road==="other"?"其他道路":"國 "+item.road+" · "+dir)+(item.mode==="landmarks"?' · 地標模式':'')+'</span><b>'+esc(item.startName||"起點")+' → '+esc(item.endName||"終點")+'</b>'+(trafficText?'<em class="'+trafficClass+'">'+esc(trafficText)+'</em>':"")+'</button>';
    }).join("")+'</div>';
  $$("[data-home-cctv-route]",root).forEach(button=>button.onclick=()=>{
    const segment=favorites[Number(button.dataset.homeCctvRoute)||0];
    show("cctv");
    requestAnimationFrame(()=>applyStoredCCTVSegment(segment));
  });
  $("[data-go-cctv-all]",root)?.addEventListener("click",()=>show("cctv"));
}
function cctvCorridorSegmentSummary(rows){
  if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return null;
  const corridor=cctvCorridorRows(rows);
  if(!corridor.length)return null;
  const first=cctvMileNumber(corridor[0].mile),last=cctvMileNumber(corridor[corridor.length-1].mile);
  const distance=Number.isFinite(first)&&Number.isFinite(last)?Math.abs(last-first):null;
  const landmarks=cctvCorridorNamedRows(corridor).length;
  return {distance,cameras:corridor.length,landmarks};
}
function cctvCorridorSegmentMarkup(rows){
  const named=cctvCorridorSegmentLandmarks(rows);
  if(named.length<2)return "";
  const base=cctvCorridorBaseRows(rows);
  const startValid=named.some(item=>String(item.row.id)===String(state.cctvSegmentStartId));
  const endValid=named.some(item=>String(item.row.id)===String(state.cctvSegmentEndId));
  const startId=startValid?state.cctvSegmentStartId:"";
  const endId=endValid?state.cctvSegmentEndId:"";
  const option= item=>'<option value="'+esc(item.row.id)+'">'+esc(item.name)+' · '+esc(cctvMileLabel(item.row.mile))+'</option>';
  const active=startId&&endId;
  const activeRows=active?cctvCorridorRows(rows):base,summary=active?cctvCorridorSegmentSummary(rows):null;
  const currentSegment=active?cctvCurrentSegment(rows):null;
  const saved=currentSegment&&(state.cctvSavedSegments||[]).some(item=>cctvSegmentIdentity(item)===cctvSegmentIdentity(currentSegment));
  return '<div class="cctv-corridor-segment">'+
    '<div class="cctv-corridor-segment-head"><div><span class="mini-label">TRIP SEGMENT</span><b>沿途區段</b><small>用官方地標縮小這次要看的範圍</small></div>'+(active?'<strong>'+activeRows.length+' 支</strong>':"")+'</div>'+
    (summary?'<div class="cctv-corridor-segment-summary"><b>'+(summary.distance!=null?'約 '+esc(summary.distance<10?summary.distance.toFixed(1):Math.round(summary.distance))+' km':'區段距離未提供')+'</b><span>'+summary.cameras+' 支可看鏡頭 · '+summary.landmarks+' 個官方地標</span></div>':"")+
    '<div class="cctv-corridor-segment-fields">'+
      '<label><small>從</small><select data-cctv-segment-start><option value="">選起點地標</option>'+named.map(option).join("")+'</select></label>'+
      '<label><small>到</small><select data-cctv-segment-end><option value="">選終點地標</option>'+named.map(option).join("")+'</select></label>'+
    '</div>'+
    '<div class="cctv-corridor-segment-actions">'+
      '<button type="button" data-cctv-segment-apply '+(!(startId&&endId)?'disabled':'')+'>套用這一段</button>'+
      '<button type="button" data-cctv-segment-save '+(!active?'disabled':'')+'>'+ (saved?'取消常用':'儲存常用') +'</button>'+
      '<button type="button" data-cctv-segment-share '+(!active?'disabled':'')+'>分享路段</button>'+
      '<button type="button" data-cctv-segment-clear '+(!active?'disabled':'')+'>清除區段</button>'+
    '</div>'+
  '</div>';
}
function bindCCTVCorridorSegment(root,rows){
  const start=$("[data-cctv-segment-start]",root),end=$("[data-cctv-segment-end]",root);
  if(start)start.value=state.cctvSegmentStartId||"";
  if(end)end.value=state.cctvSegmentEndId||"";
  const sync=()=>{
    state.cctvSegmentStartId=start?.value||"";
    state.cctvSegmentEndId=end?.value||"";
    const apply=$("[data-cctv-segment-apply]",root);
    if(apply)apply.disabled=!(state.cctvSegmentStartId&&state.cctvSegmentEndId);
  };
  start?.addEventListener("change",sync);
  end?.addEventListener("change",sync);
  $("[data-cctv-segment-apply]",root)?.addEventListener("click",()=>{
    sync();
    if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return;
    state.cctvCorridorIndex=0;
    const segment=cctvCurrentSegment(rows);
    rememberCCTVSegment(segment);
    renderCCTVCorridor(rows);
    renderCCTVSavedRoutes();
  });
  $("[data-cctv-segment-save]",root)?.addEventListener("click",()=>{
    const segment=cctvCurrentSegment(rows);
    const saved=toggleSavedCCTVSegment(segment);
    toast(saved?"已儲存常用路段":"已取消常用路段");
    renderCCTVCorridor(rows);
    renderCCTVSavedRoutes();
  });
  $("[data-cctv-segment-share]",root)?.addEventListener("click",()=>shareCCTVSegment(cctvCurrentSegment(rows)));
  $("[data-cctv-segment-clear]",root)?.addEventListener("click",()=>{
    clearCCTVSegment();
    renderCCTVCorridor(rows);
  });
}
function cctvCorridorHighlightRows(corridor){
  const named=cctvCorridorNamedRows(corridor);
  if(named.length<=10)return named;
  const preferred=named.filter(item=>cctvLandmarkPriority(item.name)<=2);
  const source=preferred.length>=4?preferred:named;
  if(source.length<=10)return source;
  const picked=[],used=new Set();
  for(let i=0;i<10;i++){
    const at=Math.round(i*(source.length-1)/9),item=source[at];
    if(item&&!used.has(item.index)){picked.push(item);used.add(item.index);}
  }
  return picked.sort((a,b)=>a.index-b.index);
}
function cctvCorridorHighlightsMarkup(corridor){
  if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return "";
  const highlights=cctvCorridorHighlightRows(corridor);
  if(!highlights.length)return "";
  return '<div class="cctv-corridor-highlights">'+
    '<div class="cctv-corridor-highlights-head"><div><span class="mini-label">TRIP HIGHLIGHTS</span><b>沿途重點鏡頭</b><small>依行車方向排列，優先保留交流道／系統／服務區</small></div><strong>'+highlights.length+' 個</strong></div>'+
    '<div class="cctv-corridor-highlight-list">'+highlights.map(item=>
      '<button type="button" data-cctv-highlight="'+esc(item.row.id)+'"><span>'+esc(item.name)+'</span><small>'+esc(cctvMileLabel(item.row.mile))+'</small></button>'
    ).join("")+'</div>'+
  '</div>';
}
function cctvTripBriefMarkup(rows,corridor){
  if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return "";
  const segment=cctvCurrentSegment(rows),summary=cctvCorridorSegmentSummary(rows),highlights=cctvCorridorHighlightRows(corridor);
  if(!segment||!summary)return "";
  const traffic=cctvTrafficDirectionSummary();
  const segmentSelected=Boolean(state.cctvSegmentStartId&&state.cctvSegmentEndId);
  const segmentTraffic=Boolean(traffic?.available&&traffic.scope==="segment");
  const trafficText=traffic?.available
    ?(segmentTraffic?"沿途平均 ":"同方向平均 ")+traffic.speed+" km/h · "+traffic.label+" · "+cctvTrafficFreshnessLabel(traffic)
    :(state.trafficFallbackStatus==="loading"?"沿途路況載入中":"沿途路況尚未取得");
  const trafficClass=traffic?.available?(traffic.speed>=80?"good":traffic.speed>=50?"mid":"bad"):"unknown";
  const slowTitle=segmentTraffic?"沿途較慢路段":"同方向較慢路段";
  const slowScope=segmentTraffic
    ?"僅計算目前 A→B 可可靠對應的 TDX 官方路段"
    :segmentSelected
      ?"起終點無法可靠對應，已回退整條國道同方向"
      :"整條國道同方向參考";
  const trafficNote=segmentTraffic
    ?"路況為 TDX 官方 A→B 沿途區段平均，非單一鏡頭位置瞬時速度。"
    :segmentSelected
      ?"起終點無法可靠對應 TDX 路段，已回退整條國道同方向平均；不代表單一鏡頭位置速度。"
      :"路況為同國道同方向整體官方資料，不代表單一鏡頭位置速度。";
  return '<div class="cctv-trip-brief">'+
    '<div class="cctv-trip-brief-head"><div><span class="mini-label">PRE-TRIP CHECK</span><b>出發前巡路</b><small>'+esc(segment.startName)+' → '+esc(segment.endName)+'</small></div><strong>'+ (summary.distance!=null?esc(summary.distance<10?summary.distance.toFixed(1):Math.round(summary.distance))+' km':summary.cameras+' 鏡頭') +'</strong></div>'+
    '<div class="cctv-trip-brief-metrics">'+
      '<span><small>可看鏡頭</small><b>'+summary.cameras+' 支</b></span>'+
      '<span><small>重點地標</small><b>'+highlights.length+' 個</b></span>'+
      '<span class="'+trafficClass+'"><small>路況</small><b>'+esc(trafficText)+'</b></span>'+
    '</div>'+
    (traffic?.available&&traffic.slowest?.length?'<div class="cctv-trip-slow"><div class="cctv-trip-slow-head"><span>'+esc(slowTitle)+'</span><small>'+esc(slowScope)+'</small></div><div>'+
      traffic.slowest.map(row=>{const place=cctvTrafficDestinationName(row.name),camera=place?cctvTrafficExactCamera(place):null;return '<article><span>'+esc(row.name||"官方路段")+(row.level?' · '+esc(row.level):"")+'</span><b>'+Math.round(row._speed)+' km/h</b>'+(camera?'<button class="exact" type="button" data-cctv-traffic-camera="'+esc(camera.id)+'">看'+esc(place)+'地標鏡頭</button>':place?'<button type="button" data-cctv-traffic-place="'+esc(place)+'">查'+esc(place)+'附近影像</button>':"")+'</article>';}).join("")+
    '</div></div>':"")+
    '<div class="cctv-trip-brief-actions">'+
      '<button class="go" type="button" data-cctv-trip-start '+(!highlights.length?'disabled':'')+'>開始巡重點</button>'+
      '<button type="button" data-cctv-traffic-refresh '+(state.trafficFallbackStatus==="loading"?'disabled':'')+'>更新路況</button>'+
      '<button type="button" data-cctv-traffic-detail>完整國道路況</button>'+
      '<button type="button" data-cctv-traffic-official>1968</button>'+
      '<button type="button" data-cctv-trip-share>分享路段</button>'+
    '</div>'+
    '<small class="cctv-trip-brief-note">'+esc(trafficNote)+'</small>'+
  '</div>';
}
function bindCCTVTripBrief(root,rows,corridor){
  const highlights=cctvCorridorHighlightRows(corridor);
  $("[data-cctv-trip-start]",root)?.addEventListener("click",()=>{
    const first=highlights[0];
    if(!first)return toast("這一段目前沒有可巡看的官方地標鏡頭");
    const index=corridor.findIndex(row=>String(row.id)===String(first.row.id));
    if(index>=0)state.cctvCorridorIndex=index;
    openCCTVViewer(first.row.id);
    renderCCTVCorridor(rows);
  });
  $("[data-cctv-trip-share]",root)?.addEventListener("click",()=>shareCCTVSegment(cctvCurrentSegment(rows)));
  bindCCTVTrafficContext(root);
}
function renderCCTVCorridor(rows){
  const root=$("#cctvCorridor");
  if(!root)return;
  if(state.cctvRoad==="all"||state.cctvNearby){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  if(state.cctvDirection==="all"){
    const directions=[...new Set((rows||[]).map(row=>cctvDirectionKey(row.direction)).filter(key=>key!=="other"))];
    root.hidden=false;
    root.innerHTML='<div class="cctv-corridor-prompt"><div><span class="mini-label">ROAD WATCH</span><b>選擇方向開始路段連看</b><small>先選北上／南下／東向／西向，接著可直接上一支、下一支連續查看。</small></div><div class="cctv-corridor-direction">'+directions.map(key=>'<button type="button" data-cctv-corridor-direction="'+esc(key)+'">'+esc(CCTV_DIRECTIONS[key]||key)+'</button>').join("")+'</div></div>';
    $$("[data-cctv-corridor-direction]",root).forEach(button=>button.onclick=()=>{
      state.cctvDirection=button.dataset.cctvCorridorDirection||"all";
      state.cctvCorridorMode="all";
      clearCCTVSegment();
      renderCCTV();
      void maybeEnsureCCTVTraffic();
    });
    return;
  }
  const segmentMarkup=cctvCorridorSegmentMarkup(rows);
  const corridor=cctvCorridorRows(rows);
  if(!corridor.length){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  const index=Math.max(0,Math.min(Number(state.cctvCorridorIndex)||0,corridor.length-1));
  state.cctvCorridorIndex=index;
  const current=corridor[index],stream=safeHttpUrl(current.stream),landmark=cctvCameraLandmark(current);
  const title=landmark||cctvMileLabel(current.mile),place=cctvPlaceLabel(current);
  const quick=cctvCorridorLandmarkWindow(corridor,index),nextLandmark=cctvCorridorNextLandmark(corridor,index);
  root.hidden=false;
  root.innerHTML=
    segmentMarkup+
    cctvTripBriefMarkup(rows,corridor)+
    '<div class="cctv-corridor-mode"><span>巡看模式</span><div><button type="button" data-cctv-corridor-mode="all" aria-pressed="'+(state.cctvCorridorMode==="all")+'">全部鏡頭</button><button type="button" data-cctv-corridor-mode="landmarks" aria-pressed="'+(state.cctvCorridorMode==="landmarks")+'">只看地標</button></div></div>'+
    '<div class="cctv-corridor-head"><div><span class="mini-label">ROAD WATCH</span><b>路段連看</b><small>'+esc(cctvRoadLabel(current))+' · '+esc(cctvDirectionLabel(current.direction))+' · '+corridor.length+' 支可看鏡頭 · '+(state.cctvCorridorMode==="landmarks"?'只看官方地標':'依行車方向排序')+(state.cctvSegmentStartId&&state.cctvSegmentEndId?' · 已套用沿途區段':'')+'</small></div><strong>'+(index+1)+' / '+corridor.length+'</strong></div>'+
    '<div class="cctv-corridor-current"><div><b>'+esc(title)+'</b><p>'+esc(place)+'</p><small>'+esc(cctvMileLabel(current.mile))+' · '+esc(current.id)+'</small></div>'+
      (nextLandmark?'<div class="cctv-corridor-next"><span>下一個官方地標</span><b>'+esc(nextLandmark.name)+'</b>'+(nextLandmark.gap!=null?'<small>里程差約 '+esc(nextLandmark.gap<10?nextLandmark.gap.toFixed(1):Math.round(nextLandmark.gap))+' km</small>':"")+'</div>':"")+
      '<div class="cctv-corridor-range"><small>'+esc(cctvMileLabel(corridor[0].mile))+'</small><input type="range" min="0" max="'+(corridor.length-1)+'" value="'+index+'" step="1" data-cctv-corridor-range aria-label="路段鏡頭位置"/><small>'+esc(cctvMileLabel(corridor[corridor.length-1].mile))+'</small></div>'+
      '<div class="cctv-corridor-actions">'+
        '<button type="button" data-cctv-corridor="-1" '+(index===0?'disabled':'')+'>上一支</button>'+
        '<button class="go" type="button" data-cctv-viewer="'+esc(current.id)+'">看即時影像</button>'+
        '<button type="button" data-cctv-corridor="1" '+(index===corridor.length-1?'disabled':'')+'>下一支</button>'+
      '</div>'+
      '<div class="cctv-corridor-secondary"><button type="button" data-cctv-corridor-card="'+esc(current.id)+'">看鏡頭卡</button>'+
      (cctvHasMap(current)?'<button type="button" data-cctv-map="'+current.lat+','+current.lon+'">地圖位置</button>':"")+'</div>'+
    '</div>'+
    cctvCorridorHighlightsMarkup(corridor)+
    (quick.length?'<div class="cctv-corridor-landmarks">'+quick.map(item=>{
      const active=item.index===index;
      return '<button type="button" data-cctv-corridor-index="'+item.index+'" aria-pressed="'+active+'">'+esc(item.name)+'<small>'+esc(cctvMileLabel(item.row.mile))+'</small></button>';
    }).join("")+'</div>':"");
  bindCCTVCorridorSegment(root,rows);
  bindCCTVTripBrief(root,rows,corridor);
  $$("[data-cctv-corridor-mode]",root).forEach(button=>button.onclick=()=>{
    state.cctvCorridorMode=button.dataset.cctvCorridorMode==="landmarks"?"landmarks":"all";
    state.cctvCorridorIndex=0;
    renderCCTVCorridor(rows);
  });
  $("[data-cctv-corridor-range]",root)?.addEventListener("change",event=>{
    state.cctvCorridorIndex=Math.max(0,Math.min(corridor.length-1,Number(event.target.value)||0));
    renderCCTVCorridor(rows);
  });
  $$("[data-cctv-corridor]",root).forEach(button=>button.onclick=()=>{
    state.cctvCorridorIndex=Math.max(0,Math.min(corridor.length-1,index+Number(button.dataset.cctvCorridor||0)));
    renderCCTVCorridor(rows);
  });
  $$("[data-cctv-corridor-index]",root).forEach(button=>button.onclick=()=>{
    state.cctvCorridorIndex=Number(button.dataset.cctvCorridorIndex)||0;
    renderCCTVCorridor(rows);
  });
  bindCCTVViewerButtons(root);
  $$("[data-cctv-highlight]",root).forEach(button=>button.onclick=()=>{
    const targetIndex=corridor.findIndex(row=>String(row.id)===String(button.dataset.cctvHighlight));
    if(targetIndex>=0)state.cctvCorridorIndex=targetIndex;
    openCCTVViewer(button.dataset.cctvHighlight);
    renderCCTVCorridor(rows);
  });
  $$("[data-cctv-corridor-card]",root).forEach(button=>button.onclick=()=>{
    const target=$('[data-cctv-camera-id="'+CSS.escape(button.dataset.cctvCorridorCard)+'"]');
    target?.scrollIntoView({behavior:"smooth",block:"center"});
    target?.classList.add("cctv-camera-focus");
    setTimeout(()=>target?.classList.remove("cctv-camera-focus"),1800);
  });
  $$("[data-cctv-map]",root).forEach(button=>button.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(button.dataset.cctvMap),"_blank","noopener"));
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
function cctvTravelFactorFor(x){
  const roadNo=String(x?.roadNo||""),direction=cctvDirectionKey(x?.direction);
  if(!["1","2","3","4","5","6"].includes(roadNo))return 1;
  return direction==="north"||direction==="west"?-1:1;
}
function cctvViewerSegmentRows(row){
  const roadNo=String(row?.roadNo||""),road=cctvRoadLabel(row),direction=cctvDirectionKey(row?.direction),factor=cctvTravelFactorFor(row);
  let rows=(state.cctv.items||[]).filter(item=>
    (String(item?.roadNo||"")===roadNo||(!roadNo&&cctvRoadLabel(item)===road))&&
    cctvDirectionKey(item?.direction)===direction&&Number.isFinite(cctvMileNumber(item?.mile))&&Boolean(safeHttpUrl(item.stream))
  ).sort((a,b)=>factor*(cctvMileNumber(a.mile)-cctvMileNumber(b.mile))||String(a.id).localeCompare(String(b.id)));
  const selectedRoad=state.cctvRoad!=="all"&&(String(state.cctvRoad)===roadNo||(state.cctvRoad==="other"&&!["1","2","3","4","5","6"].includes(roadNo)));
  if(selectedRoad&&state.cctvDirection===direction&&state.cctvSegmentStartId&&state.cctvSegmentEndId){
    const a=rows.findIndex(item=>String(item.id)===String(state.cctvSegmentStartId));
    const b=rows.findIndex(item=>String(item.id)===String(state.cctvSegmentEndId));
    if(a>=0&&b>=0)rows=rows.slice(Math.min(a,b),Math.max(a,b)+1);
  }
  if(selectedRoad&&state.cctvDirection===direction&&state.cctvCorridorMode==="landmarks")rows=rows.filter(item=>Boolean(cctvCameraLandmark(item)));
  return rows;
}
function cctvAdjacentLandmark(row,delta){
  const rows=cctvViewerSegmentRows(row),index=rows.findIndex(item=>String(item.id)===String(row?.id));
  if(index<0)return null;
  if(delta<0){
    for(let i=index-1;i>=0;i--)if(cctvCameraLandmark(rows[i]))return rows[i];
  }else{
    for(let i=index+1;i<rows.length;i++)if(cctvCameraLandmark(rows[i]))return rows[i];
  }
  return null;
}
function cctvAdjacentCamera(x,delta){
  const roadNo=String(x?.roadNo||""),road=cctvRoadLabel(x),direction=cctvDirectionKey(x?.direction),factor=cctvTravelFactorFor(x);
  let rows=(state.cctv.items||[]).filter(row=>
    (String(row?.roadNo||"")===roadNo||(!roadNo&&cctvRoadLabel(row)===road))&&
    cctvDirectionKey(row?.direction)===direction&&Number.isFinite(cctvMileNumber(row?.mile))&&Boolean(safeHttpUrl(row.stream))
  ).sort((a,b)=>factor*(cctvMileNumber(a.mile)-cctvMileNumber(b.mile))||String(a.id).localeCompare(String(b.id)));
  const selectedRoad=state.cctvRoad!=="all"&&(String(state.cctvRoad)===roadNo||(state.cctvRoad==="other"&&!["1","2","3","4","5","6"].includes(roadNo)));
  const selectedDirection=state.cctvDirection===direction;
  if(selectedRoad&&selectedDirection&&state.cctvSegmentStartId&&state.cctvSegmentEndId){
    const a=rows.findIndex(row=>String(row.id)===String(state.cctvSegmentStartId));
    const b=rows.findIndex(row=>String(row.id)===String(state.cctvSegmentEndId));
    if(a>=0&&b>=0)rows=rows.slice(Math.min(a,b),Math.max(a,b)+1);
  }
  if(selectedRoad&&selectedDirection&&state.cctvCorridorMode==="landmarks")rows=rows.filter(row=>Boolean(cctvCameraLandmark(row)));
  const index=rows.findIndex(row=>String(row.id)===String(x?.id));
  if(index<0)return null;
  return rows[index+delta]||null;
}
function cctvAdjacentActionMarkup(x){
  const prev=cctvAdjacentCamera(x,-1),next=cctvAdjacentCamera(x,1);
  const prevStream=prev?safeHttpUrl(prev.stream):"",nextStream=next?safeHttpUrl(next.stream):"";
  if(!prevStream&&!nextStream)return "";
  return '<div class="cctv-adjacent-actions">'+
    (prevStream?'<button data-cctv-viewer="'+esc(prev.id)+'" title="'+esc(cctvMileLabel(prev.mile))+'">前一支</button>':"")+
    (nextStream?'<button data-cctv-viewer="'+esc(next.id)+'" title="'+esc(cctvMileLabel(next.mile))+'">後一支</button>':"")+
  '</div>';
}
function cctvViewerTrafficSummary(row){
  const roadNo=String(row?.roadNo||""),direction=cctvDirectionKey(row?.direction);
  if(!["1","2","3","4","5","6"].includes(roadNo)||direction==="other")return null;
  const rows=state.traffic?.highways?.[roadNo]||[];
  const valid=rows.filter(item=>cctvDirectionKey(item.direction)===direction).map(item=>Number(item.speed)).filter(speed=>speed>0&&speed<200);
  if(!valid.length)return null;
  const speed=Math.round(valid.reduce((sum,value)=>sum+value,0)/valid.length);
  const slowCount=valid.filter(value=>value<50).length;
  const newest=rows.filter(item=>cctvDirectionKey(item.direction)===direction).map(item=>item.dataCollectTime).filter(Boolean).sort().at(-1)||state.traffic?.updatedAt||"";
  return {speed,slowCount,label:speed>=80?"順暢":speed>=50?"車多":"壅塞",updatedAt:newest,status:state.traffic?.status||"unknown"};
}
function ensureCCTVViewer(){
  let root=$("#cctvViewer");
  if(root)return root;
  document.body.insertAdjacentHTML("beforeend",
    '<div class="cctv-viewer" id="cctvViewer" hidden role="dialog" aria-modal="true" aria-label="CCTV 即時影像" tabindex="-1">'+
      '<button class="cctv-viewer-backdrop" data-cctv-viewer-close aria-label="關閉即時影像"></button>'+
      '<section class="cctv-viewer-panel">'+
        '<div class="cctv-viewer-head"><div><span class="mini-label">LIVE CCTV</span><b id="cctvViewerTitle">即時影像</b><small id="cctvViewerMeta"></small></div><button data-cctv-viewer-close type="button">關閉</button></div>'+
        '<div class="cctv-viewer-traffic" id="cctvViewerTraffic" hidden></div>'+
        '<div class="cctv-viewer-state" id="cctvViewerState" data-state="idle">等待影像</div>'+
        '<div class="cctv-viewer-data-note">即時影像會使用較多行動數據；切到背景或關閉觀看器會自動停止串流。</div>'+
        '<div class="cctv-viewer-image"><img id="cctvViewerImage" alt="官方 CCTV 即時影像"/></div>'+
        '<div class="cctv-viewer-actions" id="cctvViewerActions"></div>'+
      '</section>'+
    '</div>'
  );
  root=$("#cctvViewer");
  $$("[data-cctv-viewer-close]",root).forEach(button=>button.onclick=closeCCTVViewer);
  let touchX=null,touchY=null;
  root.addEventListener("touchstart",event=>{
    const touch=event.changedTouches?.[0];
    touchX=touch?.clientX??null;touchY=touch?.clientY??null;
  },{passive:true});
  root.addEventListener("touchend",event=>{
    const touch=event.changedTouches?.[0];
    if(touchX==null||touchY==null||!touch)return;
    const dx=touch.clientX-touchX,dy=touch.clientY-touchY;
    touchX=null;touchY=null;
    if(Math.abs(dx)<60||Math.abs(dx)<=Math.abs(dy)*1.25)return;
    const row=(state.cctv.items||[]).find(item=>String(item.id)===String(state.cctvViewerId));
    if(!row)return;
    const target=cctvAdjacentCamera(row,dx<0?1:-1);
    if(target)openCCTVViewer(target.id);
  },{passive:true});
  root.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();closeCCTVViewer();return;}
    if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
    const row=(state.cctv.items||[]).find(item=>String(item.id)===String(state.cctvViewerId));
    if(!row)return;
    const target=cctvAdjacentCamera(row,event.key==="ArrowRight"?1:-1);
    if(target){event.preventDefault();openCCTVViewer(target.id);}
  });
  if(!ensureCCTVViewer.visibilityBound){
    document.addEventListener("visibilitychange",()=>{
      const viewer=$("#cctvViewer"),image=$("#cctvViewerImage");
      if(!viewer||viewer.hidden||!state.cctvViewerId)return;
      if(document.hidden){
        if(image)image.removeAttribute("src");
        setCCTVViewerState("paused","已切到背景，串流暫停以節省流量");
      }else{
        reloadCCTVViewerImage();
      }
    });
    ensureCCTVViewer.visibilityBound=true;
  }
  return root;
}
function setCCTVViewerState(state,text){
  const node=$("#cctvViewerState");
  if(!node)return;
  node.dataset.state=state;
  node.textContent=text;
}
function reloadCCTVViewerImage(){
  const id=state.cctvViewerId,row=(state.cctv.items||[]).find(item=>String(item.id)===String(id)),stream=row?safeHttpUrl(row.stream):"";
  const image=$("#cctvViewerImage");
  if(!image||!stream)return;
  setCCTVViewerState("loading","影像載入中…");
  image.removeAttribute("src");
  requestAnimationFrame(()=>{image.src=stream+(stream.includes("?")?"&":"?")+"_="+Date.now();});
}
function closeCCTVViewer(){
  const root=$("#cctvViewer"),image=$("#cctvViewerImage");
  if(image){image.onload=null;image.onerror=null;image.removeAttribute("src");}
  if(root){root.hidden=true;root.classList.remove("is-expanded");}
  state.cctvViewerId="";
  setCCTVViewerState("idle","等待影像");
  document.body.classList.remove("has-cctv-viewer");
}
function openCCTVViewer(id){
  const row=(state.cctv.items||[]).find(item=>String(item.id)===String(id)),stream=row?safeHttpUrl(row.stream):"";
  if(!row||!stream)return toast("這支鏡頭目前沒有可開啟的官方影像");
  const root=ensureCCTVViewer(),title=$("#cctvViewerTitle"),meta=$("#cctvViewerMeta"),trafficNode=$("#cctvViewerTraffic"),image=$("#cctvViewerImage"),actions=$("#cctvViewerActions");
  const landmark=cctvCameraLandmark(row),prev=cctvAdjacentCamera(row,-1),next=cctvAdjacentCamera(row,1),traffic=cctvViewerTrafficSummary(row);
  const prevLandmark=cctvAdjacentLandmark(row,-1),nextLandmark=cctvAdjacentLandmark(row,1);
  state.cctvViewerId=String(row.id);
  if(title)title.textContent=landmark||cctvMileLabel(row.mile);
  if(meta)meta.textContent=[cctvRoadLabel(row),cctvDirectionLabel(row.direction),cctvMileLabel(row.mile),cctvPlaceLabel(row),"影像：官方串流直連",state.cctvSegmentStartId&&state.cctvSegmentEndId?"沿途區段內切換":"左右滑動切換鏡頭"].filter(Boolean).join(" · ");
  if(trafficNode){
    trafficNode.hidden=!traffic;
    trafficNode.className="cctv-viewer-traffic"+(traffic?" "+(traffic.speed>=80?"good":traffic.speed>=50?"mid":"bad"):"");
    trafficNode.innerHTML=traffic?'<span>同方向路況</span><b>平均 '+traffic.speed+' km/h · '+esc(traffic.label)+'</b><small>'+esc(cctvTrafficFreshnessLabel(traffic))+' · '+(traffic.slowCount?traffic.slowCount+' 段低於 50 km/h':'無低於 50 km/h 路段')+' · 方向整體，非此鏡頭所在地速度</small>':"";
  }
  if(image){
    image.alt=[cctvRoadLabel(row),cctvDirectionLabel(row.direction),landmark||cctvMileLabel(row.mile),"官方 CCTV 即時影像"].join(" · ");
    image.onload=()=>setCCTVViewerState("ready","官方即時影像已連線");
    image.onerror=()=>setCCTVViewerState("error","影像暫時無法載入，可重新載入或開官方原始影像");
  }
  setCCTVViewerState("loading","影像載入中…");
  if(image)image.src=stream;
  if(actions)actions.innerHTML=
    '<button type="button" data-cctv-viewer-nav="'+(prev?esc(prev.id):"")+'" '+(!prev?'disabled':'')+'>上一支</button>'+
    '<button type="button" data-cctv-viewer-landmark="'+(prevLandmark?esc(prevLandmark.id):"")+'" '+(!prevLandmark?'disabled':'')+'>上一地標</button>'+
    (cctvHasMap(row)?'<button type="button" data-cctv-viewer-map="'+row.lat+','+row.lon+'">地圖位置</button>':"")+
    '<button type="button" data-cctv-viewer-reload>重新載入</button>'+
    '<button type="button" data-cctv-viewer-expand>'+(root.classList.contains("is-expanded")?"縮小影像":"放大影像")+'</button>'+
    '<button type="button" data-cctv-viewer-share>分享鏡頭</button>'+
    '<button type="button" data-cctv-viewer-original="'+esc(encodeURIComponent(stream))+'">官方原始影像</button>'+
    (["1","2","3","4","5","6"].includes(String(row.roadNo))?'<button type="button" data-cctv-viewer-traffic="'+esc(row.roadNo)+'">完整路況</button>':"")+
    '<button type="button" data-cctv-viewer-landmark="'+(nextLandmark?esc(nextLandmark.id):"")+'" '+(!nextLandmark?'disabled':'')+'>下一地標</button>'+
    '<button type="button" data-cctv-viewer-nav="'+(next?esc(next.id):"")+'" '+(!next?'disabled':'')+'>下一支</button>';
  $$("[data-cctv-viewer-nav]",actions).forEach(button=>button.onclick=()=>{if(button.dataset.cctvViewerNav)openCCTVViewer(button.dataset.cctvViewerNav);});
  $$("[data-cctv-viewer-landmark]",actions).forEach(button=>button.onclick=()=>{if(button.dataset.cctvViewerLandmark)openCCTVViewer(button.dataset.cctvViewerLandmark);});
  $$("[data-cctv-viewer-map]",actions).forEach(button=>button.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(button.dataset.cctvViewerMap),"_blank","noopener"));
  $("[data-cctv-viewer-reload]",actions)?.addEventListener("click",reloadCCTVViewerImage);
  $("[data-cctv-viewer-expand]",actions)?.addEventListener("click",event=>{
    const expanded=root.classList.toggle("is-expanded");
    event.currentTarget.textContent=expanded?"縮小影像":"放大影像";
  });
  $("[data-cctv-viewer-share]",actions)?.addEventListener("click",()=>shareCCTVCamera(row));
  $$("[data-cctv-viewer-original]",actions).forEach(button=>button.onclick=()=>window.open(decodeURIComponent(button.dataset.cctvViewerOriginal),"_blank","noopener"));
  $$("[data-cctv-viewer-traffic]",actions).forEach(button=>button.onclick=()=>{
    const road=button.dataset.cctvViewerTraffic;
    closeCCTVViewer();
    openTrafficForRoad(road);
  });
  root.hidden=false;
  document.body.classList.add("has-cctv-viewer");
  root.focus({preventScroll:true});
}
function bindCCTVViewerButtons(root){
  $$("[data-cctv-viewer]",root||document).forEach(button=>button.onclick=()=>openCCTVViewer(button.dataset.cctvViewer));
}
function focusCCTVCorridorFromCamera(id){
  const row=(state.cctv.items||[]).find(item=>String(item.id)===String(id));
  if(!row)return toast("找不到這支攝影機");
  const direction=cctvDirectionKey(row.direction);
  if(direction==="other")return toast("這支鏡頭缺少可辨識方向，請用搜尋或地圖查看");
  state.cctvNearby=false;
  state.cctvRoad=["1","2","3","4","5","6"].includes(String(row.roadNo))?String(row.roadNo):"other";
  state.cctvDirection=direction;
  clearCCTVSegment();
  const roadRows=(state.cctv.items||[]).filter(item=>state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(item.roadNo)):String(item.roadNo)===state.cctvRoad);
  const corridor=cctvCorridorRows(roadRows);
  const index=corridor.findIndex(item=>String(item.id)===String(row.id));
  state.cctvCorridorIndex=index>=0?index:0;
  const search=$("#cctvSearch"); if(search)search.value="";
  $$("#cctvRoadFilter button").forEach(button=>{
    const active=button.dataset.cctvRoad===state.cctvRoad;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  renderCCTV();
  void maybeEnsureCCTVTraffic();
  $("#cctvCorridor")?.scrollIntoView({behavior:"smooth",block:"start"});
}
function renderCCTVNearby(rows){
  const nearby=cctvNearbyRows(rows);
  if(!nearby.length)return '<div class="empty"><b>附近沒有可定位的官方攝影機</b><p>可以改用道路或地名搜尋。</p></div>';
  return '<div class="cctv-nearby-list">'+nearby.map(({row,distance},index)=>{
    const stream=safeHttpUrl(row.stream),landmark=cctvCameraLandmark(row),title=landmark||cctvMileLabel(row.mile);
    return '<article class="cctv-nearby-card">'+
      '<div class="cctv-nearby-rank">'+(index+1)+'</div>'+
      '<div class="cctv-nearby-info"><div class="cctv-nearby-route"><i>'+esc(cctvRoadLabel(row))+'</i><i>'+esc(cctvDirectionLabel(row.direction))+'</i></div><b>'+esc(title)+'</b><small>'+esc(cctvMileLabel(row.mile))+' · 攝影機 '+esc(row.id)+'</small><span>'+esc(distance<10?distance.toFixed(1):Math.round(distance))+' km</span></div>'+
      '<div class="cctv-nearby-actions">'+(stream?'<button class="go" data-cctv-viewer="'+esc(row.id)+'">看影像</button>':"")+
      '<button data-cctv-focus="'+esc(row.id)+'">從這裡連看</button>'+
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
function renderCCTVGroups(groups,limit=groups.length){
  if(!groups.length)return '<div class="empty"><b>沒有符合的攝影機</b><p>可搜尋交流道、服務區、地名或里程。官方資料缺少地名時，請改用道路或里程查找。</p></div>';
  const visible=groups.slice(0,Math.max(1,limit));
  const markup=visible.map((g,index)=>{
    const miles=g.items.map(x=>cctvMileNumber(x.mile)).filter(Number.isFinite);
    const range=miles.length?(cctvMileLabel(Math.min(...miles))+(Math.max(...miles)!==Math.min(...miles)?"–"+cctvMileLabel(Math.max(...miles)):"")):"里程未提供";
    const landmarks=cctvGroupLandmarks(g);
    return '<details class="cctv-group"><summary><span class="cctv-group-kicker">'+esc(g.direction)+' · '+esc(g.road)+'</span><strong>'+esc(g.place)+'</strong>'+(landmarks.length?'<span class="cctv-group-landmarks">'+landmarks.map(name=>'<i>'+esc(name)+'</i>').join("")+'</span>':"")+'<span class="cctv-group-meta">'+g.items.length+' 支鏡頭 · '+esc(range)+'</span><span class="cctv-group-toggle" aria-hidden="true">⌄</span></summary><div class="cctv-cameras">'+g.items.map(x=>{
      const stream=safeHttpUrl(x.stream),landmark=cctvCameraLandmark(x);
      return '<article class="cctv-camera'+(landmark?' has-landmark':'')+'" data-cctv-camera-id="'+esc(x.id)+'"><div class="cctv-camera-info"><b>'+esc(landmark||cctvMileLabel(x.mile))+'</b><small>'+(landmark?esc(cctvMileLabel(x.mile))+' · ':"")+'攝影機 '+esc(x.id)+'</small></div><div class="cctv-camera-actions">'+
        (stream?'<button class="go" data-cctv-viewer="'+esc(x.id)+'">觀看即時影像</button>':'<span class="muted">影像網址未提供</span>')+
        '<button data-cctv-focus="'+esc(x.id)+'">從這裡連看</button>'+
        (cctvHasMap(x)?'<button data-cctv-map="'+x.lat+','+x.lon+'">地圖位置</button>':"")+
        cctvAdjacentActionMarkup(x)+'</div></article>';
    }).join("")+'</div></details>';
  }).join("");
  const more=visible.length<groups.length
    ?'<div class="cctv-more-groups"><button type="button" data-cctv-more-groups>載入更多路段</button><small>已顯示 '+visible.length+' / '+groups.length+' 路段</small></div>'
    :"";
  return markup+more;
}
function selectCCTVRoad(road){
  state.cctvNearby=false;
  state.cctvRoad=String(road||"all");
  state.cctvDirection="all";
  state.cctvGroupLimit=24;
  state.cctvCorridorMode="all";
  clearCCTVSegment();
  $("#cctvNearbyBtn")?.setAttribute("aria-pressed","false");
  $$("#cctvRoadFilter button").forEach(b=>{
    const active=b.dataset.cctvRoad===state.cctvRoad;
    b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
  });
  renderCCTV();
}
function cctvTrafficDestinationName(name){
  const text=String(name||"").trim();
  const inside=text.match(/\(([^()]*)\)/)?.[1]||text;
  const parts=inside.split("到").map(x=>x.trim()).filter(Boolean);
  return parts.length>=2?parts.at(-1):"";
}
function searchCCTVByTrafficPlace(place){
  const query=String(place||"").trim();
  if(!query)return toast("這個官方路段沒有可用地名");
  const input=$("#cctvSearch");
  if(input)input.value=query;
  state.cctvGroupLimit=24;
  renderCCTV();
  toast("已搜尋「"+query+"」附近官方鏡頭");
  $("#cctvList")?.scrollIntoView({behavior:"smooth",block:"start"});
}
function cctvTrafficExactCamera(place){
  const key=cctvTrafficPlaceKey(place);
  if(!key||!["1","2","3","4","5","6"].includes(String(state.cctvRoad))||state.cctvDirection==="all")return null;
  const roadRows=(state.cctv.items||[]).filter(row=>String(row.roadNo)===String(state.cctvRoad));
  const scoped=cctvCorridorRows(roadRows);
  return scoped.find(row=>
    cctvDirectionKey(row.direction)===state.cctvDirection&&
    Boolean(safeHttpUrl(row.stream))&&
    cctvTrafficPlaceKey(cctvCameraLandmark(row))===key
  )||null;
}
function openCCTVTrafficCamera(id){
  const row=(state.cctv.items||[]).find(item=>String(item.id)===String(id));
  if(!row)return toast("這支官方地標鏡頭目前找不到");
  const roadRows=(state.cctv.items||[]).filter(item=>String(item.roadNo)===String(state.cctvRoad));
  const corridor=cctvCorridorRows(roadRows);
  const index=corridor.findIndex(item=>String(item.id)===String(row.id));
  if(index>=0)state.cctvCorridorIndex=index;
  openCCTVViewer(row.id);
  renderCCTVCorridor(roadRows);
}

function cctvTrafficPlaceKey(value){
  return String(value||"").trim()
    .replace(/^國道\d+號/,"")
    .replace(/交流道$/,"")
    .replace(/[\s　]/g,"")
    .replace(/[－—–-]/g,"")
    .toLowerCase();
}
function cctvTrafficSectionEndpoints(name){
  const text=String(name||"").trim(),inside=text.match(/\(([^()]*)\)/)?.[1]||text;
  const parts=inside.split("到").map(part=>cctvTrafficPlaceKey(part)).filter(Boolean);
  return parts.length>=2?{from:parts[0],to:parts.at(-1)}:null;
}
function cctvTrafficSelectedSegment(){
  if(!state.cctvSegmentStartId||!state.cctvSegmentEndId)return null;
  const items=state.cctv.items||[];
  const start=items.find(row=>String(row.id)===String(state.cctvSegmentStartId));
  const end=items.find(row=>String(row.id)===String(state.cctvSegmentEndId));
  if(!start||!end)return null;
  const startName=cctvCameraLandmark(start)||"",endName=cctvCameraLandmark(end)||"";
  const startKey=cctvTrafficPlaceKey(startName),endKey=cctvTrafficPlaceKey(endName);
  if(!startKey||!endKey)return null;
  return {startName,endName,startKey,endKey};
}
function cctvTrafficFindPath(rows,startKey,endKey){
  if(!startKey||!endKey||startKey===endKey)return [];
  const edges=(rows||[]).map((row,index)=>{
    const endpoints=cctvTrafficSectionEndpoints(row.name);
    return endpoints?{row,index,...endpoints}:null;
  }).filter(Boolean);
  const byFrom=new Map();
  edges.forEach(edge=>{
    if(!byFrom.has(edge.from))byFrom.set(edge.from,[]);
    byFrom.get(edge.from).push(edge);
  });
  const queue=[{key:startKey,path:[]}],seen=new Set([startKey]);
  while(queue.length){
    const current=queue.shift();
    for(const edge of byFrom.get(current.key)||[]){
      const path=[...current.path,edge.row];
      if(edge.to===endKey)return path;
      if(!seen.has(edge.to)&&path.length<80){
        seen.add(edge.to);
        queue.push({key:edge.to,path});
      }
    }
  }
  return [];
}
function cctvTrafficSegmentRows(rows){
  const segment=cctvTrafficSelectedSegment();
  if(!segment)return null;
  let path=cctvTrafficFindPath(rows,segment.startKey,segment.endKey),reversed=false;
  if(!path.length){
    path=cctvTrafficFindPath(rows,segment.endKey,segment.startKey);
    reversed=Boolean(path.length);
  }
  return path.length?{rows:path,segment,reversed}:null;
}
function cctvTrafficMetrics(rows,scope="direction",scopeLabel=""){
  const valid=(rows||[]).map(row=>({...row,_speed:Number(row.speed)})).filter(row=>row._speed>0&&row._speed<200);
  if(!valid.length)return {available:false,rows:(rows||[]).length,scope,scopeLabel};
  const speeds=valid.map(row=>row._speed);
  const speed=Math.round(speeds.reduce((sum,value)=>sum+value,0)/speeds.length);
  const newest=valid.map(row=>row.dataCollectTime).filter(Boolean).sort().at(-1)||state.traffic?.updatedAt||"";
  const label=speed>=80?"順暢":speed>=50?"車多":"壅塞";
  const slow=valid.reduce((best,row)=>!best||row._speed<best._speed?row:best,null);
  const slowCount=valid.filter(row=>row._speed<50).length;
  const slowest=valid.slice().sort((a,b)=>a._speed-b._speed||String(a.name||"").localeCompare(String(b.name||""),"zh-Hant")).slice(0,3);
  return {available:true,speed,label,rows:valid.length,slowCount,minSpeed:Math.round(slow?._speed||0),slowName:String(slow?.name||"").trim(),slowest,updatedAt:newest,status:state.traffic?.status||"unknown",scope,scopeLabel};
}
function cctvRoadDirectionTrafficSummary(road,direction){
  if(!["1","2","3","4","5","6"].includes(String(road))||!direction||direction==="all")return null;
  const rows=state.traffic?.highways?.[String(road)]||[];
  const matched=rows.filter(row=>cctvDirectionKey(row.direction)===direction);
  return cctvTrafficMetrics(matched,"direction","");
}
async function maybeEnsureCCTVTraffic(){
  if(state.cctvNearby||!["1","2","3","4","5","6"].includes(String(state.cctvRoad))||!state.cctvDirection||state.cctvDirection==="all")return;
  const summary=cctvRoadDirectionTrafficSummary(state.cctvRoad,state.cctvDirection);
  if(state.traffic?.status==="live"&&summary?.available)return;
  if(state.traffic?.status==="live"||state.trafficFallbackStatus==="loading")return;
  await ensureClientTraffic();
  if($('[data-view="cctv"].active'))renderCCTV();
}
function cctvTrafficFreshnessLabel(traffic,now=Date.now()){
  if(!traffic)return "";
  const time=Date.parse(traffic.updatedAt||"");
  const prefix=traffic.status==="stale"?"最後可用":"官方資料";
  if(!Number.isFinite(time))return prefix;
  const minutes=Math.max(0,Math.round((now-time)/60000));
  if(minutes<2)return prefix+" · 剛更新";
  if(minutes<60)return prefix+" · "+minutes+" 分前";
  if(minutes<1440)return prefix+" · "+Math.round(minutes/60)+" 小時前";
  return prefix+" · "+new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(time));
}
function cctvTrafficDirectionSummary(){
  if(!["1","2","3","4","5","6"].includes(String(state.cctvRoad))||!state.cctvDirection||state.cctvDirection==="all")return null;
  const rows=(state.traffic?.highways?.[String(state.cctvRoad)]||[]).filter(row=>cctvDirectionKey(row.direction)===state.cctvDirection);
  if(state.cctvSegmentStartId&&state.cctvSegmentEndId){
    const segmentResult=cctvTrafficSegmentRows(rows);
    if(segmentResult?.rows?.length){
      const label=segmentResult.reversed
        ?segmentResult.segment.endName+" → "+segmentResult.segment.startName
        :segmentResult.segment.startName+" → "+segmentResult.segment.endName;
      return cctvTrafficMetrics(segmentResult.rows,"segment",label);
    }
  }
  return cctvTrafficMetrics(rows,"direction","");
}
function cctvTrafficSummaryMarkup(){
  const traffic=cctvTrafficDirectionSummary();
  if(!traffic)return "";
  if(!traffic.available){
    const loading=state.trafficFallbackStatus==="loading";
    return '<div class="cctv-context-traffic is-empty"><span>同方向路況</span><b>'+(loading?'官方路況載入中':'路況尚未取得')+'</b><small>不會用其他方向或舊推測資料代替</small><div><button type="button" data-cctv-traffic-refresh '+(loading?'disabled':'')+'>更新路況</button><button type="button" data-cctv-traffic-official>1968</button></div></div>';
  }
  const cls=traffic.speed>=80?"good":traffic.speed>=50?"mid":"bad";
  const freshness=cctvTrafficFreshnessLabel(traffic);
  const segmentSelected=Boolean(state.cctvSegmentStartId&&state.cctvSegmentEndId);
  const scopeNote=traffic.scope==="segment"
    ?"已對應官方沿途區段「"+traffic.scopeLabel+"」；為 TDX 區間平均，非單支鏡頭位置瞬時速度"
    :segmentSelected
      ?"起終點無法穩定對應 TDX 路段，改顯示整條國道同方向平均"
      :"同國道同方向整體平均，非目前鏡頭所在地速度";
  const hotspot=traffic.slowCount
    ?traffic.slowCount+' 段低於 50 · 最慢 '+(traffic.slowName?traffic.slowName+' ':"")+traffic.minSpeed+' km/h'
    :'目前無低於 50 km/h 路段';
  const worstPlace=traffic.slowCount&&traffic.slowest?.length?cctvTrafficDestinationName(traffic.slowest[0].name):"";
  const worstCamera=worstPlace?cctvTrafficExactCamera(worstPlace):null;
  return '<div class="cctv-context-traffic '+cls+'"><span>'+(traffic.scope==="segment"?"沿途區段路況":"同方向路況")+'</span><b>平均 '+traffic.speed+' km/h · '+esc(traffic.label)+'</b><small>'+esc(freshness)+' · '+traffic.rows+' 個路段 · '+esc(hotspot)+' · '+esc(formatTime(traffic.updatedAt))+' · '+esc(scopeNote)+'</small>'+
    (traffic.slowest?.length?'<details class="cctv-context-slowest"><summary>最慢 '+traffic.slowest.length+' 段</summary><div>'+traffic.slowest.map(row=>{const place=cctvTrafficDestinationName(row.name),camera=place?cctvTrafficExactCamera(place):null;return '<p><span>'+esc(row.name||"官方路段")+(row.level?' · '+esc(row.level):"")+'</span><b>'+Math.round(row._speed)+' km/h</b>'+(camera?'<button class="exact" type="button" data-cctv-traffic-camera="'+esc(camera.id)+'">看'+esc(place)+'地標鏡頭</button>':place?'<button type="button" data-cctv-traffic-place="'+esc(place)+'">查'+esc(place)+'附近影像</button>':"")+'</p>';}).join("")+'</div></details>':"")+
    '<div class="cctv-context-traffic-match-note">只有 TDX 地名與 CCTV 官方地標名稱精準對上時才直接開鏡頭；否則改用附近搜尋。</div>'+
    '<div class="cctv-context-traffic-actions">'+(worstCamera?'<button type="button" data-cctv-traffic-camera="'+esc(worstCamera.id)+'">看最慢段地標鏡頭</button>':worstPlace?'<button type="button" data-cctv-traffic-worst="'+esc(worstPlace)+'">搜尋最慢路段影像</button>':"")+'<button type="button" data-cctv-traffic-detail>完整路況</button><button type="button" data-cctv-traffic-refresh>更新</button><button type="button" data-cctv-traffic-official>1968</button></div></div>';
}
function openTrafficForRoad(road){
  const value=String(road||"1");
  if(!["1","2","3","4","5","6"].includes(value))return;
  state.highway=value;
  $$("#highwayTabs button").forEach(button=>{
    const active=button.dataset.highway===value;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  show("highway");
  renderTraffic();
}
function bindCCTVTrafficContext(root){
  $("[data-cctv-traffic-detail]",root)?.addEventListener("click",()=>openTrafficForRoad(state.cctvRoad));
  $("[data-cctv-traffic-refresh]",root)?.addEventListener("click",async event=>{
    const button=event.currentTarget;
    if(button.disabled||state.trafficFallbackStatus==="loading")return;
    button.disabled=true;
    button.textContent="更新中…";
    renderCCTVActiveContext((state.cctv.items||[]).filter(x=>state.cctvRoad==="all"||(state.cctvRoad==="other"?!["1","2","3","4","5","6"].includes(String(x.roadNo)):String(x.roadNo)===state.cctvRoad)));
    await ensureClientTraffic();
    renderCCTV();
  });
  $("[data-cctv-traffic-official]",root)?.addEventListener("click",()=>window.open("https://1968.freeway.gov.tw/","_blank","noopener"));
  $$("[data-cctv-traffic-camera]",root).forEach(button=>button.onclick=()=>openCCTVTrafficCamera(button.dataset.cctvTrafficCamera));
  $$("[data-cctv-traffic-place]",root).forEach(button=>button.onclick=()=>searchCCTVByTrafficPlace(button.dataset.cctvTrafficPlace));
  $("[data-cctv-traffic-worst]",root)?.addEventListener("click",event=>searchCCTVByTrafficPlace(event.currentTarget.dataset.cctvTrafficWorst));
}
function renderCCTVActiveContext(rows){
  const root=$("#cctvActiveContext");
  if(!root)return;
  if(state.cctvNearby){
    root.hidden=false;
    root.innerHTML='<div><span>目前查看</span><b>附近鏡頭'+(state.cctvDirection!=="all"?" · "+esc(CCTV_DIRECTIONS[state.cctvDirection]||state.cctvDirection):"")+'</b><small>依裝置位置排序</small></div><button type="button" data-cctv-context-nearby-close>返回道路</button>';
    $("[data-cctv-context-nearby-close]",root)?.addEventListener("click",requestCCTVNearby);
    return;
  }
  if(state.cctvRoad==="all"){
    root.hidden=true;
    root.innerHTML="";
    return;
  }
  const roadLabel=state.cctvRoad==="other"?"其他道路":"國 "+state.cctvRoad;
  const direction=state.cctvDirection==="all"?"尚未選方向":(CCTV_DIRECTIONS[state.cctvDirection]||state.cctvDirection);
  const segment=cctvCurrentSegment(rows);
  root.hidden=false;
  root.innerHTML='<div class="cctv-active-context-main"><div><span>目前查看</span><b>'+esc(roadLabel)+' · '+esc(direction)+'</b><small>'+(segment?esc(segment.startName)+' → '+esc(segment.endName):'尚未套用沿途區段')+'</small></div>'+
    (segment?'<button type="button" data-cctv-context-clear>清除區段</button>':'<button type="button" data-cctv-context-top>路段連看</button>')+'</div>'+
    cctvTrafficSummaryMarkup();
  $("[data-cctv-context-clear]",root)?.addEventListener("click",()=>{clearCCTVSegment();renderCCTV();});
  $("[data-cctv-context-top]",root)?.addEventListener("click",()=>$("#cctvCorridor")?.scrollIntoView({behavior:"smooth",block:"start"}));
  bindCCTVTrafficContext(root);
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
  renderCCTVSavedRoutes();
  renderCCTVActiveContext(roadRows);
  renderCCTVCorridor(roadRows);
  status.textContent=state.cctv.source+" · "+all.length+" 支 · "+cctvListFreshnessLabel(state.cctv.updatedAt);
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
    const groupLimit=q?groups.length:state.cctvGroupLimit;
    const shown=Math.min(groups.length,groupLimit);
    root.innerHTML=renderCCTVGroups(groups,groupLimit);
    if(summary)summary.textContent=(state.cctvRoad==="all"?"全部道路":state.cctvRoad==="other"?"其他道路":"國 "+state.cctvRoad)+(state.cctvDirection!=="all"?" · "+CCTV_DIRECTIONS[state.cctvDirection]:"")+" · "+groups.length+" 路段 · "+matched.length+" 支鏡頭"+(!q&&shown<groups.length?" · 目前顯示 "+shown+" 路段":"");
  }
  $$("[data-cctv-select]",root).forEach(b=>b.onclick=()=>selectCCTVRoad(b.dataset.cctvSelect));
  $("[data-cctv-more-groups]",root)?.addEventListener("click",()=>{
    state.cctvGroupLimit+=24;
    renderCCTV();
  });
  bindCCTVViewerButtons(root);
  $$("[data-cctv-focus]",root).forEach(button=>button.onclick=()=>focusCCTVCorridorFromCamera(button.dataset.cctvFocus));
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

  const trafficInfo=dataStatusInfo(state.traffic);
  const statusNote=trafficInfo.stale&&trafficInfo.hasData
    ? '<div class="notice data-age-warning">資料較舊 · '+esc(trafficInfo.label)+'，路況請以 1968 當下資訊為準。</div>'
    : trafficInfo.live
      ? '<div class="data-age-ok">官方即時 · '+esc(trafficInfo.label)+'</div>'
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

  const tunnelInfo=dataStatusInfo(state.tunnel);
  const statusNote=tunnelInfo.stale&&tunnelInfo.hasData
    ? '<div class="notice data-age-warning">資料較舊 · '+esc(tunnelInfo.label)+'，國 5／雪隧請以 1968 當下資訊為準。</div>'
    : tunnelInfo.live
      ? '<div class="data-age-ok">官方即時 · '+esc(tunnelInfo.label)+'</div>'
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
        state.chargingConnector="all";
        state.chargingPower=0;
        state.chargingOperator="all";
        state.chargingQuick="all";
        state.chargingMajor="all";
        state.chargingFavoritesOnly=false;
        if($("#chargingCity"))$("#chargingCity").value="all";
        if($("#chargingDirection"))$("#chargingDirection").value="all";
        if($("#chargingConnector"))$("#chargingConnector").value="all";
        if($("#chargingPower"))$("#chargingPower").value="0";
        if($("#chargingOperator"))$("#chargingOperator").value="all";
        if($("#chargingSearch"))$("#chargingSearch").value="";
        $$("#roadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.road==="all"));
      }
      renderCharging();
      toast(availableOnly?"已清除篩選，顯示附近空槍／最近回報":"已依距離排序充電站");
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
  $("#cctvRefreshBtn")?.addEventListener("click",async event=>{
    const button=event.currentTarget;
    if(state.cctvLoading||button.disabled)return;
    button.disabled=true;
    button.textContent="更新中…";
    try{
      try{sessionStorage.removeItem("cola-go-cctv-v1");}catch{}
      toast("正在重新抓取官方鏡頭清單");
      await ensureCCTV(true);
      if(state.cctv.status==="ready")toast("官方鏡頭清單已更新");
      else toast("官方清單暫時無法更新，可先用官方入口");
    }finally{
      button.disabled=false;
      button.textContent="重新整理清單";
    }
  });
  if($("#cctvSearch"))$("#cctvSearch").oninput=()=>{
    state.cctvNearby=false;
    state.cctvGroupLimit=24;
    $("#cctvNearbyBtn")?.setAttribute("aria-pressed","false");
    renderCCTV();
  };
  $("#cctvNearbyBtn")?.addEventListener("click",requestCCTVNearby);
  $$("#cctvRoadFilter button").forEach(b=>b.onclick=()=>selectCCTVRoad(b.dataset.cctvRoad));
  $$("[data-cctv-direction]").forEach(b=>b.onclick=()=>{
    state.cctvDirection=b.dataset.cctvDirection;
    state.cctvGroupLimit=24;
    state.cctvCorridorMode="all";
    clearCCTVSegment();
    renderCCTV();
    void maybeEnsureCCTVTraffic();
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

let pwaUpdatePending=false;
let pwaUpdateSawHidden=false;
function markPwaUpdatePending(release=""){
  if(release&&release===APP_RELEASE)return;
  if(pwaUpdatePending)return;
  pwaUpdatePending=true;
  toast("COLA GO 有新版，切到背景再回來會自動更新",4200);
}
function bindPwaUpdateLifecycle(){
  document.addEventListener("visibilitychange",()=>{
    if(!pwaUpdatePending)return;
    if(document.hidden){
      pwaUpdateSawHidden=true;
      return;
    }
    if(pwaUpdateSawHidden)location.reload();
  });
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
    const hadController=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("message",event=>{
      const type=String(event.data?.type||"");
      const release=String(event.data?.release||"");
      if(type==="COLA_GO_SW_ACTIVATED"||type==="COLA_GO_SW_RELEASE"){
        if(hadController&&release&&release!==APP_RELEASE)markPwaUpdatePending(release);
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(hadController)markPwaUpdatePending();
    });
    navigator.serviceWorker.register("./sw.js").then(registration=>{
      try{registration.active?.postMessage({type:"COLA_GO_GET_RELEASE"})}catch{}
      if(navigator.onLine)registration.update().catch(()=>{});
    }).catch(()=>{});
  }
}

bindNav();
bindDisclosureBehavior();
bindExternal();
bindFeedback();
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
bindPwaUpdateLifecycle();
bindInstall();
show(location.hash.slice(1)||"home",false);
load();
