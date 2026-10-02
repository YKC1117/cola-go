(()=>{
"use strict";
const STORE_KEY="cola-go-plate-watch-v1";
const ALERT_KEY="cola-go-plate-alerts-v2";
const ANNOUNCEMENT_CACHE_KEY="cola-go-plate-announcements-v1";
const ANNOUNCEMENT_SNAPSHOT_KEY="cola-go-plate-announcement-snapshot-v1";
const CHANGE_LOG_KEY="cola-go-plate-change-log-v1";
const CHECKLIST_KEY="cola-go-plate-checklist-v1";
const OFFICE_CACHE_KEY="cola-go-plate-offices-v1";
const PRIMARY_PLATE_KEY="cola-go-plate-primary-v1";
const LINE_NOTIFY_CONFIG_URL="./data/line-notify.json";
const LINE_NOTIFY_DEVICE_KEY="cola-go-plate-line-device-v1";
const LINE_NOTIFY_PAIRING_KEY="cola-go-plate-line-pairing-v1";
const LINE_NOTIFY_DIRTY_KEY="cola-go-plate-line-dirty-v1";
const LINE_NOTIFY_PROFILE_VERSION_KEY="cola-go-plate-line-profile-version-v1";
const LINE_NOTIFY_PROFILE_VERSION="2";
const VEHICLE_SCOPE_KEY="cola-go-plate-vehicle-scope-v1";
const ANNOUNCEMENT_URL="./data/plates/announcements.json";
const OFFICE_URL="./data/plates/offices.json";
const official={
  pick:"https://www.mvdis.gov.tw/m3-emv-plate/webpickno/queryPickNo",
  bid:"https://www.mvdis.gov.tw/m3-emv-plate/bid/queryBiding",
  history:"https://www.mvdis.gov.tw/m3-emv-plate/bid/queryBid"
};
let detailRow=null;
const $p=q=>document.querySelector(q);
const $$p=q=>Array.from(document.querySelectorAll(q));
const escPlate=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const moneyPlate=v=>Number.isFinite(Number(v))&&Number(v)>0?"NT$ "+new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(Number(v)):"—";
const normalize=v=>String(v||"").trim().toUpperCase().replace(/\s+/g,"");
let announcementData={status:"idle",items:[],updatedAt:null,stale:false,error:""};
let officeData={status:"idle",items:[],updatedAt:null,stale:false,error:""};
let announcementFilter="all";
let announcementQuery="";
let officeQuery="";
let watchFilter="all";
let watchSort="priority";
let announcementFetchAt=0;
let officeFetchAt=0;
let lineNotifyConfig={status:"idle",enabled:false,apiBase:"",oaUrl:"https://lin.ee/Tu89Qyk"};
let lineNotifyBusy=false;
let lineNotifyAutoSyncTimer=null;
const exactConfirmCache=new Map();
const exactConfirmPending=new Map();

function loadRows(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveRows(rows){try{localStorage.setItem(STORE_KEY,JSON.stringify(rows));markLineNotifyDirty()}catch{}}
function loadPrimaryPlate(){try{return normalize(localStorage.getItem(PRIMARY_PLATE_KEY)||"")}catch{return""}}
function savePrimaryPlate(plate){try{plate=normalize(plate);if(plate)localStorage.setItem(PRIMARY_PLATE_KEY,plate);else localStorage.removeItem(PRIMARY_PLATE_KEY);markLineNotifyDirty()}catch{}}
function loadAlerts(){try{return JSON.parse(localStorage.getItem(ALERT_KEY)||"{}")||{}}catch{return{}}}
function saveAlerts(x){try{localStorage.setItem(ALERT_KEY,JSON.stringify(x))}catch{}}
function loadAnnouncementCache(){try{return JSON.parse(localStorage.getItem(ANNOUNCEMENT_CACHE_KEY)||"null")}catch{return null}}
function saveAnnouncementCache(x){try{localStorage.setItem(ANNOUNCEMENT_CACHE_KEY,JSON.stringify(x))}catch{}}
function loadOfficeCache(){try{return JSON.parse(localStorage.getItem(OFFICE_CACHE_KEY)||"null")}catch{return null}}
function saveOfficeCache(x){try{localStorage.setItem(OFFICE_CACHE_KEY,JSON.stringify(x))}catch{}}
function loadPlateJson(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return x??fallback}catch{return fallback}}
function savePlateJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function scheduleLineNotifySync(){
  if(lineNotifyAutoSyncTimer)clearTimeout(lineNotifyAutoSyncTimer);
  if(!loadLineNotifyDevice()?.token||!lineNotifyApiBase())return;
  lineNotifyAutoSyncTimer=setTimeout(()=>{
    lineNotifyAutoSyncTimer=null;
    if(!lineNotifyBusy&&isLineNotifyDirty())void syncLineNotifySubscription({silent:true});
  },700);
}
function markLineNotifyDirty(){
  try{localStorage.setItem(LINE_NOTIFY_DIRTY_KEY,"1")}catch{}
  renderLineNotifySetup();
  scheduleLineNotifySync();
}
function clearLineNotifyDirty(){try{localStorage.removeItem(LINE_NOTIFY_DIRTY_KEY)}catch{}}
function isLineNotifyDirty(){try{return localStorage.getItem(LINE_NOTIFY_DIRTY_KEY)==="1"}catch{return false}}
function loadLineNotifyDevice(){return loadPlateJson(LINE_NOTIFY_DEVICE_KEY,null)}
function saveLineNotifyDevice(value){if(value)savePlateJson(LINE_NOTIFY_DEVICE_KEY,value);else try{localStorage.removeItem(LINE_NOTIFY_DEVICE_KEY)}catch{}}
function loadLineNotifyPairing(){return loadPlateJson(LINE_NOTIFY_PAIRING_KEY,null)}
function saveLineNotifyPairing(value){if(value)savePlateJson(LINE_NOTIFY_PAIRING_KEY,value);else try{localStorage.removeItem(LINE_NOTIFY_PAIRING_KEY)}catch{}}
function loadLineNotifyProfileVersion(){try{return localStorage.getItem(LINE_NOTIFY_PROFILE_VERSION_KEY)||""}catch{return""}}
function saveLineNotifyProfileVersion(){try{localStorage.setItem(LINE_NOTIFY_PROFILE_VERSION_KEY,LINE_NOTIFY_PROFILE_VERSION)}catch{}}
function clearLineNotifyProfileVersion(){try{localStorage.removeItem(LINE_NOTIFY_PROFILE_VERSION_KEY)}catch{}}
function lineNotifyProfile(){
  const plates=[...new Set(loadRows().map(row=>watchNumber(row.plate)||normalize(row.plate)).filter(Boolean))];
  const primaryRaw=loadPrimaryPlate();
  const primaryPlate=watchNumber(primaryRaw)||normalize(primaryRaw);
  return {
    schema:2,
    plates,
    primaryPlate:primaryPlate&&plates.includes(primaryPlate)?primaryPlate:"",
    vehicleScope:loadVehicleScope(),
    events:["announcement","auction_start","auction_end","deadline_change"],
    locale:"zh-TW"
  };
}
function lineNotifyApiBase(){
  if(!lineNotifyConfig.enabled)return "";
  const raw=String(lineNotifyConfig.apiBase||"").trim();
  if(!raw)return "";
  try{
    const url=new URL(raw,location.href);
    if(url.protocol!=="https:"&&url.origin!==location.origin)return "";
    return url.href.replace(/\/+$/,"");
  }catch{return ""}
}
function safeLinePairingUrl(value){
  try{
    const url=new URL(String(value||""));
    return url.protocol==="https:"&&["line.me","www.line.me","lin.ee"].includes(url.hostname)?url.href:"";
  }catch{return ""}
}
async function loadLineNotifyConfig(){
  try{
    const response=await fetch(LINE_NOTIFY_CONFIG_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    lineNotifyConfig={
      status:"ready",
      enabled:data?.enabled===true,
      apiBase:String(data?.apiBase||""),
      oaUrl:String(data?.oaUrl||"https://lin.ee/Tu89Qyk")
    };
  }catch{
    lineNotifyConfig={status:"error",enabled:false,apiBase:"",oaUrl:"https://lin.ee/Tu89Qyk"};
  }
  renderLineNotifySetup();
  updateNotificationCenter();
  if(loadLineNotifyDevice()?.token){
    if(loadLineNotifyProfileVersion()!==LINE_NOTIFY_PROFILE_VERSION){
      try{localStorage.setItem(LINE_NOTIFY_DIRTY_KEY,"1")}catch{}
    }
    if(isLineNotifyDirty())scheduleLineNotifySync();
  }
}
async function lineNotifyRequest(path,{method="GET",body=null,token=""}={}){
  const base=lineNotifyApiBase();
  if(!base)throw new Error("LINE_NOTIFY_BACKEND_DISABLED");
  const headers={Accept:"application/json"};
  if(body!==null)headers["Content-Type"]="application/json";
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetch(base+path,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:"no-store"});
  let data={};
  try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(String(data?.error||("HTTP "+response.status)));
  return data;
}
function renderLineNotifySetup(){
  const root=$p("#plateLineNotifyPanel");
  if(!root)return;
  const profile=lineNotifyProfile(),device=loadLineNotifyDevice(),pairing=loadLineNotifyPairing(),backend=Boolean(lineNotifyApiBase()),dirty=isLineNotifyDirty();
  const status=$p("#plateLineStatus"),summary=$p("#plateLineSummary"),note=$p("#plateLineNote");
  const bind=$p("#plateLineBind"),check=$p("#plateLineCheck"),sync=$p("#plateLineSync"),disconnect=$p("#plateLineDisconnect");
  if(status){
    status.className="plate-line-state"+(device?.token?" ready":backend?" available":"");
    status.textContent=device?.token?(dirty?"已綁定・候選待同步":"已綁定"):backend?(pairing?.id?"等待 LINE 確認":"可綁定"):"安全後端尚未啟用";
  }
  if(summary)summary.textContent=(profile.primaryPlate?"主攻 "+profile.primaryPlate+" · ":"")+profile.plates.length+" 個候選";
  if(note){
    if(device?.token)note.textContent=(device.displayName?device.displayName+" · ":"")+"LINE 只同步候選數字、主攻數字、追蹤車種與提醒事件；最高預算、手動價格、監理帳密與付款資料都留在這台裝置。";
    else if(backend&&pairing?.id)note.textContent="已建立一次性配對。到 COLA GO LINE 送出配對訊息後，再回來按「檢查綁定」。網站不會背景輪詢。";
    else if(backend)note.textContent="先加入至少一個候選車牌，再由你主動開始 LINE 配對。";
    else note.textContent="網站端配對與同步流程已就緒；目前未設定安全通知後端，所以不會假裝已能背景推送。";
  }
  if(bind){bind.disabled=lineNotifyBusy||!backend||!profile.plates.length;bind.textContent=lineNotifyBusy?"處理中…":device?.token?"重新綁定 LINE":"綁定 LINE 通知"}
  if(check)check.disabled=lineNotifyBusy||!backend||!pairing?.id;
  if(sync)sync.disabled=lineNotifyBusy||!backend||!device?.token||!dirty;
  if(disconnect)disconnect.disabled=lineNotifyBusy||!backend||!device?.token;
}
async function startLineNotifyPairing(){
  const profile=lineNotifyProfile();
  if(!profile.plates.length){window.toast?toast("先加入至少一個候選車牌"):alert("先加入至少一個候選車牌");return}
  if(!lineNotifyApiBase()){window.toast?toast("LINE 安全通知後端尚未啟用"):alert("LINE 安全通知後端尚未啟用");return}
  lineNotifyBusy=true;renderLineNotifySetup();
  try{
    const data=await lineNotifyRequest("/v1/plate-line/pairings",{method:"POST",body:{profile,returnUrl:location.origin+location.pathname+"#plate"}});
    const pairingId=String(data?.pairingId||""),lineUrl=safeLinePairingUrl(data?.lineUrl);
    if(!pairingId||!lineUrl)throw new Error("PAIRING_RESPONSE_INVALID");
    saveLineNotifyPairing({id:pairingId,expiresAt:String(data?.expiresAt||"")});
    location.href=lineUrl;
  }catch(error){
    if(window.toast)toast("LINE 配對目前無法建立");
  }finally{lineNotifyBusy=false;renderLineNotifySetup()}
}
async function checkLineNotifyPairing(){
  const pairing=loadLineNotifyPairing();
  if(!pairing?.id||!lineNotifyApiBase())return;
  lineNotifyBusy=true;renderLineNotifySetup();
  try{
    const data=await lineNotifyRequest("/v1/plate-line/pairings/"+encodeURIComponent(pairing.id));
    if(data?.status!=="linked"||!data?.deviceToken){if(window.toast)toast("LINE 尚未完成配對");return}
    saveLineNotifyDevice({token:String(data.deviceToken),displayName:String(data.displayName||""),linkedAt:new Date().toISOString()});
    saveLineNotifyPairing(null);
    clearLineNotifyDirty();
    saveLineNotifyProfileVersion();
    if(window.toast)toast("LINE 競標通知已綁定");
  }catch{
    if(window.toast)toast("目前無法確認 LINE 綁定狀態");
  }finally{lineNotifyBusy=false;renderLineNotifySetup();updateNotificationCenter()}
}
async function syncLineNotifySubscription({silent=false}={}){
  const device=loadLineNotifyDevice();
  if(!device?.token||!lineNotifyApiBase())return;
  lineNotifyBusy=true;renderLineNotifySetup();
  try{
    await lineNotifyRequest("/v1/plate-line/subscription",{method:"PUT",token:device.token,body:{profile:lineNotifyProfile()}});
    clearLineNotifyDirty();
    saveLineNotifyProfileVersion();
    if(!silent&&window.toast)toast("LINE 候選通知已同步");
  }catch(error){
    if(String(error?.message||"").includes("UNAUTHORIZED")){
      saveLineNotifyDevice(null);
      saveLineNotifyPairing(null);
      clearLineNotifyDirty();
      clearLineNotifyProfileVersion();
      if(window.toast)toast("LINE 綁定已失效，請重新綁定");
    }else if(!silent&&window.toast)toast("LINE 候選同步失敗，請稍後再試");
  }finally{lineNotifyBusy=false;renderLineNotifySetup()}
}
async function disconnectLineNotify(){
  const device=loadLineNotifyDevice();
  if(!device?.token)return;
  lineNotifyBusy=true;renderLineNotifySetup();
  try{await lineNotifyRequest("/v1/plate-line/subscription",{method:"DELETE",token:device.token})}catch{}
  saveLineNotifyDevice(null);saveLineNotifyPairing(null);clearLineNotifyDirty();clearLineNotifyProfileVersion();
  lineNotifyBusy=false;renderLineNotifySetup();updateNotificationCenter();
  if(window.toast)toast("已解除這台裝置的 LINE 競標通知");
}
function bindLineNotifyControls(){
  $p("#plateLineBind")?.addEventListener("click",startLineNotifyPairing);
  $p("#plateLineCheck")?.addEventListener("click",checkLineNotifyPairing);
  $p("#plateLineSync")?.addEventListener("click",syncLineNotifySubscription);
  $p("#plateLineDisconnect")?.addEventListener("click",disconnectLineNotify);
  $p("#plateLineOpenOA")?.addEventListener("click",()=>window.open(lineNotifyConfig.oaUrl||"https://lin.ee/Tu89Qyk","_blank","noopener"));
}
async function notify(title,body,tag="cola-go-plate"){
  if(!("Notification" in window)||Notification.permission!=="granted")return false;
  const options={body,icon:"./assets/logo.svg",tag,data:{url:"./#plate"}};
  if("serviceWorker" in navigator){
    try{
      const reg=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
      if(reg&&"showNotification" in reg){
        await reg.showNotification(title,options);
        return true;
      }
    }catch{}
  }
  try{new Notification(title,options);return true}catch{}
  return false;
}
function fmtTime(v){
  if(!v)return "未提供";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return "未提供";
  return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
}
function fmtUpdated(v){
  if(!v)return "等待官方同步";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return "等待官方同步";
  return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d)+" 同步";
}
function fmtCountdown(ms){
  if(!Number.isFinite(ms)||ms<=0)return "00:00";
  const total=Math.floor(ms/1000),d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),s=total%60;
  if(d>0)return d+"天 "+String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
function updatePlateCountdowns(now=Date.now()){
  $$p("[data-plate-countdown-at]").forEach(el=>{
    const at=Number(el.dataset.plateCountdownAt);
    if(!Number.isFinite(at)||at<=0)return;
    const prefix=el.dataset.plateCountdownPrefix||"";
    el.textContent=prefix+fmtCountdown(at-now);
  });
}
function plateParts(value){
  const s=normalize(value).replace(/[^A-Z0-9-]/g,"");
  let m=s.match(/^([A-Z]{2,4})-?(\d{1,4})$/);
  if(m)return {prefix:m[1],number:Number(m[2]),raw:s};
  m=s.match(/^(\d{1,4})$/);
  if(m)return {prefix:"",number:Number(m[1]),raw:s};
  return null;
}
function rangeParts(value){
  const s=normalize(value);
  const m=s.match(/^([A-Z]{1,4})-?(\d{1,4})$/);
  return m?{prefix:m[1],number:Number(m[2])}:null;
}
function watchNumber(value){
  const s=normalize(value).replace(/[^A-Z0-9-]/g,"");
  const m=s.match(/(\d{1,4})$/);
  return m?m[1]:"";
}
function watchDisplayNumber(value){return watchNumber(value)||normalize(value)}
function watchScopeLabel(value){return plateParts(value)?.prefix?"完整牌號":"全台數字"}
function loadVehicleScope(){try{return localStorage.getItem(VEHICLE_SCOPE_KEY)==="all"?"all":"private-car"}catch{return"private-car"}}
function vehicleScopeLabel(scope=loadVehicleScope()){return scope==="all"?"全部車種":"自用汽車"}
function categoryMatchesScope(row,scope=loadVehicleScope()){
  if(scope==="all")return true;
  const category=String(row?.category||"").replace(/\s+/g,"");
  return ["自用小客貨車","電動自小客","身障自用小客貨車","電動身障自用小客貨"].includes(category);
}
function saveVehicleScope(scope){
  scope=scope==="all"?"all":"private-car";
  try{localStorage.setItem(VEHICLE_SCOPE_KEY,scope)}catch{}
  markLineNotifyDirty();
  renderWatchList();
  renderAnnouncements();
  if(announcementQuery)renderPlateSearchResult(announcementQuery);
}
function rangeContains(row,value){
  const q=plateParts(value),a=rangeParts(row.startNumber),b=rangeParts(row.endNumber);
  if(!q||!a||!b)return false;
  if(q.prefix&&q.prefix!==a.prefix&&q.prefix!==b.prefix)return false;
  if(a.prefix!==b.prefix)return q.prefix?false:[a.number,b.number].includes(q.number);
  return q.number>=Math.min(a.number,b.number)&&q.number<=Math.max(a.number,b.number);
}
function auctionState(row,now=Date.now()){
  const start=Date.parse(row.startAt||""),end=Date.parse(row.endAt||"");
  if(Number.isFinite(start)&&now<start)return "upcoming";
  if(Number.isFinite(end)&&now<=end)return "live";
  return "ended";
}
function auctionLabel(status){return status==="live"?"競標中":status==="upcoming"?"即將開標":"已結束"}
function scrollToPlate(selector){
  const el=$p(selector);
  if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
}

const CHECKLIST_STEPS=[
  {id:"order",title:"訂車",desc:"先確認訂單與預計交車安排，車牌作業不要早到和交車進度脫節。"},
  {id:"vin",title:"VIN／車身號碼",desc:"取得車輛資料後，再進行需要車身資料的選號或領牌作業。"},
  {id:"find",title:"找牌",desc:"先在 COLA GO 查標牌公告、收藏候選並設定心理預算。"},
  {id:"bid",title:"選號／競標",desc:"正式選號、登入、身分驗證與出價仍由交通部公路局監理服務網處理。"},
  {id:"win",title:"確認得標／選號結果",desc:"以監理服務網當下顯示的正式結果為準，COLA GO 不代替官方裁定。"},
  {id:"pay",title:"付款＋保存證明",desc:"依該次官方公告與得標頁面期限完成付款，並保留繳費與得標證明。"},
  {id:"advisor",title:"通知 Tesla 交付顧問",desc:"自行競標得標並完成繳費後，盡快把牌號與證明提供交付顧問；實際送件時間依交付顧問安排。"},
  {id:"register",title:"領牌作業",desc:"確認領牌由本人或交付端辦理，並依實際送件進度準備所需文件。"},
  {id:"delivery",title:"交車",desc:"交車前再次核對車牌、文件與車輛資料，完成最後確認。"}
];
function ensurePlateV4Panels(){
  const searchPanel=$p("#plateSearchInput")?.closest(".plate-panel");
  if(searchPanel&&!$p("#plateSearchResultPanel")){
    searchPanel.insertAdjacentHTML("afterend",
      '<section class="plate-panel" id="plateSearchResultPanel" hidden>'+
      '<div class="plate-panel-head"><div><span class="mini-label">COLA GO CHECK</span><h2>全台查詢結果</h2></div><span class="plate-trust" id="plateSearchResultState">站內判讀</span></div>'+
      '<div id="plateSearchResult"></div>'+
      '<p class="plate-helper">純數字會跨英文字母與監理單位比對目前已同步的全台公開標牌公告；正式可選狀態仍以監理服務網為準。</p>'+
      '</section>');
  }
  const announcementPanel=$p(".plate-announcement-panel");
  if(announcementPanel&&!$p("#plateChangePanel")){
    announcementPanel.insertAdjacentHTML("afterend",
      '<details class="plate-panel plate-compact-details" id="plateChangePanel">'+
      '<summary><span><b>官方公告最新變化</b><small>需要時再看新公告與時間異動</small></span><span class="plate-count" id="plateChangeCount">0</span></summary>'+
      '<div class="plate-collapsible-body"><div class="plate-watch-list" id="plateChangeList"></div></div>'+
      '</details>');
  }
  const watchPanel=$p(".plate-watch-panel");
  if(watchPanel&&!$p("#plateChecklistPanel")){
    watchPanel.insertAdjacentHTML("afterend",
      '<details class="plate-panel plate-compact-details" id="plateChecklistPanel">'+
      '<summary><span><b>領牌進度 Checklist</b><small>真正要領牌時再使用</small></span><span class="plate-count" id="plateChecklistProgress">0 / '+CHECKLIST_STEPS.length+'</span></summary>'+
      '<div class="plate-collapsible-body"><div class="plate-watch-list" id="plateChecklist"></div><div class="plate-watch-actions"><button id="plateChecklistReset" type="button">全部重設</button></div></div>'+
      '</details>');
  }
  const checklistPanel=$p("#plateChecklistPanel");
  if(checklistPanel&&!$p("#plateOfficePanel")){
    checklistPanel.insertAdjacentHTML("afterend",
      '<details class="plate-panel plate-compact-details" id="plateOfficePanel">'+
      '<summary><span><b>監理站資訊</b><small>要聯絡或前往監理站時再查</small></span><span class="plate-source-state" id="plateOfficeSourceState">讀取中</span></summary>'+
      '<div class="plate-collapsible-body">'+
      '<div class="plate-search-row"><input autocomplete="off" id="plateOfficeSearchInput" placeholder="搜尋監理站、縣市、行政區"/><button id="plateOfficeSearchBtn" type="button"><span>搜尋</span></button></div>'+
      '<div class="plate-announcement-meta"><span id="plateOfficeUpdated">等待官方資料</span><span id="plateOfficeCount">—</span></div>'+
      '<div class="plate-watch-list" id="plateOfficeList"><div class="plate-watch-empty">正在讀取交通部公路局監理所及轄站資料。</div></div>'+
      '</div></details>');
  }
  $$p(".plate-guide-body article").forEach(article=>{
    const title=article.querySelector("b")?.textContent||"";
    const p=article.querySelector("p");
    if(!p)return;
    if(title.includes("最後幾分鐘"))p.textContent="官方規則：截止前 3 分鐘內若有兩人以上繼續出高價，該號牌會自動延長 3 分鐘，最多延長 10 次；仍以監理服務網當下時間為準。";
  });
}
function loadChecklist(){const x=loadPlateJson(CHECKLIST_KEY,{});return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
function renderChecklist(){
  const root=$p("#plateChecklist"),progress=$p("#plateChecklistProgress");
  if(!root)return;
  const state=loadChecklist();
  const done=CHECKLIST_STEPS.filter(x=>state[x.id]).length;
  if(progress)progress.textContent=done+" / "+CHECKLIST_STEPS.length;
  root.innerHTML=CHECKLIST_STEPS.map((step,index)=>{
    const checked=!!state[step.id];
    return '<article class="plate-watch-card">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number" style="font-size:15px">'+String(index+1).padStart(2,"0")+'・'+escPlate(step.title)+'</div><small class="meta">'+escPlate(step.desc)+'</small></div>'+
      '<span class="plate-budget-state '+(checked?"":"warn")+'">'+(checked?"已完成":"待完成")+'</span></div>'+
      '<div class="plate-watch-actions"><button data-plate-check-toggle="'+escPlate(step.id)+'" type="button">'+(checked?"改為未完成":"標記完成")+'</button></div>'+
      '</article>';
  }).join("");
}

function officeKey(value){return String(value||"").trim().replace(/\s+/g,"").replace(/臺/g,"台").toUpperCase()}
function findOfficeInfo(name){
  const key=officeKey(name);
  if(!key)return null;
  return (officeData.items||[]).find(row=>[row.name,row.station,row.office].some(v=>officeKey(v)===key))||null;
}
function renderOfficeDirectory(){
  const root=$p("#plateOfficeList"),count=$p("#plateOfficeCount"),state=$p("#plateOfficeSourceState"),updated=$p("#plateOfficeUpdated");
  if(!root)return;
  const items=Array.isArray(officeData.items)?officeData.items:[];
  if(state){
    state.className="plate-source-state"+(officeData.error&&!items.length?" error":officeData.stale?" stale":"");
    state.textContent=officeData.error&&!items.length?"同步中":officeData.stale?"上次可用":"官方資料";
  }
  if(updated)updated.textContent=fmtUpdated(officeData.updatedAt);
  let rows=scopedItems.slice();
  const q=officeKey(officeQuery);
  if(q)rows=rows.filter(row=>officeKey([row.name,row.office,row.station,row.address,row.tel,row.precinct].join(" ")).includes(q));
  if(count)count.textContent=items.length?(q?rows.length+" / "+items.length:String(items.length)):"—";
  if(!items.length){
    root.innerHTML='<div class="plate-watch-empty"><b>監理站資料正在同步</b><br>若正式資料尚未產生，COLA GO 會保留此區並在資料可用時自動讀取；車牌公告功能不受影響。</div>';
    return;
  }
  if(!rows.length){
    root.innerHTML='<div class="plate-watch-empty"><b>沒有符合的監理站</b><br>可改用監理站名稱、縣市或行政區搜尋。</div>';
    return;
  }
  root.innerHTML=rows.slice(0,40).map(row=>{
    const parent=row.station&&row.office?row.office:"監理機關";
    return '<article class="plate-watch-card">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number" style="font-size:16px">'+escPlate(row.name||row.office||"監理站")+'</div><small class="meta">'+escPlate(parent)+'</small></div><span class="plate-budget-state">官方資料</span></div>'+
      '<div class="plate-watch-meta"><div><small>地址</small><b>'+escPlate(row.address||"未提供")+'</b></div><div><small>電話</small><b>'+escPlate(row.tel||"未提供")+'</b></div></div>'+
      (row.precinct?'<div class="plate-detail-note"><b>管轄／服務</b><br>'+escPlate(row.precinct)+'</div>':"")+
      '<div class="plate-watch-actions"><button data-plate-office-action="copy" data-value="'+escPlate(row.address||"")+'" type="button">複製地址</button>'+
      (row.tel?'<button data-plate-office-action="call" data-value="'+escPlate(row.tel)+'" type="button">撥打電話</button>':"")+
      '</div></article>';
  }).join("");
}
async function loadOffices(){
  officeFetchAt=Date.now();
  try{
    const res=await fetch(OFFICE_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const data=await res.json();
    if(!data||!Array.isArray(data.items))throw new Error("invalid office directory");
    officeData={...data,stale:false,error:""};
    saveOfficeCache(data);
  }catch(error){
    const cached=loadOfficeCache();
    if(cached&&Array.isArray(cached.items))officeData={...cached,stale:true,error:""};
    else officeData={status:"error",items:[],updatedAt:null,stale:false,error:String(error?.message||error)};
  }
  renderOfficeDirectory();
}

function logicalAnnouncementKey(row){return [row.office||"",row.category||"",row.startNumber||"",row.endNumber||""].join("|")}
function loadChangeLog(){const x=loadPlateJson(CHANGE_LOG_KEY,[]);return Array.isArray(x)?x:[]}
function saveChangeLog(rows){savePlateJson(CHANGE_LOG_KEY,rows.slice(0,80))}
function addAnnouncementChange(events,event){
  const key=[event.type,event.key,event.from||"",event.to||""].join("|");
  if(events.some(x=>x.dedupe===key))return;
  events.unshift({...event,dedupe:key,at:new Date().toISOString()});
}
function renderAnnouncementChanges(){
  const root=$p("#plateChangeList"),count=$p("#plateChangeCount");
  if(!root)return;
  const events=loadChangeLog();
  if(count)count.textContent=String(events.length);
  if(!events.length){
    root.innerHTML='<div class="plate-watch-empty"><b>已建立變化追蹤區</b><br>第一次成功同步會先建立基準；之後官方公告有新增、時間調整或候選命中時，會在這裡留下這台裝置的差異紀錄。</div>';
    return;
  }
  root.innerHTML=events.slice(0,20).map(event=>
    '<article class="plate-watch-card">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number" style="font-size:15px">'+escPlate(event.title||event.type)+'</div><small class="meta">'+escPlate(event.range||"")+(event.office?"・"+escPlate(event.office):"")+'</small></div><span class="plate-budget-state">'+escPlate(event.type)+'</span></div>'+
      '<div class="plate-watch-official">'+escPlate(fmtTime(event.at))+'・依官方公告快照比對</div>'+
      (event.note?'<div class="plate-detail-note">'+escPlate(event.note)+'</div>':"")+
    '</article>'
  ).join("");
}
function recordAnnouncementChanges(data){
  if(!data||!Array.isArray(data.items)||data.stale||data.error)return;
  const previous=loadPlateJson(ANNOUNCEMENT_SNAPSHOT_KEY,null);
  const currentItems=data.items.map(row=>({
    key:logicalAnnouncementKey(row),office:row.office||"",category:row.category||"",startNumber:row.startNumber||"",endNumber:row.endNumber||"",
    startAt:row.startAt||null,endAt:row.endAt||null,transferDeadline:row.transferDeadline||null,status:auctionState(row)
  }));
  const snapshot={sourceHash:data.sourceHash||"",updatedAt:data.updatedAt||null,capturedAt:new Date().toISOString(),items:currentItems};
  if(!previous||!Array.isArray(previous.items)){
    savePlateJson(ANNOUNCEMENT_SNAPSHOT_KEY,snapshot);
    renderAnnouncementChanges();
    return;
  }
  const prevMap=new Map(previous.items.map(row=>[row.key,row]));
  const curMap=new Map(currentItems.map(row=>[row.key,row]));
  const currentByKey=new Map(data.items.map(row=>[logicalAnnouncementKey(row),row]));
  const events=loadChangeLog();
  currentItems.forEach(row=>{
    const old=prevMap.get(row.key),raw=currentByKey.get(row.key);
    const range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
    const watched=raw?announcementMatchesWatch(raw):[];
    if(!old){
      addAnnouncementChange(events,{type:"新公告",key:row.key,title:"新增標牌公告",range,office:row.office,note:"官方公告清單出現新的號牌範圍。"});
      if(watched.length)addAnnouncementChange(events,{type:"候選命中",key:row.key,title:"候選號碼出現",range,office:row.office,note:"命中："+watched.map(x=>x.plate).join("、")});
      return;
    }
    if(old.status!==row.status&&row.status==="live")addAnnouncementChange(events,{type:"開始競標",key:row.key,title:"公告已進入競標",range,office:row.office,from:old.status,to:row.status,note:"依官方公告起標時間判讀，目前已進入競標時段。"});
    if(old.endAt!==row.endAt)addAnnouncementChange(events,{type:"時間變更",key:row.key,title:"決標時間有更新",range,office:row.office,from:old.endAt||"",to:row.endAt||"",note:"原："+fmtTime(old.endAt)+"；新："+fmtTime(row.endAt)});
    if(old.startAt!==row.startAt)addAnnouncementChange(events,{type:"時間變更",key:row.key,title:"起標時間有更新",range,office:row.office,from:old.startAt||"",to:row.startAt||"",note:"原："+fmtTime(old.startAt)+"；新："+fmtTime(row.startAt)});
    if(old.transferDeadline!==row.transferDeadline)addAnnouncementChange(events,{type:"期限變更",key:row.key,title:"轉帳截止有更新",range,office:row.office,from:old.transferDeadline||"",to:row.transferDeadline||"",note:"原："+fmtTime(old.transferDeadline)+"；新："+fmtTime(row.transferDeadline)});
  });
  previous.items.forEach(old=>{
    if(curMap.has(old.key))return;
    const range=old.startNumber===old.endNumber?old.startNumber:old.startNumber+" ～ "+old.endNumber;
    addAnnouncementChange(events,{type:"公告移除",key:old.key,title:"公告已不在目前清單",range,office:old.office,note:"可能已結束、撤下或被官方更新；結果請以監理服務網為準。"});
  });
  saveChangeLog(events);
  savePlateJson(ANNOUNCEMENT_SNAPSHOT_KEY,snapshot);
  renderAnnouncementChanges();
}

function exactConfirmKey(value){
  const number=watchNumber(value)||normalize(value);
  return number+"|"+loadVehicleScope()+"|"+String(announcementData.updatedAt||"");
}
function renderExactConfirmation(value){
  const root=$p("#plateExactConfirm"),state=$p("#plateSearchResultState");
  if(!root)return;
  const number=watchNumber(value)||normalize(value);
  if(root.dataset.number!==number)return;
  const key=exactConfirmKey(number),data=exactConfirmCache.get(key);
  if(!data){
    root.innerHTML='<div class="plate-exact-loading"><b>官方實牌確認中</b><span>正在核對監理服務網公告區間與「重複號牌排除明細」。</span></div>';
    return;
  }
  const matches=Array.isArray(data.matches)?data.matches:[];
  const usable=matches.filter(x=>x.exactStatus!=="excluded");
  const confirmed=usable.filter(x=>x.exactStatus==="confirmed");
  if(state)state.textContent=confirmed.length?confirmed.length+" 筆官方實牌確認":usable.length?usable.length+" 筆公告區間命中":"目前未確認";
  if(!usable.length){
    root.innerHTML='<div class="plate-exact-empty"><b>目前沒有可確認的 '+escPlate(number)+'</b><span>'+
      (Number(data.excludedCount)>0?"官方公告區間雖包含這組數字，但明細列為重複號牌排除。":"目前未在符合車種的未決標公告中確認到這組數字。")+
      '</span></div>';
    return;
  }
  root.innerHTML=
    '<div class="plate-exact-head"><div><small>OFFICIAL EXACT CHECK</small><b>'+escPlate(number)+' 官方實牌</b></div><span>'+confirmed.length+' 筆明細確認</span></div>'+
    usable.map(row=>{
      const status=auctionState(row),verified=row.exactStatus==="confirmed";
      return '<article class="plate-exact-card">'+
        '<div class="plate-exact-top"><div><b>'+escPlate(row.exactPlate||number)+'</b><small>'+escPlate(row.office||"監理單位")+'・'+escPlate(row.category||"")+'</small></div>'+
          '<span class="'+(verified?'verified':'range-only')+'">'+(verified?'官方明細已確認':'公告區間命中')+'</span></div>'+
        '<div class="plate-watch-meta"><div><small>狀態</small><b>'+escPlate(auctionLabel(status))+'</b></div><div><small>起標</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div><div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div></div>'+
        '<div class="plate-exact-proof">'+(verified?'已核對官方「重複號牌排除明細」，此完整牌號未被排除。':'官方明細暫時無法驗證，僅能確認號碼落在公告區間。')+'</div>'+
        '<button class="plate-exact-official" data-plate-search-action="official-exact" data-value="'+escPlate(row.exactPlate||number)+'" type="button">複製 '+escPlate(row.exactPlate||number)+' ＋ 開官方競標頁</button>'+
      '</article>';
    }).join("")+
    (Number(data.excludedCount)>0?'<div class="plate-exact-excluded">另有 '+escPlate(data.excludedCount)+' 筆公告區間被官方重複號牌明細排除，已自動不列入可競標實牌。</div>':"");
}
async function loadExactConfirmation(value){
  const number=watchNumber(value)||normalize(value);
  if(!/^\d{1,4}$/.test(number))return;
  const key=exactConfirmKey(number);
  if(exactConfirmCache.has(key)){renderExactConfirmation(number);return}
  if(exactConfirmPending.has(key)){renderExactConfirmation(number);return exactConfirmPending.get(key)}
  renderExactConfirmation(number);
  const base=lineNotifyApiBase();
  if(!base){
    const root=$p("#plateExactConfirm");
    if(root&&root.dataset.number===number)root.innerHTML='<div class="plate-exact-loading"><b>精準確認服務準備中</b><span>全台公告區間仍可正常查看。</span></div>';
    return;
  }
  const task=(async()=>{
    try{
      const res=await fetch(base+"/v1/plate-line/confirm?number="+encodeURIComponent(number)+"&scope="+encodeURIComponent(loadVehicleScope()),{cache:"no-store",headers:{Accept:"application/json"}});
      if(!res.ok)throw new Error("HTTP "+res.status);
      const data=await res.json();
      exactConfirmCache.set(key,data);
    }catch(error){
      exactConfirmCache.set(key,{number,matches:[],confirmedCount:0,excludedCount:0,rangeOnlyCount:0,error:String(error?.message||error)});
    }finally{
      exactConfirmPending.delete(key);
      renderExactConfirmation(number);
    }
  })();
  exactConfirmPending.set(key,task);
  return task;
}
function renderPlateSearchResult(value){
  const panel=$p("#plateSearchResultPanel"),root=$p("#plateSearchResult"),state=$p("#plateSearchResultState");
  if(!panel||!root)return;
  const q=normalize(value);
  if(!q){panel.hidden=true;root.innerHTML="";return}
  panel.hidden=false;
  const parts=plateParts(q);
  if(!parts){
    if(state)state.textContent="請檢查格式";
    root.innerHTML='<div class="plate-watch-empty"><b>無法判讀這個號碼</b><br>建議直接輸入 1～4 位數字，例如 1010。</div>';
    return;
  }
  const target=watchNumber(q)||q;
  const rows=matchingAnnouncements(q).slice().sort((a,b)=>{
    const p={live:0,upcoming:1,ended:2};
    return p[auctionState(a)]-p[auctionState(b)]||Date.parse(a.startAt||0)-Date.parse(b.startAt||0);
  });
  if(state)state.textContent=rows.length?"官方實牌確認中":"目前未命中";
  if(rows.length){
    const offices=[...new Set(rows.map(x=>x.office).filter(Boolean))];
    root.innerHTML='<div class="plate-number-result-head"><b>'+escPlate(target)+'</b><span>公告區間 '+rows.length+' 筆・'+offices.length+' 個監理單位</span></div>'+
      '<div class="plate-exact-confirm" id="plateExactConfirm" data-number="'+escPlate(target)+'"></div>'+
      '<details class="plate-range-preview"><summary><span><b>查看公告區間</b><small>精準結果以官方排除明細核對為準</small></span><span>'+rows.length+' 筆</span></summary><div class="plate-range-preview-body">'+
      rows.slice(0,12).map(row=>{
        const status=auctionState(row),range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
        return '<article class="plate-watch-card">'+
          '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(watchNumber(range)||target)+'</div><small class="meta">'+escPlate(range)+'・'+escPlate(row.office||"監理單位")+'・'+escPlate(row.category||"")+'</small></div><span class="plate-auction-state '+status+'">'+escPlate(auctionLabel(status))+'</span></div>'+
          '<div class="plate-watch-meta"><div><small>起標</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div><div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div></div>'+
        '</article>';
      }).join("")+'</div></details>'+
      '<div class="plate-watch-actions"><button data-plate-search-action="watch" data-value="'+escPlate(target)+'" type="button">全台追蹤 '+escPlate(target)+'</button></div>';
    void loadExactConfirmation(target);
    return;
  }
  root.innerHTML='<div class="plate-watch-empty"><b>目前全台公開標牌公告沒有找到 '+escPlate(target)+'</b><br>加入追蹤後，之後任何英文前綴、任何監理單位公告出現這組數字，都會列入候選通知。</div>'+
    '<div class="plate-watch-actions"><button data-plate-search-action="watch" data-value="'+escPlate(target)+'" type="button">全台追蹤 '+escPlate(target)+'</button><button data-plate-search-action="pick" type="button">官方即時可選確認</button></div>';
}
function openPlateDetail(row){
  detailRow=row||null;
  const dialog=$p("#plateDetailDialog"),body=$p("#plateDetailBody"),title=$p("#plateDetailTitle"),bid=$p("#plateDetailBid"),watch=$p("#plateDetailWatch");
  if(!dialog||!body||!row)return;
  const status=auctionState(row),range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
  title.textContent=range;
  const matches=announcementMatchesWatch(row);
  const officeInfo=findOfficeInfo(row.office);
  body.innerHTML=
    '<div class="plate-detail-status"><span class="plate-auction-state '+status+'">'+escPlate(auctionLabel(status))+'</span><span>'+escPlate(row.office||"監理單位")+'</span></div>'+
    '<div class="plate-detail-grid">'+
      '<div><small>號牌類別</small><b>'+escPlate(row.category||"未提供")+'</b></div>'+
      '<div><small>監理單位</small><b>'+escPlate(row.office||"未提供")+'</b></div>'+
      '<div><small>起標時間</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div>'+
      '<div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div>'+
      '<div><small>轉帳截止</small><b>'+escPlate(fmtTime(row.transferDeadline))+'</b></div>'+
      '<div><small>資料來源</small><b>交通部公路局</b></div>'+
      '<div><small>目前出價</small><b>需官方即時確認</b></div>'+
      '<div><small>出價次數</small><b>需官方即時確認</b></div>'+
    '</div>'+
    (officeInfo?'<div class="plate-detail-match"><b>監理站資訊</b><div><span>'+escPlate(officeInfo.address||"地址未提供")+'</span>'+(officeInfo.tel?'<span>'+escPlate(officeInfo.tel)+'</span>':"")+'</div></div>':"")+
    (matches.length?'<div class="plate-detail-match"><b>你的候選命中</b><div>'+matches.map(x=>'<span>'+escPlate(x.plate)+'</span>').join("")+'</div></div>':'')+
    '<div class="plate-detail-note">COLA GO 顯示的是官方公告資料。公開開放資料不含逐筆目前出價與出價次數；正式競標前請到監理服務網確認。官方規則為截止前 3 分鐘內若有兩人以上繼續出高價，該號牌自動延長 3 分鐘，最多延長 10 次。</div>';
  if(bid){
    bid.hidden=status!=="live";
    bid.textContent="正式競標";
  }
  if(watch){
    const exact=row.startNumber===row.endNumber?row.startNumber:"";
    watch.hidden=!exact;
    watch.dataset.value=exact;
    watch.dataset.end=row.endAt||"";
    watch.textContent=exact&&loadRows().some(x=>(watchNumber(x.plate)||x.plate)===(watchNumber(exact)||exact))?"已在追蹤":"全台追蹤這組數字";
  }
  if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
}
function budgetState(row){
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  if(!budget||!current)return {label:"等待價格",cls:""};
  if(current>budget)return {label:"已超預算",cls:"over"};
  if(current>=budget*.9)return {label:"接近預算",cls:"warn"};
  return {label:"預算內",cls:""};
}
function matchingAnnouncements(value){
  return (announcementData.items||[]).filter(x=>categoryMatchesScope(x)&&rangeContains(x,value));
}
function bestOfficialMatch(value){
  const rows=matchingAnnouncements(value);
  rows.sort((a,b)=>{
    const p={live:0,upcoming:1,ended:2};
    return p[auctionState(a)]-p[auctionState(b)]||Date.parse(a.startAt||0)-Date.parse(b.startAt||0);
  });
  return rows[0]||null;
}
function upsertWatch(plate,budget=0,current=0,endTime=""){
  plate=watchNumber(plate)||normalize(plate);
  if(!plate)return false;
  const rows=loadRows();
  const existing=rows.find(x=>(watchNumber(x.plate)||normalize(x.plate))===plate);
  const priceUpdatedAt=current>0?new Date().toISOString():"";
  if(existing){
    existing.plate=plate;
    existing.budget=budget||existing.budget||0;
    if(current>0){existing.current=current;existing.priceUpdatedAt=priceUpdatedAt}
    existing.endTime=endTime||existing.endTime||"";
  }else rows.unshift({id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),plate,budget,current,endTime,priceUpdatedAt,createdAt:new Date().toISOString()});
  saveRows(rows);
  watchFilter="all";
  renderWatchList();
  renderAnnouncements();
  checkAnnouncementAlerts();
  return true;
}

function ensurePlateWatchTools(){
  const panel=$p(".plate-watch-panel"),list=$p("#plateWatchList");
  if(!panel||!list)return;
  if(!$p("#plateWatchDashboard")){
    list.insertAdjacentHTML("beforebegin",
      '<div id="plateWatchDashboard">'+
        '<section class="plate-primary-target" id="platePrimaryTarget"></section>'+
        '<div class="plate-watch-glance">'+
          '<span><b id="plateWatchLiveCount">0</b><small>競標中</small></span>'+
          '<span><b id="plateWatchUpcomingCount">0</b><small>即將開標</small></span>'+
          '<span><b id="plateWatchFinalCount">0</b><small>15 分鐘內</small></span>'+
          '<span><b id="plateWatchNoMatchCount">0</b><small>追蹤中</small></span>'+
        '</div>'+
        '<details class="plate-compact-details plate-watch-tools" id="plateWatchTools">'+
          '<summary><span><b>篩選、排序與備份</b><small>進階管理工具</small></span></summary>'+
          '<div class="plate-collapsible-body">'+
            '<div class="plate-watch-actions">'+
              '<button class="active" data-plate-watch-filter="all" type="button">全部候選</button>'+
              '<button data-plate-watch-filter="final" type="button">15 分鐘內</button>'+
              '<button data-plate-watch-filter="live" type="button">競標中</button>'+
              '<button data-plate-watch-filter="upcoming" type="button">即將開標</button>'+
              '<button data-plate-watch-filter="nomatch" type="button">暫無公告</button>'+
            '</div>'+
            '<div class="plate-watch-meta"><label><small>排序</small><select id="plateWatchSort"><option value="priority">競標優先</option><option value="budget">預算風險</option><option value="recent">最近加入</option><option value="plate">號碼順序</option></select></label></div>'+
            '<div class="plate-watch-actions">'+
              '<button id="plateWatchCopyList" type="button">複製號碼清單</button>'+
              '<button id="plateWatchCopySummary" type="button">複製競標摘要</button>'+
              '<button id="plateHistoryOfficial" type="button">官方標售紀錄</button>'+
              '<button id="plateWatchBackup" type="button">複製候選備份</button>'+
              '<button id="plateWatchRestore" type="button">貼上還原</button>'+
            '</div>'+
          '</div>'+
        '</details>'+
      '</div>'
    );
  }
  if(!$p("#plateFinalDock"))panel.insertAdjacentHTML("beforeend",'<div class="plate-final-dock" id="plateFinalDock" hidden></div>');

  $$p("[data-plate-watch-filter]").forEach(btn=>btn.onclick=()=>{
    watchFilter=btn.dataset.plateWatchFilter||"all";
    renderWatchList();
  });
  const watchSortSelect=$p("#plateWatchSort");
  if(watchSortSelect)watchSortSelect.onchange=()=>{watchSort=watchSortSelect.value||"priority";renderWatchList()};
  const copyWatchList=$p("#plateWatchCopyList");
  if(copyWatchList)copyWatchList.onclick=async()=>{
    const text=visibleWatchRows().map(row=>watchDisplayNumber(row.plate)).join("\n");
    if(!text){if(window.toast)toast("目前沒有可複製的候選");return}
    try{await navigator.clipboard.writeText(text);if(window.toast)toast("候選數字清單已複製")}catch{prompt("請複製候選數字",text)}
  };
  const copySummary=$p("#plateWatchCopySummary");
  if(copySummary)copySummary.onclick=async()=>{
    const text=watchSummaryText();
    try{await navigator.clipboard.writeText(text);if(window.toast)toast("競標摘要已複製")}catch{prompt("請複製競標摘要",text)}
  };
  const historyOfficial=$p("#plateHistoryOfficial");
  if(historyOfficial)historyOfficial.onclick=()=>window.open(official.history,"_blank","noopener");
  const backupWatch=$p("#plateWatchBackup");
  if(backupWatch)backupWatch.onclick=async()=>{
    const payload=watchBackupPayload();
    try{await navigator.clipboard.writeText(payload);if(window.toast)toast("候選備份已複製")}catch{prompt("請複製這段候選備份",payload)}
  };
  const restoreWatch=$p("#plateWatchRestore");
  if(restoreWatch)restoreWatch.onclick=()=>{
    const raw=prompt("貼上 COLA GO 候選備份");
    if(raw===null)return;
    const result=restoreWatchPayload(raw);
    if(window.toast)toast(result.message);else alert(result.message);
  };
}
function platePrimaryTimeline(match,now=Date.now()){
  if(!match)return {level:"waiting",title:"等待官方公告",detail:"目前沒有命中公開標牌公告。",start:"未提供",end:"未提供"};
  const status=auctionState(match,now),start=Date.parse(match.startAt||""),end=Date.parse(match.endAt||"");
  const startText=fmtTime(match.startAt),endText=fmtTime(match.endAt);
  if(status==="upcoming"){
    const countdown=Number.isFinite(start)?fmtCountdown(start-now):"時間未提供";
    return {level:"upcoming",title:"距起標 "+countdown,detail:"官方公告尚未進入競標時間。",start:startText,end:endText};
  }
  if(status==="live"){
    const stage=auctionFinalStage(match,now);
    const countdown=Number.isFinite(end)?fmtCountdown(end-now):"時間未提供";
    const detail=stage.level==="extension"||stage.level==="critical"
      ?"已進入最後 3 分鐘延長可能區；若符合官方延長條件，最終時間會晚於原公告時間。"
      :"目前競標中；正式價格、出價次數與最後時間請以官方頁為準。";
    return {level:stage.active?stage.level:"live",title:"距公告決標 "+countdown,detail,start:startText,end:endText};
  }
  return {level:"ended",title:"公告時間已到",detail:"原公告決標時間已到；若最後階段曾觸發延長，最終決標時間與結果請以官方頁為準。",start:startText,end:endText};
}
function renderPlateFinalDock(row,stage,priceFreshness,priceWarning){
  const dock=$p("#plateFinalDock");
  const plateView=$p('[data-view="plate"]');
  const active=Boolean(row&&stage?.active);
  plateView?.classList.toggle("has-final-dock",active);
  if(!dock)return;
  if(!active){
    dock.hidden=true;
    dock.className="plate-final-dock";
    dock.innerHTML="";
    return;
  }
  dock.hidden=false;
  dock.className="plate-final-dock "+escPlate(stage.level||"watch");
  const endAt=Date.now()+Number(stage.ms||0);
  dock.innerHTML=
    '<button class="plate-final-dock-main" data-plate-dock-action="top" type="button"><small>主攻 '+escPlate(row.plate)+'</small><b data-plate-countdown-at="'+endAt+'" data-plate-countdown-prefix="'+escPlate(stage.label)+' · ">'+escPlate(stage.label)+' · '+escPlate(fmtCountdown(stage.ms))+'</b></button>'+
    '<button class="plate-final-dock-price '+(priceWarning?'plate-price-refresh-needed':'')+'" data-plate-dock-action="price" type="button"><small>手動價</small><b>'+(priceWarning?'立即更新':'更新')+'</b><span>'+escPlate(priceFreshness?.label||"尚未確認")+'</span></button>'+
    '<button class="plate-final-dock-official" data-plate-dock-action="official" type="button"><small>官方</small><b>正式競標</b></button>';
}
function renderPrimaryTarget(){
  const root=$p("#platePrimaryTarget");
  if(!root)return;
  const primary=loadPrimaryPlate();
  const row=loadRows().find(x=>x.plate===primary);
  if(!row){
    if(primary)savePrimaryPlate("");
    root.innerHTML='<div class="plate-primary-empty"><div><span class="mini-label">PRIMARY TARGET</span><b>尚未設定主攻號碼</b><small>從候選清單選一張「設為主攻」，最後階段就不用再翻找。</small></div></div>';
    renderPlateFinalDock(null,null,null,null);
    return;
  }
  const match=bestOfficialMatch(row.plate),status=match?auctionState(match):"nomatch",stage=watchFinalStage(row);
  const budget=Number(row.budget)||0,current=Number(row.current)||0,remain=budget&&current?budget-current:null,usage=watchBudgetUsage(row),budgetStatus=budgetState(row);
  const priceFreshness=watchPriceFreshness(row),priceWarning=watchPriceWarning(row),readiness=watchDecisionReadiness(row),timeline=platePrimaryTimeline(match);
  const stageEndAt=stage.active?Date.now()+Number(stage.ms||0):0;
  const stageMarkup=stage.active?'<div class="plate-final-stage '+escPlate(stage.level)+'"><b>'+escPlate(stage.label)+'</b><span data-plate-countdown-at="'+stageEndAt+'" data-plate-countdown-prefix="距公告決標 ">距公告決標 '+escPlate(fmtCountdown(stage.ms))+'</span>'+(stage.level==="extension"||stage.level==="critical"?'<small>最後 3 分鐘可能延長；請以正式競標頁最後時間為準。</small>':'')+'</div>':"";
  const finalActions=stage.active?'<div class="plate-primary-final-actions">'+
    '<div class="plate-primary-final-copy"><b>最後階段快捷</b><small>先確認你看到的最新價格，再到監理站完成正式出價。</small></div>'+
    '<button class="plate-final-price '+(priceWarning?'plate-price-refresh-needed':'')+'" data-plate-primary-action="price" type="button"><span>1</span><b>'+(priceWarning?'立即更新手動價':'確認／更新手動價')+'</b><small>'+escPlate(priceFreshness.label)+'</small></button>'+
    '<button class="plate-final-official" data-plate-primary-action="official" type="button"><span>2</span><b>立即正式競標</b><small>開啟監理站官方頁</small></button>'+
  '</div>':"";
  root.innerHTML=
    '<div class="plate-primary-head"><div><span class="mini-label">PRIMARY TARGET</span><div class="plate-primary-number">'+escPlate(row.plate)+'</div><small>'+escPlate(match?(match.office||"監理單位")+"・"+auctionLabel(status):"尚未命中目前官方公告")+'</small></div><div class="plate-primary-badges"><span class="plate-primary-badge">主攻</span><span class="plate-budget-state '+escPlate(budgetStatus.cls)+'">'+escPlate(budgetStatus.label)+'</span></div></div>'+
    '<div class="plate-readiness '+escPlate(readiness.level)+'"><b>'+escPlate(readiness.label)+'</b><small>'+escPlate(readiness.detail)+'</small></div>'+
    '<div class="plate-primary-timeline '+escPlate(timeline.level)+'">'+
      '<div><small>官方起標</small><b>'+escPlate(timeline.start)+'</b></div>'+
      '<div><small>原公告決標</small><b>'+escPlate(timeline.end)+'</b></div>'+
      '<div class="plate-primary-timeline-state"><b>'+escPlate(timeline.title)+'</b><small>'+escPlate(timeline.detail)+'</small></div>'+
    '</div>'+
    '<div class="plate-primary-grid">'+
      '<div><small>最高預算</small><b>'+moneyPlate(budget)+'</b></div>'+
      '<div><small>手動記錄價</small><b>'+moneyPlate(current)+'</b></div>'+
      '<div><small>手動價更新</small><b>'+escPlate(priceFreshness.label)+'</b></div>'+
      '<div><small>距離預算</small><b>'+(remain===null?"—":remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))+'</b></div>'+
      '<div><small>預算使用</small><b>'+(usage===null?"—":escPlate(usage+"%"))+'</b></div>'+
      '<div><small>官方公告決標</small><b>'+escPlate(fmtTime(match?.endAt||row.endTime))+'</b></div>'+
    '</div>'+stageMarkup+
    (priceWarning?'<div class="plate-price-warning '+escPlate(priceFreshness.level)+'">'+escPlate(priceWarning)+'</div>':"")+
    finalActions+
    '<div class="plate-primary-actions">'+
      (match?'<button data-plate-primary-action="detail" type="button">公告詳情</button>':'')+
      '<button data-plate-primary-action="budget" type="button">改預算</button>'+
      (!stage.active?'<button class="'+(priceWarning?'plate-price-refresh-needed':'')+'" data-plate-primary-action="price" type="button">更新手動價</button>':'')+
      '<button data-plate-primary-action="summary" type="button">複製主攻摘要</button>'+
      '<button data-plate-primary-action="history" type="button">官方歷史</button>'+
      (!stage.active?'<button class="official" data-plate-primary-action="official" type="button">官方即時競標</button>':'')+
      '<button data-plate-primary-action="clear" type="button">取消主攻</button>'+
    '</div>';
  renderPlateFinalDock(row,stage,priceFreshness,priceWarning);
}
function renderWatchSummary(){
  ensurePlateWatchTools();
  const rows=loadRows();
  let live=0,upcoming=0,finalStage=0,noMatch=0;
  rows.forEach(row=>{
    const match=bestOfficialMatch(row.plate);
    if(!match){noMatch++;return}
    const status=auctionState(match);
    if(status==="live"){
      live++;
      if(watchFinalStage(row).active)finalStage++;
    }else if(status==="upcoming")upcoming++;
    else noMatch++;
  });
  if($p("#plateWatchLiveCount"))$p("#plateWatchLiveCount").textContent=String(live);
  if($p("#plateWatchUpcomingCount"))$p("#plateWatchUpcomingCount").textContent=String(upcoming);
  if($p("#plateWatchFinalCount"))$p("#plateWatchFinalCount").textContent=String(finalStage);
  if($p("#plateWatchNoMatchCount"))$p("#plateWatchNoMatchCount").textContent=String(noMatch);
}
function watchSummaryText(rows=visibleWatchRows()){
  const list=Array.isArray(rows)?rows:[];
  const generated=new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  const lines=["COLA GO 車牌候選摘要","整理時間："+generated,""];
  const primary=loadPrimaryPlate();
  if(primary)lines.push("主攻號碼："+primary,"");
  if(!list.length){
    lines.push("目前沒有符合篩選的候選。");
    return lines.join("\n");
  }
  list.forEach((row,index)=>{
    const match=bestOfficialMatch(row.plate),status=match?auctionLabel(auctionState(match)):"暫無官方公告";
    const stage=watchFinalStage(row),budget=Math.max(0,Number(row.budget)||0),current=Math.max(0,Number(row.current)||0),freshness=watchPriceFreshness(row);
    const remain=budget&&current?budget-current:null;
    lines.push((index+1)+". "+row.plate+(row.plate===primary?"【主攻】":""));
    lines.push("官方："+status+(match?.office?"｜"+match.office:""));
    lines.push("官方起標："+fmtTime(match?.startAt||"")+"｜原公告決標："+fmtTime(match?.endAt||row.endTime));
    lines.push("最高預算："+moneyPlate(budget)+"｜手動價："+moneyPlate(current)+"（"+freshness.label+"）"+(remain===null?"":"｜距預算："+(remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))));
    if(stage.active)lines.push("最後階段："+stage.label+"｜"+fmtCountdown(stage.ms));
    if(row.plate===primary){
      const readiness=watchDecisionReadiness(row);
      lines.push("主攻狀態："+readiness.label+"｜"+readiness.detail);
    }
    lines.push("目前出價／出價次數：請以官方頁即時資訊為準");
    lines.push("");
  });
  return lines.join("\n").trim();
}
async function openOfficialBidFor(value){
  const plate=normalize(value);
  if(plate){
    try{
      await navigator.clipboard.writeText(plate);
      if(window.toast)toast(plate+" 已複製，請到官方頁完成正式競標");
    }catch{}
  }
  window.open(official.bid,"_blank","noopener");
}
async function openPlateHistoryFor(value){
  const plate=normalize(value);
  if(plate){
    try{
      await navigator.clipboard.writeText(plate);
      if(window.toast)toast(plate+" 已複製，可貼到官方歷史查詢");
    }catch{}
  }
  window.open(official.history,"_blank","noopener");
}
function watchBackupPayload(){
  return JSON.stringify({schema:2,exportedAt:new Date().toISOString(),primaryPlate:loadPrimaryPlate(),items:loadRows().map(row=>({
    plate:normalize(row.plate),
    budget:Math.max(0,Number(row.budget)||0),
    current:Math.max(0,Number(row.current)||0),
    endTime:row.endTime||"",
    priceUpdatedAt:row.priceUpdatedAt||""
  }))});
}
function restoreWatchPayload(raw){
  let data;
  try{data=JSON.parse(String(raw||"").trim())}catch{return {ok:false,message:"備份格式無法讀取"}}
  if(!data||!Array.isArray(data.items))return {ok:false,message:"備份內容不完整"};
  const now=Date.now();
  const rows=data.items.slice(0,100).map((row,index)=>{
    const plate=normalize(row?.plate);
    if(!plate)return null;
    return {
      id:String(now+index)+"-restore",
      plate,
      budget:Math.max(0,Number(row?.budget)||0),
      current:Math.max(0,Number(row?.current)||0),
      endTime:String(row?.endTime||""),
      priceUpdatedAt:String(row?.priceUpdatedAt||""),
      createdAt:new Date().toISOString()
    };
  }).filter(Boolean);
  if(!rows.length)return {ok:false,message:"備份裡沒有可用候選"};
  const merged=new Map(loadRows().map(row=>[row.plate,row]));
  rows.forEach(row=>merged.set(row.plate,{...merged.get(row.plate),...row}));
  const mergedRows=[...merged.values()];
  saveRows(mergedRows);
  const restoredPrimary=normalize(data.primaryPlate||"");
  if(restoredPrimary&&mergedRows.some(row=>row.plate===restoredPrimary))savePrimaryPlate(restoredPrimary);
  renderWatchList();
  renderAnnouncements();
  checkAnnouncementAlerts();
  return {ok:true,message:"已還原 "+rows.length+" 筆候選"};
}

