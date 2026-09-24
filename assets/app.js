const state={view:"home",charging:[],traffic:null,tunnel:null,parking:null,road:"all",highway:"1",direction:"south",installPrompt:null};
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),2000)}
function show(view,push=true){state.view=view;$$(".screen").forEach(el=>el.classList.toggle("active",el.dataset.view===view));$$(".dock button").forEach(el=>el.classList.toggle("active",el.dataset.go===view));window.scrollTo({top:0,behavior:"instant"});if(push)history.replaceState(null,"","#"+view)}
function bindNav(){$$("[data-go]").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();show(el.dataset.go)}));addEventListener("hashchange",()=>show(location.hash.slice(1)||"home",false))}
async function getJSON(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(url);return r.json()}

async function load(){
  const result=await Promise.allSettled([
    getJSON("./data/charging.json"),
    getJSON("./data/traffic.json"),
    getJSON("./data/tunnel.json"),
    getJSON("./data/parking.json")
  ]);
  if(result[0].status==="fulfilled")state.charging=result[0].value;
  if(result[1].status==="fulfilled")state.traffic=result[1].value;
  if(result[2].status==="fulfilled")state.tunnel=result[2].value;
  if(result[3].status==="fulfilled")state.parking=result[3].value;
  renderAll();
}

function formatUpdate(v){
  if(!v)return "尚未同步";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return v;
  return new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false}).format(d)+" 更新";
}
function averageSpeed(rows){const values=(rows||[]).map(x=>Number(x.speed)).filter(x=>x>0&&x<200);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null}
function renderAll(){
  renderCharging();renderParking();renderTraffic();renderTunnel();
  const trafficReady=state.traffic&&state.traffic.status==="live";
  const top=$(".live-dot");
  top.classList.toggle("ready",!!trafficReady);
  $("#topLiveText").textContent=trafficReady?"官方即時資料":"資料同步中";
  $("#lastUpdate").textContent=formatUpdate(state.traffic?.updatedAt);
  $("#chargingSummary").textContent=state.charging.length+" 個服務區／休息站";
  $("#chargeStatusText").textContent="已整理 "+state.charging.length+" 個服務區／休息站";
  const h1=state.traffic?.highways?.["1"]||[];
  const avg=averageSpeed(h1);
  $("#heroSpeed").textContent=avg??"—";
  $("#heroCharge").textContent=state.charging.length?state.charging.length+" 處":"—";
  if(trafficReady){
    $("#sigTraffic").className="signal ok";
    $("#trafficStatusText").textContent="官方即時路況已同步";
    $("#highwaySummary").textContent=avg?"國 1 平均約 "+avg+" km/h":"官方即時資料已同步";
  }
}

