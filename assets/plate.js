(()=>{
"use strict";
const STORE_KEY="cola-go-plate-watch-v1";
const ALERT_KEY="cola-go-plate-alerts-v2";
const ANNOUNCEMENT_CACHE_KEY="cola-go-plate-announcements-v1";
const ANNOUNCEMENT_SNAPSHOT_KEY="cola-go-plate-announcement-snapshot-v1";
const CHANGE_LOG_KEY="cola-go-plate-change-log-v1";
const CHECKLIST_KEY="cola-go-plate-checklist-v1";
const ANNOUNCEMENT_URL="./data/plates/announcements.json";
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
let announcementFilter="all";
let announcementQuery="";
let announcementFetchAt=0;

function loadRows(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveRows(rows){try{localStorage.setItem(STORE_KEY,JSON.stringify(rows))}catch{}}
function loadAlerts(){try{return JSON.parse(localStorage.getItem(ALERT_KEY)||"{}")||{}}catch{return{}}}
function saveAlerts(x){try{localStorage.setItem(ALERT_KEY,JSON.stringify(x))}catch{}}
function loadAnnouncementCache(){try{return JSON.parse(localStorage.getItem(ANNOUNCEMENT_CACHE_KEY)||"null")}catch{return null}}
function saveAnnouncementCache(x){try{localStorage.setItem(ANNOUNCEMENT_CACHE_KEY,JSON.stringify(x))}catch{}}
function loadPlateJson(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||"null");return x??fallback}catch{return fallback}}
function savePlateJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function notify(title,body,tag="cola-go-plate"){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  try{new Notification(title,{body,icon:"./assets/logo.svg",tag})}catch{}
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
  const manualLabel=$p("#plateCurrentPrice")?.closest("label")?.querySelector("small");
  if(manualLabel)manualLabel.textContent="手動記錄目前價格（可選）";
  $(".plate-guide-body article").forEach(article=>{
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
  body.innerHTML=
    '<div class="plate-detail-status"><span class="plate-auction-state '+status+'">'+escPlate(auctionLabel(status))+'</span><span>'+escPlate(row.office||"監理單位")+'</span></div>'+
    '<div class="plate-detail-grid">'+
      '<div><small>號牌類別</small><b>'+escPlate(row.category||"未提供")+'</b></div>'+
      '<div><small>監理單位</small><b>'+escPlate(row.office||"未提供")+'</b></div>'+
      '<div><small>起標時間</small><b>'+escPlate(fmtTime(row.startAt))+'</b></div>'+
      '<div><small>公告決標</small><b>'+escPlate(fmtTime(row.endAt))+'</b></div>'+
      '<div><small>轉帳截止</small><b>'+escPlate(fmtTime(row.transferDeadline))+'</b></div>'+
      '<div><small>資料來源</small><b>交通部公路局</b></div>'+
    '</div>'+
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
  if(existing){existing.budget=budget||existing.budget||0;existing.current=current||existing.current||0;existing.endTime=endTime||existing.endTime||""}
  else rows.unshift({id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),plate,budget,current,endTime,createdAt:new Date().toISOString()});
  saveRows(rows);
  renderWatchList();
  renderAnnouncements();
  checkAnnouncementAlerts();
  return true;
}
function renderWatchList(){
  const root=$p("#plateWatchList"),count=$p("#plateWatchCount");
  if(!root)return;
  const rows=loadRows();
  if(count)count.textContent=String(rows.length);
  if(!rows.length){root.innerHTML='<div class="plate-watch-empty"><b>還沒有候選號碼</b><br>把你喜歡的 1117、8888 或完整車牌先加進來。COLA GO 會一起比對官方標牌公告。</div>';return}
  root.innerHTML=rows.map(row=>{
    const s=budgetState(row),budget=Number(row.budget)||0,current=Number(row.current)||0,remain=budget&&current?budget-current:null;
    const match=bestOfficialMatch(row.plate),officialState=match?auctionState(match):"";
    const officialLine=match?'<div class="plate-watch-official">官方公告：'+escPlate(auctionLabel(officialState))+'・'+escPlate(match.office||"監理單位")+'</div>':"";
    return '<article class="plate-watch-card" data-plate-id="'+escPlate(row.id)+'">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(row.plate)+'</div><small class="meta">存在此裝置</small>'+officialLine+'</div><span class="plate-budget-state '+s.cls+'">'+escPlate(s.label)+'</span></div>'+
      '<div class="plate-watch-meta">'+
        '<div><small>最高預算</small><b>'+moneyPlate(budget)+'</b></div>'+
        '<div><small>手動記錄價</small><b>'+moneyPlate(current)+'</b></div>'+
        '<div><small>距離預算</small><b>'+(remain===null?"—":remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))+'</b></div>'+
        '<div><small>結標時間</small><b>'+escPlate(fmtTime(row.endTime||match?.endAt))+'</b></div>'+
      '</div>'+
      '<div class="plate-watch-actions"><button data-plate-action="price" type="button">更新目前價</button><button data-plate-action="official" type="button">官方即時競標</button><button class="danger" data-plate-action="remove" type="button">移除</button></div>'+
    '</article>'
  }).join("");
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
      '<div class="plate-announcement-actions">'+addButton+'<button data-plate-announcement-action="detail" data-plate-id="'+escPlate(row.id)+'" type="button">查看詳情</button>'+(status==="live"?'<button class="official" data-plate-announcement-action="official" type="button">正式競標</button>':"")+'</div>'+
    '</article>'
  }).join("");
  renderWatchList();
}
function updateNotifyText(){
  const el=$p("#plateNotifyState");
  if(!el)return;
  if(!("Notification" in window)){el.textContent="這個瀏覽器不支援網站通知；可先使用 LINE 官方帳號與頁面內追蹤。";return}
  if(Notification.permission==="granted")el.textContent="瀏覽器通知已開啟。頁面開啟期間會比對官方標牌公告，並提醒候選號碼進入競標、接近起標／結標時間。背景 Web Push 與 LINE 個人化通知接續串接。";
  else if(Notification.permission==="denied")el.textContent="瀏覽器通知目前被封鎖；請到瀏覽器網站設定重新允許。";
  else el.textContent="可先開啟瀏覽器提醒；加入 COLA GO LINE 後，後續可再綁定個人化競標推播。";
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
  renderChecklist();
  renderAnnouncementChanges();
  renderWatchList();updateNotifyText();loadAnnouncements();

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
    if(p==="granted")notify("COLA GO 車牌提醒","通知已開啟。候選車牌出現在官方公告或接近起標／結標時間時，頁面開啟期間會提醒你。","notify-ready");
  };

  const list=$p("#plateWatchList");
  if(list)list.onclick=e=>{
    const btn=e.target.closest("[data-plate-action]");
    if(!btn)return;
    const card=btn.closest("[data-plate-id]"),id=card?.dataset.plateId;
    if(!id)return;
    const rows=loadRows(),row=rows.find(x=>x.id===id);
    if(!row)return;
    const action=btn.dataset.plateAction;
    if(action==="remove"){saveRows(rows.filter(x=>x.id!==id));renderWatchList();renderAnnouncements();return}
    if(action==="official"){window.open(official.bid,"_blank","noopener");return}
    if(action==="price"){
      const raw=prompt("輸入 "+row.plate+" 在官方頁看到的目前價格",row.current||"");
      if(raw===null)return;
      const value=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
      row.current=value;saveRows(rows);renderWatchList();
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
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-announcementFetchAt>300000)loadAnnouncements()});
  checkDeadlines();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();