function watchOfficialState(row){
  const match=bestOfficialMatch(row.plate);
  return match?auctionState(match):"nomatch";
}
function auctionFinalStage(match,now=Date.now()){
  if(!match||auctionState(match,now)!=="live")return {active:false,level:"",label:"",ms:null,match};
  const end=Date.parse(match.endAt||"");
  if(!Number.isFinite(end))return {active:false,level:"",label:"",ms:null,match};
  const ms=end-now;
  if(ms<=0)return {active:false,level:"passed",label:"公告時間已到・請回官方確認",ms,match};
  if(ms<=60000)return {active:true,level:"critical",label:"最後 1 分鐘",ms,match};
  if(ms<=3*60000)return {active:true,level:"extension",label:"最後 3 分鐘・可能延長",ms,match};
  if(ms<=5*60000)return {active:true,level:"urgent",label:"剩 5 分鐘內",ms,match};
  if(ms<=15*60000)return {active:true,level:"watch",label:"剩 15 分鐘內",ms,match};
  return {active:false,level:"",label:"",ms,match};
}
function watchFinalStage(row,now=Date.now()){
  return auctionFinalStage(bestOfficialMatch(row.plate),now);
}
function watchPriceFreshness(row,now=Date.now()){
  const current=Number(row?.current)||0;
  if(!current)return {level:"missing",label:"尚未記錄價格",ageMs:null};
  const ts=Date.parse(row?.priceUpdatedAt||"");
  if(!Number.isFinite(ts))return {level:"stale",label:"價格更新時間未知",ageMs:null};
  const age=Math.max(0,now-ts),minute=60000,hour=3600000;
  if(age<=3*minute)return {level:"fresh",label:"3 分鐘內確認",ageMs:age};
  if(age<=10*minute)return {level:"recent",label:Math.max(4,Math.floor(age/minute))+" 分鐘前確認",ageMs:age};
  if(age<60*minute)return {level:"stale",label:Math.floor(age/minute)+" 分鐘未更新",ageMs:age};
  if(age<24*hour)return {level:"stale",label:Math.floor(age/hour)+" 小時未更新",ageMs:age};
  return {level:"stale",label:"超過 1 天未更新",ageMs:age};
}
function watchDecisionReadiness(row,now=Date.now()){
  if(!row)return {level:"waiting",label:"尚未設定主攻",detail:"先從候選清單選一個主攻號碼。"};
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  const match=bestOfficialMatch(row.plate);
  if(!match)return {level:"waiting",label:"等待官方公告",detail:"目前沒有命中公開標牌公告，可先保留候選與預算。"};
  const status=auctionState(match,now);
  if(status==="upcoming")return {level:"waiting",label:"等待起標",detail:"已命中官方公告，尚未進入競標時間。"};
  if(status!=="live")return {level:"waiting",label:"官方公告已結束",detail:"請到官方頁確認最終結果或後續公告。"};
  if(!budget)return {level:"caution",label:"先設定最高預算",detail:"正式競標前先設定自己的預算上限。"};
  if(current>budget)return {level:"blocked",label:"目前手動價已超預算",detail:"你記錄的手動價格已高於設定預算；請回官方頁確認最新價格。"};
  const freshness=watchPriceFreshness(row,now);
  if(!current)return {level:"caution",label:"先確認目前價格",detail:"COLA GO 沒有官方逐筆出價資料，請先到官方頁確認並記錄目前價格。"};
  if(freshness.level==="stale"||Number(freshness.ageMs)>3*60000)return {level:"caution",label:"手動價需要重新確認",detail:freshness.label+"；最後階段請先回官方頁確認最新出價。"};
  return {level:"ready",label:"可進官方確認",detail:"預算與手動價資料已整理；正式價格、出價次數與延長時間仍以官方頁為準。"};
}
function watchPriceWarning(row,now=Date.now()){
  const freshness=watchPriceFreshness(row,now),stage=watchFinalStage(row,now);
  if(!Number(row?.current))return stage.active?"最後階段尚未記錄手動價，請先到官方頁確認。":"";
  if(stage.active&&(freshness.level==="stale"||Number(freshness.ageMs)>3*60000))return "最後階段・"+freshness.label+"，請先回官方頁確認最新出價。";
  if(freshness.level==="stale")return "手動價格"+freshness.label+"，正式出價前請回官方頁確認。";
  return "";
}
function watchBudgetUsage(row){
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  if(!budget||!current)return null;
  return Math.round(current/budget*100);
}
function editWatchBudget(row){
  if(!row)return false;
  const raw=prompt("輸入 "+row.plate+" 的最高預算",row.budget||"");
  if(raw===null)return false;
  const rows=loadRows(),target=rows.find(x=>x.id===row.id)||rows.find(x=>x.plate===row.plate);
  if(!target)return false;
  target.budget=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
  saveRows(rows);
  renderWatchList();
  return true;
}
function editWatchPrice(row){
  if(!row)return false;
  const raw=prompt("輸入 "+row.plate+" 在官方頁看到的目前價格",row.current||"");
  if(raw===null)return false;
  const rows=loadRows(),target=rows.find(x=>x.id===row.id)||rows.find(x=>x.plate===row.plate);
  if(!target)return false;
  const value=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
  target.current=value;
  target.priceUpdatedAt=value?new Date().toISOString():"";
  saveRows(rows);
  renderWatchList();
  if(value&&target.budget){
    if(value>target.budget)notify("COLA GO 車牌提醒",target.plate+" 目前價格 "+moneyPlate(value)+"，已超過你的預算 "+moneyPlate(target.budget)+"。","budget-"+target.id+"-over");
    else if(value>=target.budget*.9)notify("COLA GO 車牌提醒",target.plate+" 目前價格已接近你的預算上限。","budget-"+target.id+"-near");
  }
  return true;
}
function watchPriorityRank(row){
  const status=watchOfficialState(row);
  const stage=watchFinalStage(row);
  const stageRank=stage.active?({critical:0,extension:1,urgent:2,watch:3}[stage.level]??4):9;
  const primaryRank=row.plate===loadPrimaryPlate()?0:1;
  const statusRank={live:0,upcoming:1,ended:2,nomatch:3}[status]??4;
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  const risk=budget&&current?current/budget:0;
  return {stageRank,primaryRank,statusRank,risk};
}
function visibleWatchRows(){
  let rows=loadRows();
  if(watchFilter==="final")rows=rows.filter(row=>watchFinalStage(row).active);
  if(watchFilter==="live")rows=rows.filter(row=>watchOfficialState(row)==="live");
  if(watchFilter==="upcoming")rows=rows.filter(row=>watchOfficialState(row)==="upcoming");
  if(watchFilter==="nomatch")rows=rows.filter(row=>watchOfficialState(row)==="nomatch");
  rows.sort((a,b)=>{
    if(watchSort==="budget"){
      const ar=watchPriorityRank(a),br=watchPriorityRank(b);
      if(br.risk!==ar.risk)return br.risk-ar.risk;
      return ar.statusRank-br.statusRank;
    }
    if(watchSort==="recent")return Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0);
    if(watchSort==="plate")return String(a.plate||"").localeCompare(String(b.plate||""),"en");
    const ar=watchPriorityRank(a),br=watchPriorityRank(b);
    if(ar.stageRank!==br.stageRank)return ar.stageRank-br.stageRank;
    if(ar.primaryRank!==br.primaryRank)return ar.primaryRank-br.primaryRank;
    if(ar.statusRank!==br.statusRank)return ar.statusRank-br.statusRank;
    return br.risk-ar.risk||Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0);
  });
  return rows;
}
function renderWatchList(){
  const root=$p("#plateWatchList"),count=$p("#plateWatchCount");
  if(!root)return;
  ensurePlateWatchTools();
  const allRows=loadRows(),rows=visibleWatchRows(),primary=loadPrimaryPlate();
  if(count)count.textContent=String(allRows.length);
  $$p("[data-plate-watch-filter]").forEach(btn=>btn.classList.toggle("active",btn.dataset.plateWatchFilter===watchFilter));
  const sort=$p("#plateWatchSort");if(sort)sort.value=watchSort;
  if(!allRows.length){
    root.innerHTML='<div class="plate-watch-empty"><b>還沒有追蹤數字</b><br>上方輸入 1010、1117、8888 這類數字即可。之後全台任何前綴、任何監理單位命中都會算在同一組。</div>';
    renderPrimaryTarget();renderWatchSummary();return;
  }
  if(!rows.length){
    root.innerHTML='<div class="plate-watch-empty"><b>目前這個篩選沒有候選</b><br>可到「篩選、排序與備份」切回全部。</div>';
    renderPrimaryTarget();renderWatchSummary();return;
  }
  root.innerHTML=rows.map(row=>{
    const matches=matchingAnnouncements(row.plate).slice().sort((a,b)=>{
      const p={live:0,upcoming:1,ended:2};
      return p[auctionState(a)]-p[auctionState(b)]||Date.parse(a.endAt||"9999")-Date.parse(b.endAt||"9999");
    });
    const match=matches[0]||null;
    const liveMatches=matches.filter(x=>auctionState(x)==="live");
    const upcomingMatches=matches.filter(x=>auctionState(x)==="upcoming");
    const offices=[...new Set(matches.map(x=>x.office).filter(Boolean))];
    const isPrimary=(watchNumber(row.plate)||row.plate)===(watchNumber(primary)||primary);
    const stage=watchFinalStage(row),budget=Number(row.budget)||0,current=Number(row.current)||0;
    const remain=budget&&current?budget-current:null,budgetUsage=watchBudgetUsage(row),priceFreshness=watchPriceFreshness(row),priceWarning=watchPriceWarning(row);
    const number=watchDisplayNumber(row.plate),scope=watchScopeLabel(row.plate);
    const badge=liveMatches.length?("競標中 "+liveMatches.length+" 處"):upcomingMatches.length?("即將開標 "+upcomingMatches.length+" 處"):matches.length?("全台命中 "+matches.length+" 筆"):"全台追蹤中";
    const badgeCls=liveMatches.length?"live":upcomingMatches.length?"upcoming":"";
    const matchLine=matches.length
      ?"目前命中 "+matches.length+" 筆・"+offices.length+" 個監理單位"+(offices.length?"・"+offices.slice(0,2).join("、")+(offices.length>2?"…":""):"")
      :"目前公開公告未命中，背景仍會持續追蹤";
    const stageEndAt=stage.active?Date.now()+Number(stage.ms||0):0;
    const stageLine=stage.active?'<div class="plate-final-stage '+escPlate(stage.level)+'"><b>'+escPlate(stage.label)+'</b><span data-plate-countdown-at="'+stageEndAt+'" data-plate-countdown-prefix="距公告決標 ">距公告決標 '+escPlate(fmtCountdown(stage.ms))+'</span></div>':"";
    const finalQuick=stage.active?'<div class="plate-watch-final-actions">'+
      '<button class="plate-watch-final-price '+(priceWarning?'plate-price-refresh-needed':'')+'" data-plate-action="price" type="button"><span>1</span><b>'+(priceWarning?'立即更新手動價':'確認／更新手動價')+'</b><small>'+escPlate(priceFreshness.label)+'</small></button>'+
      '<button class="plate-watch-final-official" data-plate-action="official" type="button"><span>2</span><b>立即正式競標</b><small>開啟監理站官方頁</small></button>'+
    '</div>':"";
    const advanced='<details class="plate-watch-more"><summary>進階設定與操作</summary>'+
      '<div class="plate-watch-meta">'+
        '<div><small>追蹤範圍</small><b>'+escPlate(scope)+'</b></div>'+
        '<div><small>最高預算</small><b>'+moneyPlate(budget)+'</b></div>'+
        '<div><small>手動記錄價</small><b>'+moneyPlate(current)+'</b></div>'+
        '<div><small>距離預算</small><b>'+(remain===null?"—":remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))+'</b></div>'+
        '<div><small>預算使用</small><b>'+(budgetUsage===null?"—":escPlate(budgetUsage+"%"))+'</b></div>'+
        '<div><small>優先公告決標</small><b>'+escPlate(fmtTime(match?.endAt||row.endTime))+'</b></div>'+
      '</div>'+
      (current?'<div class="plate-detail-note">手動價格：'+escPlate(priceFreshness.label)+'。正式出價前請回官方頁確認最新價格。</div>':'')+
      '<div class="plate-watch-actions">'+
        '<button data-plate-action="primary" type="button">'+(isPrimary?'主攻中':'設為主攻')+'</button>'+
        '<button data-plate-action="copy" type="button">複製數字</button>'+
        '<button data-plate-action="budget" type="button">改預算</button>'+
        '<button data-plate-action="price" type="button">更新手動價</button>'+
        '<button data-plate-action="history" type="button">官方歷史</button>'+
        '<button class="official" data-plate-action="official" type="button">正式競標</button>'+
        '<button class="danger" data-plate-action="remove" type="button">移除追蹤</button>'+
      '</div></details>';
    return '<article class="plate-watch-card plate-number-card'+(stage.active?' is-final-stage':'')+(isPrimary?' is-primary-target':'')+'" data-plate-id="'+escPlate(row.id)+'">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(number)+(isPrimary?'<span class="plate-primary-chip">主攻</span>':'')+'</div><small class="meta">全台不限英文字母・不限監理站・escPlate(vehicleScopeLabel())</small></div><span class="plate-auction-state '+badgeCls+'">'+escPlate(badge)+'</span></div>'+
      '<div class="plate-number-match-line">'+escPlate(matchLine)+'</div>'+
      '<div class="plate-number-card-actions"><button data-plate-action="matches" type="button">'+(matches.length?'查看全台命中':'查看全台公告')+'</button></div>'+
      stageLine+finalQuick+advanced+
    '</article>';
  }).join("");
  renderPrimaryTarget();
  renderWatchSummary();
}
function announcementMatchesWatch(row){
  if(!categoryMatchesScope(row))return [];
  return loadRows().filter(w=>rangeContains(row,w.plate));
}
function renderAnnouncements(){
  const root=$p("#plateAnnouncementList");
  if(!root)return;
  const items=Array.isArray(announcementData.items)?announcementData.items:[];
  const scopedItems=items.filter(x=>categoryMatchesScope(x));
  const now=Date.now(),watches=loadRows();
  const live=scopedItems.filter(x=>auctionState(x,now)==="live").length;
  const upcoming=scopedItems.filter(x=>auctionState(x,now)==="upcoming").length;
  const matched=scopedItems.filter(x=>watches.some(w=>rangeContains(x,w.plate))).length;
  if($p("#plateLiveCount"))$p("#plateLiveCount").textContent=String(live);
  if($p("#plateUpcomingCount"))$p("#plateUpcomingCount").textContent=String(upcoming);
  if($p("#plateMatchedCount"))$p("#plateMatchedCount").textContent=String(matched);
  const stateEl=$p("#plateAnnouncementSourceState");
  if(stateEl){
    stateEl.className="plate-source-state"+(announcementData.error?" error":announcementData.stale?" stale":"");
    stateEl.textContent=announcementData.error&&!items.length?"讀取失敗":announcementData.stale?"上次可用":"官方資料";
  }
  if($p("#plateAnnouncementUpdated"))$p("#plateAnnouncementUpdated").textContent=fmtUpdated(announcementData.updatedAt);
  $$p("[data-plate-filter]").forEach(b=>b.classList.toggle("active",b.dataset.plateFilter===announcementFilter));
  if(!items.length){
    const msg=announcementData.status==="pending-sync"?"官方資料第一次同步中；仍可先使用上方監理服務網入口。":announcementData.error?"目前讀不到公告資料，請直接開啟監理服務網確認。":"目前沒有未決標公告資料。";
    root.innerHTML='<div class="plate-watch-empty">'+escPlate(msg)+'</div>';
    renderWatchList();
    return;
  }
  let rows=items.slice();
  if(announcementFilter==="live")rows=rows.filter(x=>auctionState(x,now)==="live");
  if(announcementFilter==="upcoming")rows=rows.filter(x=>auctionState(x,now)==="upcoming");
  if(announcementFilter==="watch")rows=rows.filter(x=>watches.some(w=>rangeContains(x,w.plate)));
  const q=normalize(announcementQuery);
  if(q){
    const parts=plateParts(q);
    rows=rows.filter(x=>parts?rangeContains(x,q):[x.office,x.category,x.startNumber,x.endNumber].join(" ").toUpperCase().includes(q));
  }
  const priority={live:0,upcoming:1,ended:2};
  rows.sort((a,b)=>priority[auctionState(a,now)]-priority[auctionState(b,now)]||Date.parse(a.startAt||0)-Date.parse(b.startAt||0));
  if(!rows.length){
    root.innerHTML='<div class="plate-watch-empty"><b>沒有符合的官方公告</b><br>若你找的是一般「可選號碼」，上方站內判讀會先說明是否命中公開公告；即時可選狀態仍需完成官方驗證碼查詢。</div>';
    renderWatchList();
    return;
  }
  const queryPlate=plateParts(q)?q:"";
  root.innerHTML=rows.slice(0,80).map(row=>{
    const status=auctionState(row,now),start=Date.parse(row.startAt||""),end=Date.parse(row.endAt||"");
    const stage=auctionFinalStage(row,now);
    const countdownAt=status==="upcoming"&&Number.isFinite(start)?start:status==="live"&&Number.isFinite(end)?end:0;
    const countdownPrefix=status==="upcoming"?"距起標 ":status==="live"?"距公告決標 ":"";
    const countdown=countdownAt?countdownPrefix+fmtCountdown(countdownAt-now):"";
    const stageMarkup=stage.active?'<div class="plate-final-stage '+escPlate(stage.level)+'"><b>'+escPlate(stage.label)+'</b><span data-plate-countdown-at="'+end+'" data-plate-countdown-prefix="">'+escPlate(fmtCountdown(stage.ms))+'</span>'+(stage.level==="extension"||stage.level==="critical"?'<small>最後 3 分鐘若有兩人以上繼續出高價，官方會延長 3 分鐘、最多 10 次；請以正式競標頁最後時間為準。</small>':'')+'</div>':"";
    const matches=announcementMatchesWatch(row);
    const matchMarkup=matches.length?'<div class="plate-watch-match">'+matches.map(w=>'<span>候選 '+escPlate(w.plate)+'</span>').join("")+'</div>':"";
    const range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
    const addButton=queryPlate&&rangeContains(row,queryPlate)&&!loadRows().some(w=>w.plate===queryPlate)?'<button data-plate-announcement-action="watch" data-plate-value="'+escPlate(queryPlate)+'" data-plate-end="'+escPlate(row.endAt||"")+'" type="button">追蹤 '+escPlate(queryPlate)+'</button>':"";
    return '<article class="plate-announcement-card'+(stage.active?' is-final-stage':'')+'">'+
      '<div class="plate-announcement-top"><div><div class="plate-announcement-range">'+escPlate(range)+'</div><div class="plate-announcement-office">'+escPlate(row.office||"")+'・'+escPlate(row.category||"")+'</div></div><span class="plate-auction-state '+status+'">'+auctionLabel(status)+'</span></div>'+
      '<div class="plate-announcement-timing"><div><small>起標</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div><div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div></div>'+
      (countdown?'<div class="plate-countdown" data-plate-countdown-at="'+countdownAt+'" data-plate-countdown-prefix="'+escPlate(countdownPrefix)+'">'+escPlate(countdown)+'</div>':"")+stageMarkup+matchMarkup+
      (status==="live"?'<div class="plate-detail-note"><b>官方同步：</b>競標狀態、起標／公告決標時間<br><b>需官方即時確認：</b>目前出價、出價次數、最後延長後時間</div>':"")+
      '<div class="plate-announcement-actions">'+addButton+'<button data-plate-announcement-action="detail" data-plate-id="'+escPlate(row.id)+'" type="button">查看詳情</button>'+(status==="live"?'<button class="'+(stage.active?'official plate-bid-now':'official')+'" data-plate-announcement-action="official" type="button">'+(stage.active?'立即正式競標':'正式競標')+'</button>':"")+'</div>'+
    '</article>'
  }).join("");
  renderWatchList();
}

