const state={
  view:"home",
  charging:[],
  traffic:null,
  tunnel:null,
  parking:null,
  parkingLive:{status:"not-synced",items:[]},
  models:[],
  market:{usedCars:[],accessories:[],services:[]},
  road:"all",
  highway:"1",
  direction:"south",
  modelFilter:"all",
  usedFilter:"all",
  compare:[],
  communityFilter:"all",
  community:{communities:[],events:[]},
  locations:{services:[]},
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
  state.view=view;
  $$(".view").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  $$(".bottom-nav button").forEach(el=>el.classList.toggle("active",el.dataset.go===view));
  window.scrollTo({top:0,behavior:"instant"});
  if(push)history.replaceState(null,"","#"+view);
}

function bindNav(){
  $$("[data-go]").forEach(el=>{
    el.onclick=e=>{
      e.preventDefault();
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
    getJSON("./data/tesla-locations.json")
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
  const root=$("#chargingList");
  if(!root)return;

  const q=($("#chargingSearch").value||"").trim().toLowerCase();
  const rows=state.charging.filter(x=>
    (state.road==="all"||x.road===state.road) &&
    (!q||JSON.stringify(x).toLowerCase().includes(q))
  );

  root.innerHTML=rows.length?rows.map(x=>
    '<article class="list-item">'+
      '<div class="list-head">'+
        '<div><h3>'+esc(x.name)+'</h3><div class="meta">'+esc(x.direction)+' · '+esc(x.operator)+'</div></div>'+
        '<span class="route-tag">國 '+esc(x.road)+'</span>'+
      '</div>'+
      '<div class="specs">'+
        '<span>'+esc(x.spaces)+' 車位</span>'+
        '<span>'+esc(x.power)+'</span>'+
        x.connectors.map(c=>'<span>'+esc(c)+'</span>').join("")+
      '</div>'+
      '<div class="location-line"><svg><use href="#i-pin"/></svg><span>'+esc(x.location)+(x.note?" · "+esc(x.note):"")+'</span></div>'+
      '<div class="item-actions">'+
        '<button class="go" data-nav="'+encodeURIComponent(x.name)+'">導航</button>'+
        '<button data-camera>即時影像</button>'+
        '<button data-copy="'+esc(x.name)+'">複製</button>'+
      '</div>'+
    '</article>'
  ).join(""):'<div class="empty"><b>沒有符合的充電站</b><p>換個服務區、業者或接頭名稱。</p></div>';

  $$("[data-nav]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.nav,"_blank","noopener"));
  $$("[data-camera]",root).forEach(b=>b.onclick=()=>show("cctv"));
  $$("[data-copy]",root).forEach(b=>b.onclick=async()=>{
    try{
      await navigator.clipboard.writeText(b.dataset.copy);
      toast("已複製");
    }catch{
      toast("無法複製");
    }
  });
}

function renderParking(){
  const liveRoot=$("#liveParkingList");
  const cityRoot=$("#parkingCities");
  if(!liveRoot||!cityRoot)return;

  const live=state.parkingLive||{status:"not-synced",items:[]};
  const query=($("#parkingSearch")?.value||"").trim().toLowerCase();
  const rows=(live.items||[])
    .filter(x=>!query||[x.name,x.zone,x.address,x.typeName].join(" ").toLowerCase().includes(query))
    .sort((a,b)=>Number(b.car||0)-Number(a.car||0));

  $("#parkingLiveTime").textContent=live.status==="live"?(live.updatedAt||"官方即時"):"暫無即時資料";

  if(live.status==="live"&&rows.length){
    liveRoot.innerHTML=rows.map(x=>{
      const available=Number(x.car||0);
      const total=Number(x.carTotal||0);
      const cls=available>=20?"good":available>=5?"mid":"bad";
      return '<article class="parking-card">'+
        '<div class="parking-card-top"><div><h3>'+esc(x.name)+'</h3><span class="parking-zone">'+esc(x.zone||x.typeName||"臺南")+'</span></div><div class="parking-space"><b class="'+cls+'">'+available+'</b><small>汽車剩餘</small></div></div>'+
        '<div class="parking-specs">'+
          '<div><small>總格數</small><b>'+money(total)+'</b></div>'+
          '<div><small>綠能剩餘</small><b>'+money(Number(x.green||0))+'</b></div>'+
          '<div><small>營業／收費</small><b>'+esc(x.chargeTime||"依現場")+'</b></div>'+
        '</div>'+
        '<div class="parking-address">'+esc(x.address||"")+(x.chargeFee?' · '+esc(x.chargeFee):"")+'</div>'+
        '<div class="parking-update">官方更新：'+esc(x.sourceUpdate||live.updatedAt||"—")+'</div>'+
        '<div class="item-actions"><button class="go" data-parking-map="'+encodeURIComponent(x.address||x.name)+'">Google Maps</button><button data-parking-apple="'+encodeURIComponent(x.address||x.name)+'">Apple 地圖</button></div>'+
      '</article>';
    }).join("");
  }else if(live.status==="live"&&query){
    liveRoot.innerHTML='<div class="empty"><b>找不到符合的臺南停車場</b><p>換個停車場名稱、行政區或地址試試。</p></div>';
  }else{
    liveRoot.innerHTML='<div class="market-empty"><b>臺南即時資料暫時無法取得</b><p>不顯示過期數字。你仍可直接用地圖找附近停車場。</p><div class="item-actions"><button class="go" data-nearby-parking="google">Google Maps</button><button data-nearby-parking="apple">Apple 地圖</button></div></div>';
  }

  $$("[data-parking-map]",liveRoot).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.parkingMap,"_blank","noopener"));
  $$("[data-parking-apple]",liveRoot).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.parkingApple,"_blank","noopener"));
  $$("[data-nearby-parking]",liveRoot).forEach(b=>b.onclick=()=>{
    const url=b.dataset.nearbyParking==="apple"
      ?"https://maps.apple.com/?q="+encodeURIComponent("停車場")
      :"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("停車場");
    window.open(url,"_blank","noopener");
  });

  cityRoot.innerHTML=(state.parking?.cities||[]).map(x=>
    '<article class="metric-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.note)+'</small></div><span class="route-tag">'+(x.status==="source-ready"?"來源已確認":"待整合")+'</span></article>'
  ).join("")||'<div class="empty"><b>其他縣市資料尚未載入</b></div>';
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
  ).join(""):'<div class="empty"><b>國 '+state.highway+' 自動同步目前沒有資料</b><p>不顯示假數字；可直接開高公局 1968 查看官方即時路況。</p></div>';

  root.innerHTML=list+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>show("cctv"));
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

  root.innerHTML=list+official;
  $$("[data-official]",root).forEach(b=>b.onclick=()=>window.open(b.dataset.official,"_blank","noopener"));
  $$("[data-open-cctv]",root).forEach(b=>b.onclick=()=>show("cctv"));
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
          '<b>目前 0 筆公開車輛</b>'+
          '<p>不放假車、不複製別人的庫存。第一批刊登開放中，車主與車商都可免費送件。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=sell-vehicle.yml">成為第一批刊登</button>'+
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
          '<b>目前 0 筆二手配件</b>'+
          '<p>免費刊登已開放，不收刊登費、不收成交佣金。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=accessory.yml">刊登第一件配件</button>'+
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
          '<b>合作服務招募中</b>'+
          '<p>先審核合作內容與對車主的實用性，再公開上架。</p>'+
          '<button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=service.yml">申請合作服務</button>'+
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
  $("[data-location-map]",root).forEach(b=>b.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+b.dataset.locationMap,"_blank","noopener"));
  $("[data-location-apple]",root).forEach(b=>b.onclick=()=>window.open("https://maps.apple.com/?q="+b.dataset.locationApple,"_blank","noopener"));
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
    ).join(""):'<div class="market-empty"><b>目前 0 個通過審核的公開社群</b><p>不冒用別人的 LINE 群或社團。主理人可以免費登錄，審核後才公開。</p><button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=community.yml">登錄第一個社群</button></div>';
  }

  const eventRoot=$("#eventList");
  if(eventRoot){
    eventRoot.innerHTML=events.length?events.map(x=>
      '<article class="community-card"><h3>'+esc(x.name)+'</h3><div class="badges"><span>'+esc(x.date||"")+'</span><span>'+esc(x.area||"")+'</span></div><p>'+esc(x.description||"")+'</p><button class="external-btn" data-url="'+esc(x.url)+'">活動詳情<svg><use href="#i-external"/></svg></button></article>'
    ).join(""):'<div class="market-empty"><b>目前 0 個公開車主活動</b><p>車聚、露營、講座、交車活動都能免費提交；日期過期後不繼續冒充「近期活動」。</p><button class="primary" data-url="https://github.com/YKC1117/cola-go/issues/new?template=event.yml">提交第一個活動</button></div>';
  }
  bindExternal(document);
}
function bindCommunity(){
  $("[data-community-filter]").forEach(b=>b.onclick=()=>{
    $("[data-community-filter]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    state.communityFilter=b.dataset.communityFilter;
    renderCommunity();
  });
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
        '<div class="meta">先看路況與充電，再直接交給你慣用的地圖導航。</div>'+
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
