(()=>{
"use strict";
const STORE_KEY="cola-go-plate-watch-v1";
const ALERT_KEY="cola-go-plate-alerts-v2";
const ANNOUNCEMENT_CACHE_KEY="cola-go-plate-announcements-v1";
const ANNOUNCEMENT_SNAPSHOT_KEY="cola-go-plate-announcement-snapshot-v1";
const CHANGE_LOG_KEY="cola-go-plate-change-log-v1";
const CHECKLIST_KEY="cola-go-plate-checklist-v1";
const OFFICE_CACHE_KEY="cola-go-plate-offices-v1";
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

function loadRows(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveRows(rows){try{localStorage.setItem(STORE_KEY,JSON.stringify(rows))}catch{}}
function loadAlerts(){try{return JSON.parse(localStorage.getItem(ALERT_KEY)||"{}")||{}}catch{return{}}}
function saveAlerts(x){try{localStorage.setItem(ALERT_KEY,JSON.stringify(x))}catch{}}
function loadAnnouncementCache(){try{return JSON.parse(localStorage.getItem(ANNOUNCEMENT_CACHE_KEY)||"null")}catch{return null}}
function saveAnnouncementCache(x){try{localStorage.setItem(ANNOUNCEMENT_CACHE_KEY,JSON.stringify(x))}catch{}}
function loadOfficeCache(){try{return JSON.parse(localStorage.getItem(OFFICE_CACHE_KEY)||"null")}catch{return null}}
function saveOfficeCache(x){try{localStorage.setItem(OFFICE_CACHE_KEY,JSON.stringify(x))}catch{}}
function loadPlateJson(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return x??fallback}catch{return fallback}}
function savePlateJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
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
      '<div class="plate-panel-head"><div><span class="mini-label">COLA GO CHECK</span><h2>站內查詢判讀</h2></div><span class="plate-trust" id="plateSearchResultState">站內判讀</span></div>'+
      '<div id="plateSearchResult"></div>'+
      '<p class="plate-helper">COLA GO 會先比對已同步的官方標牌公告；一般可選號碼仍需到監理服務網完成監理單位、車種等條件與驗證碼查詢，本站不會把未驗證資料標成「可選」。</p>'+
      '</section>');
  }
  const announcementPanel=$p(".plate-announcement-panel");
  if(announcementPanel&&!$p("#plateChangePanel")){
    announcementPanel.insertAdjacentHTML("afterend",
      '<section class="plate-panel" id="plateChangePanel">'+
      '<div class="plate-panel-head"><div><span class="mini-label">WHAT CHANGED</span><h2>官方公告最新變化</h2></div><span class="plate-count" id="plateChangeCount">0</span></div>'+
      '<p class="plate-panel-intro">由這台裝置比對每次成功取得的官方公告快照，標出新公告、開始競標、決標時間或轉帳期限變動與候選命中。這不是逐筆出價即時行情。</p>'+
      '<div class="plate-watch-list" id="plateChangeList"></div>'+
      '</section>');
  }
  const watchPanel=$p(".plate-watch-panel");
  if(watchPanel&&!$p("#plateChecklistPanel")){
    watchPanel.insertAdjacentHTML("afterend",
      '<section class="plate-panel" id="plateChecklistPanel">'+
      '<div class="plate-panel-head"><div><span class="mini-label">PLATE CHECKLIST</span><h2>領牌進度 Checklist</h2></div><span class="plate-count" id="plateChecklistProgress">0 / '+CHECKLIST_STEPS.length+'</span></div>'+
      '<p class="plate-panel-intro">照自己的實際進度勾選，資料只存在這台裝置。正式資格、付款與領牌仍以官方及交付端實際安排為準。</p>'+
      '<div class="plate-watch-list" id="plateChecklist"></div>'+
      '<div class="plate-watch-actions"><button id="plateChecklistReset" type="button">全部重設</button></div>'+
      '</section>');
  }
  const checklistPanel=$p("#plateChecklistPanel");
  if(checklistPanel&&!$p("#plateOfficePanel")){
    checklistPanel.insertAdjacentHTML("afterend",
      '<section class="plate-panel" id="plateOfficePanel">'+
      '<div class="plate-panel-head"><div><span class="mini-label">MOTOR VEHICLES OFFICE</span><h2>監理站資訊</h2></div><span class="plate-source-state" id="plateOfficeSourceState">讀取中</span></div>'+
      '<div class="plate-search-row"><input autocomplete="off" id="plateOfficeSearchInput" placeholder="搜尋監理站、縣市、行政區"/><button id="plateOfficeSearchBtn" type="button"><span>搜尋</span></button></div>'+
      '<div class="plate-announcement-meta"><span id="plateOfficeUpdated">等待官方資料</span><span id="plateOfficeCount">—</span></div>'+
      '<div class="plate-watch-list" id="plateOfficeList"><div class="plate-watch-empty">正在讀取交通部公路局監理所及轄站資料。</div></div>'+
      '<p class="plate-helper">地址、電話與管轄區域來自交通部公路局開放資料；實際辦理車牌業務前仍可先電話確認該站可受理項目。</p>'+
      '</section>');
  }
  const manualLabel=$p("#plateCurrentPrice")?.closest("label")?.querySelector("small");
  if(manualLabel)manualLabel.textContent="手動記錄目前價格（可選）";
  $$p(".plate-guide-body article").forEach(article=>{
    const title=article.querySelector("b")?.textContent||"";
    const p=article.querySelector("p");
    if(!p)return;
    if(title.includes("最後幾分鐘"))p.textContent="官方規則：截止前 3 分鐘內若有兩人以上繼續出高價，該號牌會自動延長 3 分鐘，最多延長 10 次；仍以監理服務網當下時間為準。";
    if(title.includes("Tesla 車主"))p.textContent="自行競標得標並完成繳費後，就把牌號與證明盡快提供 Tesla 交付顧問；實際送件與領牌時間依交付顧問安排。";
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
  let rows=items.slice();
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
function renderPlateSearchResult(value){
  const panel=$p("#plateSearchResultPanel"),root=$p("#plateSearchResult"),state=$p("#plateSearchResultState");
  if(!panel||!root)return;
  const q=normalize(value);
  if(!q){panel.hidden=true;root.innerHTML="";return}
  panel.hidden=false;
  const parts=plateParts(q);
  if(!parts){
    if(state)state.textContent="請檢查格式";
    root.innerHTML='<div class="plate-watch-empty"><b>無法判讀這個號碼</b><br>可輸入 1117、8888 或 CES-8888 這類數字／完整車牌格式。</div>';
    return;
  }
  const rows=matchingAnnouncements(q).slice().sort((a,b)=>{
    const p={live:0,upcoming:1,ended:2};
    return p[auctionState(a)]-p[auctionState(b)]||Date.parse(a.startAt||0)-Date.parse(b.startAt||0);
  });
  if(state)state.textContent=rows.length?"命中官方公告":"未命中公告";
  if(rows.length){
    root.innerHTML=rows.slice(0,8).map(row=>{
      const status=auctionState(row),range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
      return '<article class="plate-watch-card">'+
        '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(range)+'</div><small class="meta">'+escPlate(row.office||"監理單位")+'・'+escPlate(row.category||"")+'</small></div><span class="plate-auction-state '+status+'">'+escPlate(auctionLabel(status))+'</span></div>'+
        '<div class="plate-watch-meta"><div><small>起標</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div><div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div></div>'+
      '</article>';
    }).join("")+
    '<div class="plate-watch-actions"><button data-plate-search-action="watch" data-value="'+escPlate(q)+'" type="button">加入候選</button>'+
    (rows.some(x=>auctionState(x)==="live")?'<button data-plate-search-action="bid" type="button">正式競標</button>':"")+'</div>';
    return;
  }
  root.innerHTML='<div class="plate-watch-empty"><b>目前公開標牌公告沒有找到 '+escPlate(q)+'</b><br>這只代表「未命中目前已同步的標牌公告」，不代表這個號碼現在一定可選或不可選。一般可選號碼的官方即時查詢還需要選擇監理單位、車種等條件並輸入驗證碼。</div>'+
    '<div class="plate-watch-actions"><button data-plate-search-action="watch" data-value="'+escPlate(q)+'" type="button">先加入候選</button><button data-plate-search-action="pick" type="button">官方即時可選確認</button></div>';
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
    watch.textContent=exact&&loadRows().some(x=>x.plate===exact)?"已在候選":"加入候選";
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
  return (announcementData.items||[]).filter(x=>rangeContains(x,value));
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
  plate=normalize(plate);
  if(!plate)return false;
  const rows=loadRows();
  const existing=rows.find(x=>x.plate===plate);
  const priceUpdatedAt=current>0?new Date().toISOString():"";
  if(existing){existing.budget=budget||existing.budget||0;if(current>0){existing.current=current;existing.priceUpdatedAt=priceUpdatedAt}existing.endTime=endTime||existing.endTime||""}
  else rows.unshift({id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),plate,budget,current,endTime,priceUpdatedAt,createdAt:new Date().toISOString()});
  saveRows(rows);
  renderWatchList();
  renderAnnouncements();
  checkAnnouncementAlerts();
  return true;
}

function ensurePlateWatchTools(){
  const panel=$p(".plate-watch-panel");

  $p("[data-plate-watch-filter]").forEach(btn=>btn.onclick=()=>{
    watchFilter=btn.dataset.plateWatchFilter||"all";
    renderWatchList();
  });
  const watchSortSelect=$p("#plateWatchSort");
  if(watchSortSelect)watchSortSelect.onchange=()=>{
    watchSort=watchSortSelect.value||"priority";
    renderWatchList();
  };
  const copyWatchList=$p("#plateWatchCopyList");
  if(copyWatchList)copyWatchList.onclick=async()=>{
    const text=visibleWatchRows().map(row=>row.plate).join("\n");
    if(!text){if(window.toast)toast("目前沒有可複製的候選");return}
    try{
      await navigator.clipboard.writeText(text);
      if(window.toast)toast("候選號碼清單已複製");
    }catch{
      prompt("請複製候選號碼",text);
    }
  };

  const backupWatch=$p("#plateWatchBackup");
  if(backupWatch)backupWatch.onclick=async()=>{
    const payload=watchBackupPayload();
    try{
      await navigator.clipboard.writeText(payload);
      if(window.toast)toast("候選備份已複製");
    }catch{
      prompt("請複製這段候選備份",payload);
    }
  };
  const restoreWatch=$p("#plateWatchRestore");
  if(restoreWatch)restoreWatch.onclick=()=>{
    const raw=prompt("貼上 COLA GO 候選備份");
    if(raw===null)return;
    const result=restoreWatchPayload(raw);
    if(window.toast)toast(result.message);else alert(result.message);
  };

  const list=$p("#plateWatchList");
  if(!panel||!list||$p("#plateWatchDashboard"))return;
  list.insertAdjacentHTML("beforebegin",
    '<div id="plateWatchDashboard">'+
      '<div class="plate-announcement-summary">'+
        '<div><b id="plateWatchLiveCount">0</b><small>候選競標中</small></div>'+
        '<div><b id="plateWatchUpcomingCount">0</b><small>候選即將開標</small></div>'+
        '<div><b id="plateWatchNoMatchCount">0</b><small>暫無公告</small></div>'+
      '</div>'+
      '<div class="plate-watch-actions">'+
        '<button class="active" data-plate-watch-filter="all" type="button">全部候選</button>'+
        '<button data-plate-watch-filter="live" type="button">競標中</button>'+
        '<button data-plate-watch-filter="upcoming" type="button">即將開標</button>'+
        '<button data-plate-watch-filter="nomatch" type="button">暫無公告</button>'+
      '</div>'+
      '<div class="plate-watch-meta">'+
        '<label><small>排序</small><select id="plateWatchSort"><option value="priority">競標優先</option><option value="budget">預算風險</option><option value="recent">最近加入</option><option value="plate">號碼順序</option></select></label>'+
      '</div>'+
      '<div class="plate-watch-actions">'+
        '<button id="plateWatchCopyList" type="button">複製號碼清單</button>'+
        '<button id="plateWatchBackup" type="button">複製候選備份</button>'+
        '<button id="plateWatchRestore" type="button">貼上還原</button>'+
      '</div>'+
      '<p class="plate-helper">候選資料仍只存在你的裝置；可把備份文字存到自己的備忘錄，需要時再貼回 COLA GO。</p>'+
    '</div>'
  );
}
function renderWatchSummary(){
  ensurePlateWatchTools();
  const rows=loadRows();
  let live=0,upcoming=0,noMatch=0;
  rows.forEach(row=>{
    const match=bestOfficialMatch(row.plate);
    if(!match){noMatch++;return}
    const status=auctionState(match);
    if(status==="live")live++;
    else if(status==="upcoming")upcoming++;
    else noMatch++;
  });
  if($p("#plateWatchLiveCount"))$p("#plateWatchLiveCount").textContent=String(live);
  if($p("#plateWatchUpcomingCount"))$p("#plateWatchUpcomingCount").textContent=String(upcoming);
  if($p("#plateWatchNoMatchCount"))$p("#plateWatchNoMatchCount").textContent=String(noMatch);
}
function watchBackupPayload(){
  return JSON.stringify({schema:1,exportedAt:new Date().toISOString(),items:loadRows().map(row=>({
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
  saveRows([...merged.values()]);
  renderWatchList();
  renderAnnouncements();
  checkAnnouncementAlerts();
  return {ok:true,message:"已還原 "+rows.length+" 筆候選"};
}

function watchOfficialState(row){
  const match=bestOfficialMatch(row.plate);
  return match?auctionState(match):"nomatch";
}
function watchPriorityRank(row){
  const status=watchOfficialState(row);
  const statusRank={live:0,upcoming:1,ended:2,nomatch:3}[status]??4;
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  const risk=budget&&current?current/budget:0;
  return {statusRank,risk};
}
function visibleWatchRows(){
  let rows=loadRows();
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
    if(ar.statusRank!==br.statusRank)return ar.statusRank-br.statusRank;
    return br.risk-ar.risk||Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0);
  });
  return rows;
}
function renderWatchList(){
  const root=$p("#plateWatchList"),count=$p("#plateWatchCount");
  if(!root)return;
  ensurePlateWatchTools();
  const allRows=loadRows();
  const rows=visibleWatchRows();
  if(count)count.textContent=String(allRows.length);
  $p("[data-plate-watch-filter]").forEach(btn=>btn.classList.toggle("active",btn.dataset.plateWatchFilter===watchFilter));
  const sort=$p("#plateWatchSort");if(sort)sort.value=watchSort;
  if(!allRows.length){root.innerHTML='<div class="plate-watch-empty"><b>還沒有候選號碼</b><br>把你喜歡的 1117、8888 或完整車牌先加進來。COLA GO 會一起比對官方標牌公告。</div>';renderWatchSummary();return}
  if(!rows.length){root.innerHTML='<div class="plate-watch-empty"><b>目前這個篩選沒有候選</b><br>可切回「全部候選」查看完整清單。</div>';renderWatchSummary();return}
  root.innerHTML=rows.map(row=>{
    const s=budgetState(row),budget=Number(row.budget)||0,current=Number(row.current)||0,remain=budget&&current?budget-current:null;
    const match=bestOfficialMatch(row.plate),officialState=match?auctionState(match):"";
    const officialLine=match?'<div class="plate-watch-official">官方同步：'+escPlate(auctionLabel(officialState))+'・'+escPlate(match.office||"監理單位")+'</div>':"";
    const priceLine=current?'<div class="plate-detail-note"><b>價格來源：手動記錄</b><br>'+escPlate(row.priceUpdatedAt?fmtTime(row.priceUpdatedAt)+" 更新":"先前儲存的手動價格")+'；正式出價前請回官方頁確認最新價格與出價次數。</div>':'<div class="plate-detail-note"><b>即時價格：需官方確認</b><br>COLA GO 目前沒有官方逐筆出價資料，不會自行猜測目前價格。</div>';
    return '<article class="plate-watch-card" data-plate-id="'+escPlate(row.id)+'">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(row.plate)+'</div><small class="meta">存在此裝置</small>'+officialLine+'</div><span class="plate-budget-state '+s.cls+'">'+escPlate(s.label)+'</span></div>'+
      '<div class="plate-watch-meta">'+
        '<div><small>最高預算</small><b>'+moneyPlate(budget)+'</b></div>'+
        '<div><small>手動記錄價</small><b>'+moneyPlate(current)+'</b></div>'+
        '<div><small>距離預算</small><b>'+(remain===null?"—":remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))+'</b></div>'+
        '<div><small>結標時間</small><b>'+escPlate(fmtTime(row.endTime||match?.endAt))+'</b></div>'+
      '</div>'+priceLine+
      '<div class="plate-watch-actions"><button data-plate-action="copy" type="button">複製號碼</button><button data-plate-action="budget" type="button">改預算</button><button data-plate-action="price" type="button">更新手動價</button>'+(match?'<button data-plate-action="detail" type="button">公告詳情</button>':'')+'<button data-plate-action="history" type="button">官方歷史</button><button data-plate-action="official" type="button">官方即時競標</button><button class="danger" data-plate-action="remove" type="button">移除</button></div>'+
    '</article>'
  }).join("");
  renderWatchSummary();
}
function announcementMatchesWatch(row){
  return loadRows().filter(w=>rangeContains(row,w.plate));
}
function renderAnnouncements(){
  const root=$p("#plateAnnouncementList");
  if(!root)return;
  const items=Array.isArray(announcementData.items)?announcementData.items:[];
  const now=Date.now(),watches=loadRows();
  const live=items.filter(x=>auctionState(x,now)==="live").length;
  const upcoming=items.filter(x=>auctionState(x,now)==="upcoming").length;
  const matched=items.filter(x=>watches.some(w=>rangeContains(x,w.plate))).length;
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
    const countdown=status==="upcoming"&&Number.isFinite(start)?"距起標 "+fmtCountdown(start-now):status==="live"&&Number.isFinite(end)?"距公告決標 "+fmtCountdown(end-now):"";
    const matches=announcementMatchesWatch(row);
    const matchMarkup=matches.length?'<div class="plate-watch-match">'+matches.map(w=>'<span>候選 '+escPlate(w.plate)+'</span>').join("")+'</div>':"";
    const range=row.startNumber===row.endNumber?row.startNumber:row.startNumber+" ～ "+row.endNumber;
    const addButton=queryPlate&&rangeContains(row,queryPlate)&&!loadRows().some(w=>w.plate===queryPlate)?'<button data-plate-announcement-action="watch" data-plate-value="'+escPlate(queryPlate)+'" data-plate-end="'+escPlate(row.endAt||"")+'" type="button">追蹤 '+escPlate(queryPlate)+'</button>':"";
    return '<article class="plate-announcement-card">'+
      '<div class="plate-announcement-top"><div><div class="plate-announcement-range">'+escPlate(range)+'</div><div class="plate-announcement-office">'+escPlate(row.office||"")+'・'+escPlate(row.category||"")+'</div></div><span class="plate-auction-state '+status+'">'+auctionLabel(status)+'</span></div>'+
      '<div class="plate-announcement-timing"><div><small>起標</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div><div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div></div>'+
      (countdown?'<div class="plate-countdown">'+escPlate(countdown)+'</div>':"")+matchMarkup+
      (status==="live"?'<div class="plate-detail-note"><b>官方同步：</b>競標狀態、起標／公告決標時間<br><b>需官方即時確認：</b>目前出價、出價次數、最後延長後時間</div>':"")+
      '<div class="plate-announcement-actions">'+addButton+'<button data-plate-announcement-action="detail" data-plate-id="'+escPlate(row.id)+'" type="button">查看詳情</button>'+(status==="live"?'<button class="official" data-plate-announcement-action="official" type="button">正式競標</button>':"")+'</div>'+
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
    '<div class="plate-detail-note" id="plateNotifyDetail">正在檢查這台裝置的通知能力。</div>'
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
  if(line)line.textContent="OA 可加入・個人化未綁定";
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
function checkDeadlines(){
  const now=Date.now(),alerts=loadAlerts();
  loadRows().forEach(row=>{
    if(!row.endTime)return;
    const ms=new Date(row.endTime).getTime()-now;
    if(!Number.isFinite(ms)||ms<=0)return;
    [[15,"15 分鐘"],[5,"5 分鐘"],[1,"1 分鐘"]].forEach(([m,label])=>{
      const key=row.id+"-manual-"+m;
      if(ms<=m*60000&&!alerts[key]){
        alerts[key]=Date.now();
        notify("COLA GO 車牌提醒",row.plate+" 距離你設定的結標時間約剩 "+label+"。請回官方頁確認最新價格與決標時間。",key);
      }
    });
  });
  saveAlerts(alerts);
}
function checkAnnouncementAlerts(){
  if(announcementData.stale||announcementData.error)return;
  const now=Date.now(),alerts=loadAlerts(),watches=loadRows(),items=announcementData.items||[];
  watches.forEach(w=>{
    items.filter(row=>rangeContains(row,w.plate)).forEach(row=>{
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
        [[15,"15 分鐘"],[5,"5 分鐘"],[1,"1 分鐘"]].forEach(([m,label])=>{
          const key=base+"-end-"+m,ms=end-now;
          if(ms>0&&ms<=m*60000&&!alerts[key]){
            alerts[key]=Date.now();
            notify("COLA GO 車牌競標提醒",w.plate+" 距公告決標約剩 "+label+"。最後階段可能因官方規則延長，請以監理服務網最新時間為準。",key);
          }
        });
      }
    });
  });
  saveAlerts(alerts);
}
async function loadAnnouncements(){
  announcementFetchAt=Date.now();
  try{
    const res=await fetch(ANNOUNCEMENT_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const data=await res.json();
    if(!data||!Array.isArray(data.items))throw new Error("invalid announcements");
    announcementData={...data,stale:false,error:""};
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
  renderWatchList();updateNotifyText();updateNotificationCenter();loadAnnouncements();loadOffices();

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
    const plate=normalize($p("#plateCandidate")?.value);
    if(!plate){window.toast?toast("先輸入候選號碼"):alert("先輸入候選號碼");return}
    const budget=Math.max(0,Number($p("#plateBudget")?.value)||0);
    const current=Math.max(0,Number($p("#plateCurrentPrice")?.value)||0);
    const endTime=$p("#plateEndTime")?.value||bestOfficialMatch(plate)?.endAt||"";
    upsertWatch(plate,budget,current,endTime);
    if(current&&budget){
      if(current>budget)notify("COLA GO 車牌提醒",plate+" 目前價格已超過你設定的預算。","budget-"+plate);
      else if(current>=budget*.9)notify("COLA GO 車牌提醒",plate+" 已接近你設定的預算上限。","budget-"+plate);
    }
    ["#plateCandidate","#plateBudget","#plateCurrentPrice","#plateEndTime"].forEach(s=>{const el=$p(s);if(el)el.value=""});
  };

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
    if(action==="remove"){saveRows(rows.filter(x=>x.id!==id));renderWatchList();renderAnnouncements();return}
    if(action==="official"){window.open(official.bid,"_blank","noopener");return}
    if(action==="history"){window.open(official.history,"_blank","noopener");return}
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
    if(action==="budget"){
      const raw=prompt("輸入 "+row.plate+" 的最高預算",row.budget||"");
      if(raw===null)return;
      row.budget=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
      saveRows(rows);renderWatchList();
      return;
    }
    if(action==="price"){
      const raw=prompt("輸入 "+row.plate+" 在官方頁看到的目前價格",row.current||"");
      if(raw===null)return;
      const value=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
      row.current=value;row.priceUpdatedAt=value?new Date().toISOString():"";saveRows(rows);renderWatchList();
      if(value&&row.budget){
        if(value>row.budget)notify("COLA GO 車牌提醒",row.plate+" 目前價格 "+moneyPlate(value)+"，已超過你的預算 "+moneyPlate(row.budget)+"。","budget-"+row.id+"-over");
        else if(value>=row.budget*.9)notify("COLA GO 車牌提醒",row.plate+" 目前價格已接近你的預算上限。","budget-"+row.id+"-near");
      }
    }
  };


  const searchResult=$p("#plateSearchResult");
  if(searchResult)searchResult.onclick=e=>{
    const btn=e.target.closest("[data-plate-search-action]");
    if(!btn)return;
    const action=btn.dataset.plateSearchAction,value=normalize(btn.dataset.value||announcementQuery);
    if(action==="watch"){if(value){upsertWatch(value,0,0,bestOfficialMatch(value)?.endAt||"");if(window.toast)toast("已加入候選追蹤")}return}
    if(action==="bid"){window.open(official.bid,"_blank","noopener");return}
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
      if(value){upsertWatch(value,0,0,end);if(window.toast)toast("已加入候選追蹤")}
    }
  };
  const dialog=$p("#plateDetailDialog");
  $p("#plateDetailClose")?.addEventListener("click",()=>dialog?.close());
  dialog?.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
  $p("#plateDetailBid")?.addEventListener("click",()=>window.open(official.bid,"_blank","noopener"));
  $p("#plateDetailWatch")?.addEventListener("click",e=>{
    const value=normalize(e.currentTarget.dataset.value),end=e.currentTarget.dataset.end||"";
    if(value){upsertWatch(value,0,0,end);e.currentTarget.textContent="已在候選";if(window.toast)toast("已加入候選追蹤")}
  });

  const last=localStorage.getItem("cola-go-last-plate-search");
  if(last&&searchInput)searchInput.value=last;
  setInterval(()=>{checkDeadlines();checkAnnouncementAlerts();renderAnnouncements()},10000);
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