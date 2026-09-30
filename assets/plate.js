(()=>{
"use strict";
const STORE_KEY="cola-go-plate-watch-v1";
const ALERT_KEY="cola-go-plate-alerts-v2";
const ANNOUNCEMENT_CACHE_KEY="cola-go-plate-announcements-v1";
const ANNOUNCEMENT_URL="./data/plates/announcements.json";
const official={
  pick:"https://www.mvdis.gov.tw/m3-emv-plate/webpickno/queryPickNo",
  bid:"https://www.mvdis.gov.tw/m3-emv-plate/bid/queryBiding"
};
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
        '<div><small>目前價格</small><b>'+moneyPlate(current)+'</b></div>'+
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
    root.innerHTML='<div class="plate-watch-empty"><b>沒有符合的官方公告</b><br>若你找的是一般「可選號碼」，請使用上方「開啟官方可選號碼」。</div>';
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
      '<div class="plate-announcement-actions">'+addButton+'<button class="official" data-plate-announcement-action="official" type="button">官方即時競標</button></div>'+
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
  }catch(error){
    const cached=loadAnnouncementCache();
    if(cached&&Array.isArray(cached.items))announcementData={...cached,stale:true,error:""};
    else announcementData={status:"error",items:[],updatedAt:null,stale:false,error:String(error?.message||error)};
  }
  renderAnnouncements();
  checkAnnouncementAlerts();
}
function bind(){
  if(!$p('[data-view="plate"]'))return;
  renderWatchList();updateNotifyText();loadAnnouncements();

  const search=$p("#plateSearchBtn");
  if(search)search.onclick=()=>{
    announcementQuery=normalize($p("#plateSearchInput")?.value);
    if(announcementQuery)try{localStorage.setItem("cola-go-last-plate-search",announcementQuery)}catch{}
    renderAnnouncements();
    $p("#plateAnnouncementList")?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const searchInput=$p("#plateSearchInput");
  if(searchInput)searchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();search?.click()}});
  const clear=$p("#plateClearSearch");
  if(clear)clear.onclick=()=>{announcementQuery="";if(searchInput)searchInput.value="";renderAnnouncements()};

  $$p("[data-plate-filter]").forEach(btn=>btn.onclick=()=>{announcementFilter=btn.dataset.plateFilter||"all";renderAnnouncements()});

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

  const announcementList=$p("#plateAnnouncementList");
  if(announcementList)announcementList.onclick=e=>{
    const btn=e.target.closest("[data-plate-announcement-action]");
    if(!btn)return;
    if(btn.dataset.plateAnnouncementAction==="official"){window.open(official.bid,"_blank","noopener");return}
    if(btn.dataset.plateAnnouncementAction==="watch"){
      const value=normalize(btn.dataset.plateValue),end=btn.dataset.plateEnd||"";
      if(value){upsertWatch(value,0,0,end);if(window.toast)toast("已加入候選追蹤")}
    }
  };

  const last=localStorage.getItem("cola-go-last-plate-search");
  if(last&&searchInput)searchInput.value=last;
  setInterval(()=>{checkDeadlines();checkAnnouncementAlerts();renderAnnouncements()},10000);
  setInterval(()=>{if(document.visibilityState==="visible")loadAnnouncements()},600000);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-announcementFetchAt>300000)loadAnnouncements()});
  checkDeadlines();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();