function renderCharging(){
  const root=$("#chargingList");if(!root)return;
  const q=($("#chargingSearch").value||"").trim().toLowerCase();
  const rows=state.charging.filter(x=>(state.road==="all"||x.road===state.road)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));
  root.innerHTML=rows.length?rows.map(x=>
    '<article class="charge-card">'+
      '<div class="charge-card-head"><div><h3>'+esc(x.name)+'</h3><div class="meta">'+esc(x.direction)+' · '+esc(x.operator)+'</div></div><span class="road-tag">國 '+esc(x.road)+'</span></div>'+
      '<div class="spec-row"><span class="spec">'+esc(x.spaces)+' 車位</span><span class="spec">'+esc(x.power)+'</span>'+x.connectors.map(c=>'<span class="spec">'+esc(c)+'</span>').join("")+'</div>'+
      '<div class="location"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note?" · "+esc(x.note):"")+'</span></div>'+
      '<div class="card-actions"><button class="mini-btn primary" data-nav="'+encodeURIComponent(x.name)+'">導航</button><button class="mini-btn" data-copy="'+esc(x.name)+'">複製名稱</button></div>'+
    '</article>'
  ).join(""):'<div class="empty"><b>沒有符合的充電站</b><p>換個服務區、業者或接頭名稱試試。</p></div>';
  $$("[data-nav]",root).forEach(b=>b.onclick=()=>open("https://www.google.com/maps/search/?api=1&query="+b.dataset.nav,"_blank","noopener"));
  $$("[data-copy]",root).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("已複製名稱")}catch{toast("無法複製")}});
}
function renderParking(){
  const root=$("#parkingCities");if(!root)return;
  root.innerHTML=(state.parking?.cities||[]).map(x=>
    '<article class="parking-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note)+'</small></div><span class="status-pill">'+(x.status==="source-ready"?"來源已確認":"待整合")+'</span></article>'
  ).join("")||'<div class="empty"><b>停車資料尚未載入</b><p>資料接入後會直接顯示各區可用狀態。</p></div>';
}
function speedClass(v){return v>=80?"good":v>=50?"mid":"bad"}
function renderTraffic(){
  const root=$("#highwayList");if(!root)return;
  const rows=state.traffic?.highways?.[state.highway]||[];
  root.innerHTML=rows.length?rows.map(x=>
    '<article class="traffic-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.direction||"")+(x.level?" · "+esc(x.level):"")+'</small></div><div class="speed '+speedClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>'
  ).join(""):'<div class="empty"><b>國 '+state.highway+' 即時資料尚未完成同步</b><p>COLA GO 只顯示真的官方資料，不用假數字填版面。</p></div>';
}
function renderTunnel(){
  const root=$("#tunnelList");if(!root)return;
  const rows=state.tunnel?.[state.direction]||[];
  root.innerHTML=rows.length?rows.map(x=>
    '<article class="tunnel-item"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note||"國 5 即時測點")+'</small></div><div class="speed '+speedClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>'
  ).join(""):'<div class="empty"><b>雪隧逐點資料尚未完成同步</b><p>完成後會拆成入口、隧道內與出口，不把歷史熱門時段冒充即時。</p></div>';
}
function bindFilters(){
  $$("#roadFilter button").forEach(b=>b.onclick=()=>{$$("#roadFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.road=b.dataset.road;renderCharging()});
  $("#chargingSearch").oninput=renderCharging;
  $$("#highwayTabs button").forEach(b=>b.onclick=()=>{$$("#highwayTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.highway=b.dataset.highway;renderTraffic()});
  $$("#tunnelDirection button").forEach(b=>b.onclick=()=>{$$("#tunnelDirection button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.direction=b.dataset.direction;renderTunnel()});
}
function bindTrip(){
  $$("[data-route]").forEach(b=>b.onclick=()=>{const parts=b.dataset.route.split("|");$("#tripFrom").value=parts[0];$("#tripTo").value=parts[1]});
  $("#planTripBtn").onclick=()=>{
    const from=$("#tripFrom").value.trim()||"目前位置",to=$("#tripTo").value.trim();
    if(!to)return toast("請先輸入目的地");
    const root=$("#tripResult");root.hidden=false;
    root.innerHTML='<h2>'+esc(from)+' → '+esc(to)+'</h2><p>路線整合層已建立。正式版會用免費且合法的路線／交通資料判斷沿途國道、充電與停車，不直接猜路線。</p><div class="result-actions"><button class="mini-btn primary" data-next="highway">國道路況</button><button class="mini-btn" data-next="charging">沿途充電</button><button class="mini-btn" data-next="parking">停車</button></div>';
    $$("[data-next]",root).forEach(b=>b.onclick=()=>show(b.dataset.next));
  };
}
function bindInstall(){
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e});
  $("#installBtn").onclick=async()=>{
    if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return}
    const ua=navigator.userAgent;
    $("#installHelp").innerHTML=/iPhone|iPad|iPod/.test(ua)?"iPhone／iPad：瀏覽器分享選單 → <b>加入主畫面</b>。":"Chrome / Edge：開啟瀏覽器選單 → <b>安裝 COLA GO</b> 或 <b>新增至主畫面</b>。";
    $("#installSheet").hidden=false;
  };
  $("#closeInstall").onclick=()=>$("#installSheet").hidden=true;
  $("#installSheet").onclick=e=>{if(e.target.id==="installSheet")$("#installSheet").hidden=true};
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

$("#refreshBtn").onclick=()=>{toast("重新整理資料");load()};
addEventListener("online",renderAll);addEventListener("offline",renderAll);
bindNav();bindFilters();bindTrip();bindInstall();show(location.hash.slice(1)||"home",false);load();