function isPlateStandalone(){
  return window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
}
function isPlateIOS(){
  const ua=navigator.userAgent||"";
  return /iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
}
function ensurePlateNotificationCenter(){
  const box=$p(".plate-notify-box");
  if(!box||$p("#plateNotifyCapability"))return;
  const actions=box.querySelector(".plate-notify-actions");
  if(actions&&!$p("#plateTestNotify"))actions.insertAdjacentHTML("beforeend",'<button id="plateTestNotify" type="button">測試提醒</button>');
  const target=actions||box.querySelector(".plate-notify-copy");
  if(!target)return;
  target.insertAdjacentHTML("afterend",
    '<div class="plate-watch-meta" id="plateNotifyCapability">'+
      '<div><small>頁面／系統提醒</small><b id="plateNotifyPermission">檢查中</b></div>'+
      '<div><small>PWA 狀態</small><b id="plateNotifyPwa">檢查中</b></div>'+
      '<div><small>背景 Web Push</small><b id="plateNotifyPush">檢查中</b></div>'+
      '<div><small>LINE 個人化</small><b id="plateNotifyLine">尚未綁定</b></div>'+
    '</div>'+
    '<div class="plate-detail-note" id="plateNotifyDetail">正在檢查這台裝置的通知能力。</div>'+
    '<div class="plate-line-notify" id="plateLineNotifyPanel">'+
      '<div class="plate-line-head"><div><small>LINE PERSONAL ALERT</small><b>LINE 個人化競標通知</b></div><span class="plate-line-state" id="plateLineStatus">檢查中</span></div>'+
      '<div class="plate-line-summary" id="plateLineSummary">0 個候選</div>'+
      '<p id="plateLineNote">正在檢查安全通知後端。</p>'+
      '<div class="plate-line-actions">'+
        '<button class="primary" id="plateLineBind" type="button">綁定 LINE 通知</button>'+
        '<button id="plateLineCheck" type="button">檢查綁定</button>'+
        '<button id="plateLineSync" type="button">同步候選</button>'+
        '<button id="plateLineOpenOA" type="button">開啟官方 LINE</button>'+
        '<button class="danger" id="plateLineDisconnect" type="button">解除綁定</button>'+
      '</div>'+
      '<small class="plate-line-privacy">只同步候選車牌、主攻號碼與提醒事件；預算、手動價格、監理站帳密與付款資料不會傳到 LINE 通知後端。</small>'+
    '</div>'
  );
}
async function platePushCapability(){
  const result={worker:false,push:false,subscription:false};
  if(!("serviceWorker" in navigator))return result;
  try{
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
    if(!reg)return result;
    result.worker=true;
    result.push=("PushManager" in window)&&!!reg.pushManager;
    if(result.push)result.subscription=!!(await reg.pushManager.getSubscription());
  }catch{}
  return result;
}
async function updateNotificationCenter(){
  const permission=$p("#plateNotifyPermission"),pwa=$p("#plateNotifyPwa"),push=$p("#plateNotifyPush"),line=$p("#plateNotifyLine"),detail=$p("#plateNotifyDetail");
  if(!permission&&!pwa&&!push&&!line&&!detail)return;
  const hasNotification="Notification" in window;
  const standalone=isPlateStandalone(),ios=isPlateIOS();
  const capability=await platePushCapability();
  if(permission)permission.textContent=!hasNotification?"不支援":Notification.permission==="granted"?"已允許":Notification.permission==="denied"?"已封鎖":"待允許";
  if(pwa)pwa.textContent=standalone?"主畫面 Web App":"瀏覽器模式";
  if(push){
    if(!capability.worker)push.textContent="Service Worker 未就緒";
    else if(!capability.push)push.textContent="此環境不支援";
    else if(ios&&!standalone)push.textContent="先加入主畫面";
    else if(!hasNotification||Notification.permission!=="granted")push.textContent="待允許通知";
    else if(capability.subscription)push.textContent="已建立訂閱";
    else push.textContent="前端就緒・後端待啟用";
  }
  if(line){const device=loadLineNotifyDevice();line.textContent=device?.token?(isLineNotifyDirty()?"已綁定・待同步":"已綁定"):lineNotifyApiBase()?"可安全綁定":"後端待啟用"}
  renderLineNotifySetup();
  if(detail){
    if(ios&&!standalone)detail.textContent="iPhone／iPad 的背景 Web Push 需先把 COLA GO 加到主畫面，再從主畫面開啟並由你主動允許通知。現在仍可使用頁面內候選追蹤。";
    else if(hasNotification&&Notification.permission==="denied")detail.textContent="通知權限已被封鎖。請到系統或瀏覽器的網站通知設定重新允許；COLA GO 不會反覆跳出要求。";
    else if(hasNotification&&Notification.permission==="granted"&&capability.worker)detail.textContent=capability.subscription?"這台裝置已有 Web Push 訂閱；仍以正式通知後端是否啟用為準。":"系統通知路徑已可測試；背景 Web Push 前端已就緒，但安全推播後端與訂閱儲存尚未啟用，所以目前不會假裝能在網站完全關閉時收到個人化競標通知。";
    else detail.textContent="先按「開啟瀏覽器通知」完成使用者授權。COLA GO 只會在你主動操作後要求通知權限。";
  }
}

