import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.1/dist/maplibre-gl.mjs";

const state={view:"home",charging:[],traffic:null,tunnel:null,parking:null,road:"all",highway:"1",direction:"south",installPrompt:null,map:null,userMarker:null};
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),1900)}
function show(v,push=true){state.view=v;$$(".panel").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$$(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===v));if(push)history.replaceState(null,"","#"+v)}
function bindNav(){$$("[data-go]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();show(el.dataset.go)}));addEventListener("hashchange",()=>show(location.hash.slice(1)||"home",false))}
async function json(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error(url);return r.json()}
function time(v){if(!v)return"等待即時資料";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false}).format(d)+" 更新"}
function avg(rows){const a=(rows||[]).map(x=>Number(x.speed)).filter(v=>v>0&&v<200);return a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):null}
function metricClass(v){return v>=80?"good":v>=50?"mid":"bad"}

function initMap(){
  try{
    state.map=new maplibregl.Map({
      container:"map",
      style:"https://tiles.openfreemap.org/styles/positron",
      center:[120.92,23.72],
      zoom:6.45,
      attributionControl:true
    });
    state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-left");
  }catch(err){console.warn("map",err)}
}
function locate(){
  if(!navigator.geolocation)return toast("此裝置不支援定位");
  navigator.geolocation.getCurrentPosition(pos=>{
    const lng=pos.coords.longitude,lat=pos.coords.latitude;
    if(state.map)state.map.flyTo({center:[lng,lat],zoom:13.5,duration:900});
    if(state.userMarker)state.userMarker.remove();
    const el=document.createElement("div");el.style.cssText="width:16px;height:16px;border:4px solid white;background:#4d8df7;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,.28)";
    state.userMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(state.map);
    if(!$("#tripFrom").value)$("#tripFrom").value="目前位置";
  },()=>toast("無法取得定位，請檢查瀏覽器權限"),{enableHighAccuracy:false,timeout:9000});
}

async function load(){
  const r=await Promise.allSettled([json("./data/charging.json"),json("./data/traffic.json"),json("./data/tunnel.json"),json("./data/parking.json")]);
  if(r[0].status==="fulfilled")state.charging=r[0].value;
  if(r[1].status==="fulfilled")state.traffic=r[1].value;
  if(r[2].status==="fulfilled")state.tunnel=r[2].value;
  if(r[3].status==="fulfilled")state.parking=r[3].value;
  render();
}
function render(){
  renderCharging();renderParking();renderTraffic();renderTunnel();
  const trafficLive=state.traffic?.status==="live", tunnelLive=state.tunnel?.status==="live";
  $("#liveChip").classList.toggle("ready",trafficLive);
  $("#liveText").textContent=trafficLive?"官方即時資料":"資料同步中";
  $("#lastUpdate").textContent=time(state.traffic?.updatedAt);
  $("#chargingQuick").textContent=state.charging.length?state.charging.length+" 處":"服務區";
  $("#chargeHero").textContent=state.charging.length||"—";
  const h1=avg(state.traffic?.highways?.["1"]||[]);
  $("#trafficHero").textContent=h1?h1+" km/h":"—";
  if(trafficLive){$("#trafficDot").className="status-dot ready";$("#trafficCaption").textContent="國 1 平均";}
  const snowRows=[...(state.tunnel?.south||[]),...(state.tunnel?.north||[])], snow=avg(snowRows);
  $("#tunnelHero").textContent=snow?snow+" km/h":"—";
  if(tunnelLive&&snow){$("#tunnelDot").className="status-dot ready";}
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
  root.innerHTML=rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.direction||"")+(x.level?" · "+esc(x.level):"")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>國 '+state.highway+' 即時資料尚未完成同步</b><p>只顯示真正的官方資料，不用假數字填畫面。</p></div>';
}
function renderTunnel(){
  const root=$("#tunnelList");if(!root)return;const rows=state.tunnel?.[state.direction]||[];
  root.innerHTML=rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note||"國 5 即時路段")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>雪隧即時資料尚未完成同步</b><p>完成後會直接顯示南下／北上即時速度。</p></div>';
}
function bindFilters(){
  $$("#roadFilter button").forEach(b=>b.onclick=()=>{$$("#roadFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.road=b.dataset.road;renderCharging()});
  $("#chargingSearch").oninput=renderCharging;
  $$("#highwayTabs button").forEach(b=>b.onclick=()=>{$$("#highwayTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.highway=b.dataset.highway;renderTraffic()});
  $$("#tunnelDirection button").forEach(b=>b.onclick=()=>{$$("#tunnelDirection button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.direction=b.dataset.direction;renderTunnel()});
}
function bindTrip(){
  $$("[data-route]").forEach(b=>b.onclick=()=>{const [f,t]=b.dataset.route.split("|");$("#tripFrom").value=f;$("#tripTo").value=t});
  $("#planTripBtn").onclick=()=>{const f=$("#tripFrom").value.trim()||"目前位置",t=$("#tripTo").value.trim();if(!t)return toast("請先輸入目的地");$("#tripResult").innerHTML='<div class="list-item"><h3>'+esc(f)+' → '+esc(t)+'</h3><div class="meta">路線與沿途資料整合層正在接入；正式版不會用猜的替你決定路線。</div><div class="item-actions"><button class="go" data-next="highway">國道路況</button><button data-next="charging">沿途充電</button><button data-next="parking">停車</button></div></div>';$$("[data-next]",$("#tripResult")).forEach(b=>b.onclick=()=>show(b.dataset.next))};
}
function bindInstall(){
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e});
  $("#installBtn").onclick=async()=>{if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return}const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);$("#installHelp").innerHTML=ios?"在瀏覽器分享選單選擇「加入主畫面」，之後 COLA GO 會以獨立 App 視窗開啟。":"在 Chrome / Edge 選單選擇「安裝 COLA GO」或「新增至主畫面」。";$("#installSheet").hidden=false};
  $("#closeInstall").onclick=$("#installOk").onclick=()=>$("#installSheet").hidden=true;
  $("#installSheet").onclick=e=>{if(e.target.id==="installSheet")$("#installSheet").hidden=true};
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
$("#locateBtn").onclick=locate;
bindNav();bindFilters();bindTrip();bindInstall();initMap();show(location.hash.slice(1)||"home",false);load();