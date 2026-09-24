const state={view:"home",charging:[],traffic:null,tunnel:null,parking:null,road:"all",highway:"1",direction:"south",installPrompt:null};
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),1800)}
function show(v,push=true){state.view=v;$$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$$(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===v));scrollTo({top:0,behavior:"instant"});if(push)history.replaceState(null,"","#"+v)}
function bindNav(){$$("[data-go]").forEach(el=>el.onclick=e=>{e.preventDefault();show(el.dataset.go)});addEventListener("hashchange",()=>show(location.hash.slice(1)||"home",false))}
async function getJSON(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error(url);return r.json()}
function formatTime(v){if(!v)return"等待資料";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false}).format(d)+" 更新"}
function avg(rows){const a=(rows||[]).map(x=>Number(x.speed)).filter(v=>v>0&&v<200);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):null}
function metricClass(v){return v>=80?"good":v>=50?"mid":"bad"}

async function load(){
  const r=await Promise.allSettled([getJSON("./data/charging.json"),getJSON("./data/traffic.json"),getJSON("./data/tunnel.json"),getJSON("./data/parking.json")]);
  if(r[0].status==="fulfilled")state.charging=r[0].value;
  if(r[1].status==="fulfilled")state.traffic=r[1].value;
  if(r[2].status==="fulfilled")state.tunnel=r[2].value;
  if(r[3].status==="fulfilled")state.parking=r[3].value;
  renderAll();
}
function renderAll(){
  renderCharging();renderParking();renderTraffic();renderTunnel();
  const live=state.traffic?.status==="live";
  $("#syncState").classList.toggle("ready",live);
  $("#syncText").textContent=live?"即時":"同步中";
  $("#lastUpdate").textContent=formatTime(state.traffic?.updatedAt);
  $("#chargeQuick").textContent=state.charging.length?state.charging.length+" 處":"服務區";
  $("#chargeValue").textContent=state.charging.length||"—";
  const h1=avg(state.traffic?.highways?.["1"]||[]);
  $("#trafficValue").textContent=h1?h1+" km/h":"—";
  if(live){$("#trafficDot").className="dot ready";$("#trafficCaption").textContent="國 1 平均";}
  const snow=avg([...(state.tunnel?.south||[]),...(state.tunnel?.north||[])]);
  $("#tunnelValue").textContent=snow?snow+" km/h":"—";
  if(state.tunnel?.status==="live"&&snow)$("#tunnelDot").className="dot ready";
}
function renderCharging(){
  const root=$("#chargingList");if(!root)return;
  const q=($("#chargingSearch").value||"").trim().toLowerCase();
  const rows=state.charging.filter(x=>(state.road==="all"||x.road===state.road)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));
  root.innerHTML=rows.length?rows.map(x=>'<article class="list-item"><div class="list-head"><div><h3>'+esc(x.name)+'</h3><div class="meta">'+esc(x.direction)+' · '+esc(x.operator)+'</div></div><span class="route-tag">國 '+esc(x.road)+'</span></div><div class="specs"><span>'+esc(x.spaces)+' 車位</span><span>'+esc(x.power)+'</span>'+x.connectors.map(c=>'<span>'+esc(c)+'</span>').join("")+'</div><div class="location-line"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note?" · "+esc(x.note):"")+'</span></div><div class="item-actions"><button class="go" data-nav="'+encodeURIComponent(x.name)+'">導航</button><button data-copy="'+esc(x.name)+'">複製</button></div></article>').join(""):'<div class="empty"><b>沒有符合的充電站</b><p>換個服務區、業者或接頭名稱。</p></div>';
  $$("[data-nav]",root).forEach(b=>b.onclick=()=>open("https://www.google.com/maps/search/?api=1&query="+b.dataset.nav,"_blank","noopener"));
  $$("[data-copy]",root).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("已複製")}catch{toast("無法複製")}});
}
function renderParking(){
  const root=$("#parkingCities");if(!root)return;
  root.innerHTML=(state.parking?.cities||[]).map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note)+'</small></div><span class="route-tag">'+(x.status==="source-ready"?"來源已確認":"待整合")+'</span></article>').join("")||'<div class="empty"><b>停車資料尚未載入</b></div>';
}
function renderTraffic(){
  const root=$("#highwayList");if(!root)return;const rows=state.traffic?.highways?.[state.highway]||[];
  root.innerHTML=rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.direction||"")+(x.level?" · "+esc(x.level):"")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>國 '+state.highway+' 即時資料尚未完成同步</b><p>COLA GO 只顯示真正的官方資料。</p></div>';
}
function renderTunnel(){
  const root=$("#tunnelList");if(!root)return;const rows=state.tunnel?.[state.direction]||[];
  root.innerHTML=rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note||"國 5 即時路段")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>雪隧即時資料尚未完成同步</b><p>完成後直接顯示南下／北上速度。</p></div>';
}
function bindFilters(){
  $$("#roadFilter button").forEach(b=>b.onclick=()=>{$$("#roadFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.road=b.dataset.road;renderCharging()});
  $("#chargingSearch").oninput=renderCharging;
  $$("#highwayTabs button").forEach(b=>b.onclick=()=>{$$("#highwayTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.highway=b.dataset.highway;renderTraffic()});
  $$("#tunnelDirection button").forEach(b=>b.onclick=()=>{$$("#tunnelDirection button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.direction=b.dataset.direction;renderTunnel()});
}
function fillRoute(from,to){$("#tripFrom").value=from;$("#tripTo").value=to;show("trip")}
function bindTrip(){
  $$("[data-route]").forEach(b=>b.onclick=()=>{const [f,t]=b.dataset.route.split("|");$("#tripFrom").value=f;$("#tripTo").value=t});
  $$("[data-fill-route]").forEach(b=>b.onclick=()=>{const [f,t]=b.dataset.fillRoute.split("|");fillRoute(f,t)});
  $("#planTripBtn").onclick=()=>{const from=$("#tripFrom").value.trim()||"目前位置",to=$("#tripTo").value.trim();if(!to)return toast("請先輸入目的地");$("#tripResult").innerHTML='<div class="list-item"><h3>'+esc(from)+' → '+esc(to)+'</h3><div class="meta">先快速查看這趟路會用到的資訊。</div><div class="item-actions"><button class="go" data-next="highway">國道路況</button><button data-next="charging">沿途充電</button><button data-next="parking">停車</button></div></div>';$$("[data-next]",$("#tripResult")).forEach(b=>b.onclick=()=>show(b.dataset.next))};
}
function bindInstall(){
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e});
  $("#installBtn").onclick=async()=>{if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return}const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);$("#installHelp").innerHTML=ios?"在瀏覽器分享選單選「加入主畫面」，之後 COLA GO 會像 App 一樣獨立開啟。":"在 Chrome / Edge 選單選「安裝 COLA GO」或「新增至主畫面」。";$("#installSheet").hidden=false};
  $("#closeInstall").onclick=$("#installOk").onclick=()=>$("#installSheet").hidden=true;
  $("#installSheet").onclick=e=>{if(e.target.id==="installSheet")$("#installSheet").hidden=true};
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
$("#refreshBtn").onclick=()=>{toast("重新整理");load()};
bindNav();bindFilters();bindTrip();bindInstall();show(location.hash.slice(1)||"home",false);load();