function updateNotifyText(){
  const el=$p("#plateNotifyState");
  if(!el)return;
  if(!("Notification" in window)){el.textContent="這個瀏覽器不支援系統通知；仍可使用頁面內候選追蹤與 LINE 官方帳號。";return}
  if(Notification.permission==="granted")el.textContent="通知權限已開啟。頁面開啟期間會比對官方標牌公告並提醒候選號碼；可用「測試提醒」確認這台裝置的系統通知路徑。";
  else if(Notification.permission==="denied")el.textContent="通知權限目前被封鎖；請到系統或瀏覽器的網站通知設定重新允許。";
  else el.textContent="按下「開啟瀏覽器通知」後才會要求系統權限；COLA GO 不會在你沒有操作時主動跳出授權視窗。";
}
function deadlineReminder(ms){
  if(!Number.isFinite(ms)||ms<=0)return null;
  if(ms<=60000)return {m:1,label:"1 分鐘"};
  if(ms<=3*60000)return {m:3,label:"3 分鐘（延長可能區）"};
  if(ms<=5*60000)return {m:5,label:"5 分鐘"};
  if(ms<=15*60000)return {m:15,label:"15 分鐘"};
  return null;
}
function checkDeadlines(){
  const now=Date.now(),alerts=loadAlerts();
  loadRows().forEach(row=>{
    if(!row.endTime)return;
    const ms=new Date(row.endTime).getTime()-now;
    if(!Number.isFinite(ms)||ms<=0)return;
    const reminder=deadlineReminder(ms);
    if(reminder){
      const key=row.id+"-manual-"+reminder.m;
      if(!alerts[key]){
        alerts[key]=Date.now();
        notify("COLA GO 車牌提醒",row.plate+" 距離你設定的結標時間約剩 "+reminder.label+"。請回官方頁確認最新價格與決標時間。",key);
      }
    }
  });
  saveAlerts(alerts);
}
function checkAnnouncementAlerts(){
  if(announcementData.stale||announcementData.error)return;
  const now=Date.now(),alerts=loadAlerts(),watches=loadRows(),items=announcementData.items||[];
  watches.forEach(w=>{
    items.filter(row=>categoryMatchesScope(row)&&rangeContains(row,w.plate)).forEach(row=>{
      const status=auctionState(row,now),base="official-"+row.id+"-"+w.plate;
      if(status==="live"&&!alerts[base+"-live"]){
        alerts[base+"-live"]=Date.now();
        notify("COLA GO 車牌開標提醒",w.plate+" 已出現在官方競標公告中並進入競標。請立即開啟官方頁確認目前出價。",base+"-live");
      }
      const start=Date.parse(row.startAt||""),end=Date.parse(row.endAt||"");
      if(status==="upcoming"&&Number.isFinite(start)){
        [[60,"1 小時"],[15,"15 分鐘"]].forEach(([m,label])=>{
          const key=base+"-start-"+m,ms=start-now;
          if(ms>0&&ms<=m*60000&&!alerts[key]){
            alerts[key]=Date.now();
            notify("COLA GO 車牌即將開標",w.plate+" 距官方公告起標約剩 "+label+"。",key);
          }
        });
      }
      if(status==="live"&&Number.isFinite(end)){
        const ms=end-now,reminder=deadlineReminder(ms);
        if(reminder){
          const key=base+"-end-"+reminder.m;
          if(!alerts[key]){
            alerts[key]=Date.now();
            notify("COLA GO 車牌競標提醒",w.plate+" 距公告決標約剩 "+reminder.label+"。最後階段可能因官方規則延長，請以監理服務網最新時間為準。",key);
          }
        }
      }
    });
  });
  saveAlerts(alerts);
}
async function fetchAnnouncementPayload(){
  const urls=[];
  const api=lineNotifyApiBase();
  if(api)urls.push(api+"/v1/plate-line/announcements");
  urls.push(ANNOUNCEMENT_URL+"?v="+Date.now());
  let lastError=null;
  for(const url of urls){
    try{
      const res=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"}});
      if(!res.ok)throw new Error("HTTP "+res.status);
      const data=await res.json();
      if(!data||!Array.isArray(data.items))throw new Error("invalid announcements");
      return data;
    }catch(error){lastError=error}
  }
  throw lastError||new Error("announcement sources unavailable");
}
async function loadAnnouncements(){
  announcementFetchAt=Date.now();
  try{
    const data=await fetchAnnouncementPayload();
    announcementData={...data,stale:data?.stale===true,error:""};
    saveAnnouncementCache(data);
    recordAnnouncementChanges(announcementData);
  }catch(error){
    const cached=loadAnnouncementCache();
    if(cached&&Array.isArray(cached.items))announcementData={...cached,stale:true,error:""};
    else announcementData={status:"error",items:[],updatedAt:null,stale:false,error:String(error?.message||error)};
  }
  renderAnnouncements();
  renderAnnouncementChanges();
  if(announcementQuery)renderPlateSearchResult(announcementQuery);
  checkAnnouncementAlerts();
}
function bind(){
  if(!$p('[data-view="plate"]'))return;
  ensurePlateV4Panels();
  ensurePlateNotificationCenter();
  renderChecklist();
  renderAnnouncementChanges();
  renderOfficeDirectory();
  renderWatchList();updateNotifyText();updateNotificationCenter();void loadLineNotifyConfig().finally(()=>loadAnnouncements());loadOffices();bindLineNotifyControls();

  const search=$p("#plateSearchBtn");
  if(search)search.onclick=()=>{
    announcementQuery=normalize($p("#plateSearchInput")?.value);
    if(announcementQuery)try{localStorage.setItem("cola-go-last-plate-search",announcementQuery)}catch{}
    renderAnnouncements();
    renderPlateSearchResult(announcementQuery);
    $p("#plateSearchResultPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const searchInput=$p("#plateSearchInput");
  if(searchInput)searchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();search?.click()}});
  const clear=$p("#plateClearSearch");
  if(clear)clear.onclick=()=>{announcementQuery="";if(searchInput)searchInput.value="";renderAnnouncements();renderPlateSearchResult("")};

  $$p("[data-plate-filter]").forEach(btn=>btn.onclick=()=>{announcementFilter=btn.dataset.plateFilter||"all";renderAnnouncements()});
  $$p("[data-plate-jump]").forEach(btn=>btn.onclick=()=>{
    const target=btn.dataset.plateJump;
    if(target==="search"){scrollToPlate("#plateSearchInput");$p("#plateSearchInput")?.focus();return}
    if(target==="watch"){announcementFilter="watch";renderAnnouncements();scrollToPlate(".plate-watch-panel");return}
    announcementFilter=target==="live"?"live":"upcoming";
    renderAnnouncements();
    scrollToPlate(".plate-announcement-panel");
  });

  const add=$p("#plateAddWatch");
  if(add)add.onclick=()=>{
    const plate=watchNumber($p("#plateCandidate")?.value);
    if(!plate){window.toast?toast("請輸入 1～4 位數字，例如 1010"):alert("請輸入 1～4 位數字，例如 1010");return}
    const budget=Math.max(0,Number($p("#plateBudget")?.value)||0);
    const current=Math.max(0,Number($p("#plateCurrentPrice")?.value)||0);
    const endTime=$p("#plateEndTime")?.value||bestOfficialMatch(plate)?.endAt||"";
    upsertWatch(plate,budget,current,endTime);
    announcementQuery=plate;
    renderPlateSearchResult(plate);
    if(current&&budget){
      if(current>budget)notify("COLA GO 車牌提醒",plate+" 目前價格已超過你設定的預算。","budget-"+plate);
      else if(current>=budget*.9)notify("COLA GO 車牌提醒",plate+" 已接近你設定的預算上限。","budget-"+plate);
    }
    if(window.toast)toast(plate+" 已開始全台追蹤");
    ["#plateCandidate","#plateBudget","#plateCurrentPrice","#plateEndTime"].forEach(s=>{const el=$p(s);if(el)el.value=""});
  };
  const vehicleScope=$p("#plateVehicleScope");
  if(vehicleScope){
    vehicleScope.value=loadVehicleScope();
    vehicleScope.onchange=()=>saveVehicleScope(vehicleScope.value);
  }

  const enable=$p("#plateEnableNotify");
  if(enable)enable.onclick=async()=>{
    if(!("Notification" in window)){alert("這個瀏覽器不支援網站通知");return}
    const p=await Notification.requestPermission();
    updateNotifyText();
    await updateNotificationCenter();
    if(p==="granted")await notify("COLA GO 車牌提醒","通知已開啟。頁面開啟期間，候選車牌命中公告或接近起標／結標時間時會提醒你。","notify-ready");
  };
  const testNotify=$p("#plateTestNotify");
  if(testNotify)testNotify.onclick=async()=>{
    if(!("Notification" in window)){alert("這個瀏覽器不支援網站通知");return}
    if(Notification.permission==="default")await Notification.requestPermission();
    updateNotifyText();
    await updateNotificationCenter();
    if(Notification.permission!=="granted"){
      if(window.toast)toast("尚未允許通知");
      return;
    }
    const sent=await notify("COLA GO 測試提醒","如果你看到這則通知，代表這台裝置的系統通知路徑可以正常顯示。","plate-test-"+Date.now());
    if(window.toast)toast(sent?"測試提醒已送出":"這台裝置目前無法顯示測試提醒");
  };

  const list=$p("#plateWatchList");
  if(list)list.onclick=async e=>{
    const btn=e.target.closest("[data-plate-action]");
    if(!btn)return;
    const card=btn.closest("[data-plate-id]"),id=card?.dataset.plateId;
    if(!id)return;
    const rows=loadRows(),row=rows.find(x=>x.id===id);
    if(!row)return;
    const action=btn.dataset.plateAction;
    if(action==="matches"){
      const target=watchNumber(row.plate)||row.plate;
      announcementQuery=target;
      announcementFilter="all";
      const input=$p("#plateSearchInput");if(input)input.value=target;
      const panel=$p(".plate-announcement-panel");if(panel&&panel.tagName==="DETAILS")panel.open=true;
      renderAnnouncements();
      renderPlateSearchResult(target);
      requestAnimationFrame(()=>($p("#plateSearchResultPanel")||panel)?.scrollIntoView({behavior:"smooth",block:"start"}));
      return;
    }
    if(action==="remove"){if(loadPrimaryPlate()===row.plate)savePrimaryPlate("");saveRows(rows.filter(x=>x.id!==id));renderWatchList();renderAnnouncements();return}
    if(action==="primary"){savePrimaryPlate(row.plate);renderWatchList();requestAnimationFrame(()=>$p("#platePrimaryTarget")?.scrollIntoView({behavior:"smooth",block:"start"}));if(window.toast)toast(row.plate+" 已設為主攻");return}
    if(action==="official"){await openOfficialBidFor(row.plate);return}
    if(action==="history"){await openPlateHistoryFor(row.plate);return}
    if(action==="copy"){
      try{
        await navigator.clipboard.writeText(row.plate);
        if(window.toast)toast(row.plate+" 已複製");
      }catch{
        prompt("請複製車牌號碼",row.plate);
      }
      return;
    }
    if(action==="detail"){
      const match=bestOfficialMatch(row.plate);
      if(match)openPlateDetail(match);
      return;
    }
    if(action==="budget"){editWatchBudget(row);return}
    if(action==="price"){editWatchPrice(row);return}
  };


  const primaryTarget=$p("#platePrimaryTarget");
  if(primaryTarget)primaryTarget.onclick=e=>{
    const btn=e.target.closest("[data-plate-primary-action]");
    if(!btn)return;
    const primary=loadPrimaryPlate(),row=loadRows().find(x=>x.plate===primary);
    const action=btn.dataset.platePrimaryAction;
    if(action==="clear"){savePrimaryPlate("");renderWatchList();if(window.toast)toast("已取消主攻號碼");return}
    if(action==="budget"&&row){editWatchBudget(row);return}
    if(action==="price"&&row){editWatchPrice(row);return}
    if(action==="summary"&&row){
      const text=watchSummaryText([row]);
      navigator.clipboard?.writeText(text).then(()=>{if(window.toast)toast("主攻摘要已複製")}).catch(()=>prompt("請複製主攻摘要",text));
      return;
    }
    if(action==="official"){openOfficialBidFor(row?.plate||loadPrimaryPlate());return}
    if(action==="history"){openPlateHistoryFor(row?.plate||loadPrimaryPlate());return}
    if(action==="detail"&&row){const match=bestOfficialMatch(row.plate);if(match)openPlateDetail(match)}
  };

  const finalDock=$p("#plateFinalDock");
  if(finalDock)finalDock.onclick=e=>{
    const btn=e.target.closest("[data-plate-dock-action]");
    if(!btn)return;
    const primary=loadPrimaryPlate(),row=loadRows().find(x=>x.plate===primary);
    if(!row)return;
    const action=btn.dataset.plateDockAction;
    if(action==="top"){$p("#platePrimaryTarget")?.scrollIntoView({behavior:"smooth",block:"start"});return}
    if(action==="price"){editWatchPrice(row);return}
    if(action==="official"){openOfficialBidFor(row.plate)}
  };

  const searchResult=$p("#plateSearchResult");
  if(searchResult)searchResult.onclick=e=>{
    const btn=e.target.closest("[data-plate-search-action]");
    if(!btn)return;
    const action=btn.dataset.plateSearchAction,value=normalize(btn.dataset.value||announcementQuery);
    if(action==="watch"){if(value){upsertWatch(value,0,0,bestOfficialMatch(value)?.endAt||"");if(window.toast)toast((watchNumber(value)||value)+" 已開始全台追蹤")}return}
    if(action==="official-exact"){openOfficialBidFor(value);return}
    if(action==="bid"){openOfficialBidFor(value);return}
    if(action==="pick"){window.open(official.pick,"_blank","noopener")}
  };

  const checklist=$p("#plateChecklist");
  if(checklist)checklist.onclick=e=>{
    const btn=e.target.closest("[data-plate-check-toggle]");
    if(!btn)return;
    const id=btn.dataset.plateCheckToggle,state=loadChecklist();
    state[id]=!state[id];
    savePlateJson(CHECKLIST_KEY,state);
    renderChecklist();
  };
  const resetChecklist=$p("#plateChecklistReset");
  if(resetChecklist)resetChecklist.onclick=()=>{
    savePlateJson(CHECKLIST_KEY,{});
    renderChecklist();
    if(window.toast)toast("領牌進度已重設");
  };


  const officeSearch=$p("#plateOfficeSearchBtn"),officeSearchInput=$p("#plateOfficeSearchInput");
  if(officeSearch)officeSearch.onclick=()=>{
    officeQuery=officeSearchInput?.value||"";
    renderOfficeDirectory();
  };
  if(officeSearchInput)officeSearchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();officeSearch?.click()}});
  const officeList=$p("#plateOfficeList");
  if(officeList)officeList.onclick=async e=>{
    const btn=e.target.closest("[data-plate-office-action]");
    if(!btn)return;
    const action=btn.dataset.plateOfficeAction,value=btn.dataset.value||"";
    if(action==="call"&&value){
      const phone=value.replace(/[^0-9+]/g,"");
      if(phone)window.location.href="tel:"+phone;
      return;
    }
    if(action==="copy"&&value){
      try{
        await navigator.clipboard.writeText(value);
        if(window.toast)window.toast("地址已複製");
      }catch{
        prompt("請複製地址",value);
      }
    }
  };

  const announcementList=$p("#plateAnnouncementList");
  if(announcementList)announcementList.onclick=e=>{
    const btn=e.target.closest("[data-plate-announcement-action]");
    if(!btn)return;
    const action=btn.dataset.plateAnnouncementAction;
    if(action==="official"){window.open(official.bid,"_blank","noopener");return}
    if(action==="detail"){
      const row=(announcementData.items||[]).find(x=>x.id===btn.dataset.plateId);
      if(row)openPlateDetail(row);
      return;
    }
    if(action==="watch"){
      const value=normalize(btn.dataset.plateValue),end=btn.dataset.plateEnd||"";
      if(value){upsertWatch(value,0,0,end);if(window.toast)toast((watchNumber(value)||value)+" 已開始全台追蹤")}
    }
  };
  const dialog=$p("#plateDetailDialog");
  $p("#plateDetailClose")?.addEventListener("click",()=>dialog?.close());
  dialog?.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
  $p("#plateDetailBid")?.addEventListener("click",()=>window.open(official.bid,"_blank","noopener"));
  $p("#plateDetailWatch")?.addEventListener("click",e=>{
    const value=normalize(e.currentTarget.dataset.value),end=e.currentTarget.dataset.end||"";
    if(value){upsertWatch(value,0,0,end);e.currentTarget.textContent="已在追蹤";if(window.toast)toast((watchNumber(value)||value)+" 已開始全台追蹤")}
  });

  const last=localStorage.getItem("cola-go-last-plate-search");
  if(last&&searchInput)searchInput.value=last;
  setInterval(()=>{checkDeadlines();checkAnnouncementAlerts();renderAnnouncements()},10000);
  setInterval(()=>{if(document.visibilityState==="visible"&&$p('[data-view="plate"].active'))updatePlateCountdowns()},1000);
  setInterval(()=>{if(document.visibilityState==="visible")loadAnnouncements()},600000);
  setInterval(()=>{if(document.visibilityState==="visible"&&Date.now()-officeFetchAt>1800000)loadOffices()},1800000);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState!=="visible")return;
    updateNotificationCenter();
    if(Date.now()-announcementFetchAt>300000)loadAnnouncements();
    if(Date.now()-officeFetchAt>1800000)loadOffices();
  });
  checkDeadlines();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();