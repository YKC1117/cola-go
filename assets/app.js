const state={view:"home",charging:[],traffic:null,tunnel:null,parking:null,road:"all",highway:"1",direction:"south",installPrompt:null};
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(Math.round(v||0));

function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),1800)}
function show(v,push=true){state.view=v;$$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$$(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===v));window.scrollTo({top:0,behavior:"instant"});if(push)history.replaceState(null,"","#"+v)}
function bindNav(){$$("[data-go]").forEach(el=>el.onclick=e=>{e.preventDefault();show(el.dataset.go)});addEventListener("hashchange",()=>show(location.hash.slice(1)||"home",false))}
function bindExternal(){$$("[data-url]").forEach(el=>el.onclick=()=>window.open(el.dataset.url,"_blank","noopener"))}
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
  $("#trafficDot").className=live?"dot ready":"dot pending";
  $("#trafficCaption").textContent=live&&h1?"國 1 平均":"可開 1968 即時查看";
  const snow=avg([...(state.tunnel?.south||[]),...(state.tunnel?.north||[])]);
  $("#tunnelValue").textContent=snow?snow+" km/h":"—";
  $("#tunnelDot").className=state.tunnel?.status==="live"&&snow?"dot ready":"dot pending";
}
function renderCharging(){
  const root=$("#chargingList");if(!root)return;
  const q=($("#chargingSearch").value||"").trim().toLowerCase();
  const rows=state.charging.filter(x=>(state.road==="all"||x.road===state.road)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));
  root.innerHTML=rows.length?rows.map(x=>'<article class="list-item"><div class="list-head"><div><h3>'+esc(x.name)+'</h3><div class="meta">'+esc(x.direction)+' · '+esc(x.operator)+'</div></div><span class="route-tag">國 '+esc(x.road)+'</span></div><div class="specs"><span>'+esc(x.spaces)+' 車位</span><span>'+esc(x.power)+'</span>'+x.connectors.map(c=>'<span>'+esc(c)+'</span>').join("")+'</div><div class="location-line"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note?" · "+esc(x.note):"")+'</span></div><div class="item-actions"><button class="go" data-nav="'+encodeURIComponent(x.name)+'">導航</button><button data-camera>即時影像</button><button data-copy="'+esc(x.name)+'">複製</button></div></article>').join(""):'<div class="empty"><b>沒有符合的充電站</b><p>換個服務區、業者或接頭名稱。</p></div>';
  $$("[data-nav]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.nav,"_blank","noopener"));
  $$("[data-camera]",root).forEach(b=>b.onclick=()=>show("cctv"));
  $$("[data-copy]",root).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("已複製")}catch{toast("無法複製")}});
}
function renderParking(){
  const root=$("#parkingCities");if(!root)return;
  const nearby='<article class="list-item"><div class="list-head"><div><h3>找附近停車場</h3><div class="meta">沒有即時來源的地區，直接交給地圖搜尋。</div></div></div><div class="item-actions"><button class="go" data-nearby-parking="google">Google Maps</button><button data-nearby-parking="apple">Apple 地圖</button></div></article>';
  const cities=(state.parking?.cities||[]).map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note)+'</small></div><span class="route-tag">'+(x.status==="source-ready"?"來源已確認":"待整合")+'</span></article>').join("");
  root.innerHTML=nearby+(cities||'<div class="empty"><b>停車資料尚未載入</b></div>');
  $$("[data-nearby-parking]",root).forEach(b=>b.onclick=()=>{
    const url=b.dataset.nearbyParking==="apple"?"https://maps.apple.com/?q="+encodeURIComponent("停車場"):"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("停車場");
    window.open(url,"_blank","noopener");
  });
}
function renderTraffic(){
  const root=$("#highwayList");if(!root)return;const rows=state.traffic?.highways?.[state.highway]||[];
  const official='<div class="item-actions"><button class="go" data-official="https://1968.freeway.gov.tw/">1968 即時路況／CCTV</button><button data-open-cctv>影像入口</button></div>';
  root.innerHTML=(rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.direction||"")+(x.level?" · "+esc(x.level):"")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>國 '+state.highway+' 自動同步目前沒有資料</b><p>不顯示假數字；可直接開高公局 1968 查看官方即時路況。</p></div>')+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>show("cctv"));
}
function renderTunnel(){
  const root=$("#tunnelList");if(!root)return;const rows=state.tunnel?.[state.direction]||[];
  const official='<div class="item-actions"><button class="go" data-official="https://1968.freeway.gov.tw/">1968 國 5 即時路況</button><button data-open-cctv>即時影像</button></div>';
  root.innerHTML=(rows.length?rows.map(x=>'<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note||"國 5 即時路段")+'</small></div><div class="metric '+metricClass(Number(x.speed))+'">'+Math.round(Number(x.speed))+'<em>km/h</em></div></article>').join(""):'<div class="empty"><b>雪隧自動同步目前沒有資料</b><p>直接開 1968 可查看國 5 即時影像與路況。</p></div>')+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>show("cctv"));
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
  $("#planTripBtn").onclick=()=>{
    const from=$("#tripFrom").value.trim()||"目前位置",to=$("#tripTo").value.trim();
    if(!to)return toast("請先輸入目的地");
    $("#tripResult").innerHTML='<div class="list-item"><h3>'+esc(from)+' → '+esc(to)+'</h3><div class="meta">先看路況與充電，再直接交給你慣用的地圖導航。</div><div class="item-actions"><button class="go" data-map="google">Google Maps</button><button data-map="apple">Apple 地圖</button></div><div class="item-actions"><button data-next="highway">國道路況</button><button data-next="charging">沿途充電</button><button data-next="parking">停車</button></div></div>';
    $$("[data-next]",$("#tripResult")).forEach(b=>b.onclick=()=>show(b.dataset.next));
    $$("[data-map]",$("#tripResult")).forEach(b=>b.onclick=()=>{
      let url;
      if(b.dataset.map==="apple"){const s=from==="目前位置"?"":("&saddr="+encodeURIComponent(from));url="https://maps.apple.com/?daddr="+encodeURIComponent(to)+"&dirflg=d"+s}
      else{const o=from==="目前位置"?"":("&origin="+encodeURIComponent(from));url="https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(to)+"&travelmode=driving"+o}
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
  const btn=$("#decodeVinBtn");if(!btn)return;
  btn.onclick=()=>{
    const vin=$("#vinInput").value.trim().toUpperCase().replace(/\s/g,"");
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)){return $("#vinResult").innerHTML='<div class="result-card"><h3>VIN 格式不正確</h3><div class="result-sub">請輸入 17 碼 VIN，VIN 不使用 I、O、Q。</div></div>'}
    const rows=[
      ["VIN",vin],["出廠來源",VIN_WMI[vin.slice(0,3)]||"未收錄／請以官方資料為準"],
      ["車型",VIN_MODEL[vin[3]]||"未辨識"],["電池／燃料碼",VIN_BATTERY[vin[6]]||vin[6]],
      ["驅動碼",VIN_DRIVE[vin[7]]||vin[7]],["年份",VIN_YEAR[vin[9]]||vin[9]],
      ["組裝廠",VIN_PLANT[vin[10]]||vin[10]]
    ];
    $("#vinResult").innerHTML='<div class="result-card"><h3>解析結果</h3>'+rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><b>'+esc(r[1])+'</b></div>').join("")+'</div>';
  };
}
function runCalc(){
  const km=Number($("#calcKm")?.value),ep=Number($("#calcElec")?.value),eff=Number($("#calcEff")?.value),fp=Number($("#calcFuel")?.value),fe=Number($("#calcFuelEff")?.value);
  if(!$("#calcResult")||![km,ep,eff,fp,fe].every(v=>Number.isFinite(v)&&v>=0)||eff<=0||fe<=0)return;
  const ev=km/eff*ep, fuel=km/fe*fp, save=fuel-ev;
  $("#calcResult").innerHTML='<h3>估算結果</h3><div class="calc-result-grid"><div class="calc-stat"><small>每月電費</small><b>$'+money(ev)+'</b></div><div class="calc-stat"><small>每月油費</small><b>$'+money(fuel)+'</b></div><div class="calc-stat good"><small>每月差額</small><b>'+((save>=0?"+":"-")+'$'+money(Math.abs(save)))+'</b></div><div class="calc-stat good"><small>五年差額</small><b>'+((save>=0?"+":"-")+'$'+money(Math.abs(save*60)))+'</b></div></div>';
}
function bindCalculator(){const b=$("#runCalcBtn");if(!b)return;b.onclick=runCalc;["calcKm","calcElec","calcEff","calcFuel","calcFuelEff"].forEach(id=>$("#"+id)?.addEventListener("input",runCalc));runCalc()}

const checklistItems=["行照、車牌與 VIN 資料一致","保險已生效","鑰匙卡／鑰匙數量確認","全車漆面無明顯刮痕、凹痕或色差","前後與側窗玻璃無裂損","玻璃車頂／天窗外觀正常","四輪輪圈、輪胎無異常傷痕","底盤可見處無脫落或明顯撞傷","車內玻璃與飾板正常","座椅、縫線與內裝無明顯損傷","門窗膠條與開關正常","螢幕、音響、冷氣與燈具可正常操作","充電功能與隨車配件確認"];
function renderChecklist(){
  const root=$("#deliveryChecklist");if(!root)return;
  let saved=[];try{saved=JSON.parse(localStorage.getItem("cola-go-delivery")||"[]")}catch{}
  root.innerHTML=checklistItems.map((x,i)=>'<label class="check-item '+(saved.includes(i)?"done":"")+'"><input type="checkbox" data-check="'+i+'" '+(saved.includes(i)?"checked":"")+'><span>'+esc(x)+'</span></label>').join("");
  const update=()=>{const checked=$$("[data-check]",root).filter(x=>x.checked).map(x=>Number(x.dataset.check));localStorage.setItem("cola-go-delivery",JSON.stringify(checked));$("#checkProgress").textContent=checked.length+" / "+checklistItems.length;$$(".check-item",root).forEach((el,i)=>el.classList.toggle("done",checked.includes(i)))};
  $$("[data-check]",root).forEach(x=>x.onchange=update);update();
}
function bindChecklist(){renderChecklist();const b=$("#resetChecklist");if(b)b.onclick=()=>{localStorage.removeItem("cola-go-delivery");renderChecklist()}}

function bindParts(){const b=$("#searchPartBtn");if(!b)return;b.onclick=()=>{const p=$("#partNo").value.trim();if(!p)return toast("先輸入料號");window.open("https://www.google.com/search?q="+encodeURIComponent("Tesla "+p),"_blank","noopener")}}

const luckyGood=new Set([1,3,5,6,7,8,11,13,15,16,17,18,21,23,24,25,29,31,32,33,35]);
const luckyMixed=new Set([26,27,30]);
function bindLucky(){const b=$("#luckyBtn");if(!b)return;b.onclick=()=>{const digits=($("#luckyInput").value.match(/\d/g)||[]).slice(-4);if(!digits.length)return toast("請輸入車牌數字");const sum=digits.reduce((s,x)=>s+Number(x),0);const type=luckyGood.has(sum)?"民俗對照常列為吉":luckyMixed.has(sum)?"民俗對照常列為吉凶參半":"民俗對照常列為凶";$("#luckyResult").innerHTML='<div class="result-card"><span class="mini-label">RESULT</span><div class="result-big">'+sum+'</div><b>'+type+'</b><div class="result-sub">數字來源：'+digits.join(" + ")+'</div></div>'}}

function bindInstall(){
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e});
  $("#installBtn").onclick=async()=>{if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return}const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);$("#installHelp").innerHTML=ios?"在瀏覽器分享選單選「加入主畫面」，之後 COLA GO 會像 App 一樣獨立開啟。":"在 Chrome / Edge 選單選「安裝 COLA GO」或「新增至主畫面」。";$("#installSheet").hidden=false};
  $("#closeInstall").onclick=$("#installOk").onclick=()=>$("#installSheet").hidden=true;
  $("#installSheet").onclick=e=>{if(e.target.id==="installSheet")$("#installSheet").hidden=true};
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

$("#refreshBtn").onclick=()=>{toast("重新整理");load()};
bindNav();bindExternal();bindFilters();bindTrip();bindVin();bindCalculator();bindChecklist();bindParts();bindLucky();bindInstall();
show(location.hash.slice(1)||"home",false);load();