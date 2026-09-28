/* COLA GO official TDX cache adapter.
   Credentials stay in GitHub Actions Secrets; browsers only read generated JSON snapshots. */
(function(){
  const officialGet=async path=>{
    const r=await fetch(path,{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  };

  const cityOptions=[
    ["all","全台灣"],["Taipei","臺北市"],["NewTaipei","新北市"],["Taoyuan","桃園市"],["Taichung","臺中市"],
    ["Tainan","臺南市"],["Kaohsiung","高雄市"],["Keelung","基隆市"],["Hsinchu","新竹市"],["HsinchuCounty","新竹縣"],
    ["MiaoliCounty","苗栗縣"],["ChanghuaCounty","彰化縣"],["NantouCounty","南投縣"],["YunlinCounty","雲林縣"],
    ["Chiayi","嘉義市"],["ChiayiCounty","嘉義縣"],["PingtungCounty","屏東縣"],["YilanCounty","宜蘭縣"],
    ["HualienCounty","花蓮縣"],["TaitungCounty","臺東縣"],["PenghuCounty","澎湖縣"],["KinmenCounty","金門縣"]
  ];

  let officialChargingAll=[];
  let curatedCharging=[];
  let chargingUpdatedAt=null;
  let chargingStatus="official";
  const originalRenderCharging=renderCharging;
  const originalRenderParking=renderParking;

  function ensureChargingCityFilter(){
    if(document.querySelector("#chargingCity"))return;
    const grid=document.querySelector(".charging-filter-grid");
    if(!grid)return;
    const label=document.createElement("label");
    label.innerHTML='<span>縣市</span><select id="chargingCity">'+cityOptions.map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join("")+'</select>';
    grid.prepend(label);
    label.querySelector("select").addEventListener("change",()=>{
      state.road="all";
      document.querySelectorAll("#roadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.road==="all"));
      renderCharging();
    });
  }

  function chargingSubset(){
    const city=document.querySelector("#chargingCity")?.value||"all";
    const q=(document.querySelector("#chargingSearch")?.value||"").trim().toLowerCase();
    let rows=officialChargingAll;
    if(city!=="all")rows=rows.filter(x=>x.city===city);
    if(q)rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
    // Keep the mobile DOM bounded. Search/city filtering still queries the complete official cache.
    return rows.slice(0,160);
  }

  renderCharging=function(){
    ensureChargingCityFilter();
    const currentCurated=(state.charging||[]).filter(x=>x.road!=="tdx");
    if(currentCurated.length&&!curatedCharging.length)curatedCharging=currentCurated;
    if(!officialChargingAll.length){
      originalRenderCharging();
      return;
    }
    const official=state.road==="all"?chargingSubset():[];
    state.charging=[...official,...curatedCharging];
    originalRenderCharging();
    document.querySelectorAll("#chargingList .charging-item").forEach(card=>{
      const tag=card.querySelector(".route-tag");
      if(tag?.textContent.trim()==="國 tdx"){
        tag.textContent="TDX";
        card.querySelector("[data-camera-road]")?.remove();
      }
    });
    const chip=document.querySelector(".charging-source-chip");
    const title=document.querySelector(".charging-source b");
    if(title)title.textContent="TDX 全台官方充電站";
    if(chip){
      const city=document.querySelector("#chargingCity")?.value||"all";
      const total=city==="all"?officialChargingAll.length:officialChargingAll.filter(x=>x.city===city).length;
      const shown=official.length;
      const health=chargingStatus==="live"?" · 即時狀態已同步":chargingStatus==="partial"?" · 部分資料更新延遲":chargingStatus==="stale"?" · 顯示最後可用資料":"";
      chip.textContent="官方資料 · "+shown+"/"+total+" 筆"+(chargingUpdatedAt?" · 已同步":"")+health;
    }
    const totalCount=officialChargingAll.length+curatedCharging.length;
    if(document.querySelector("#chargeQuick"))document.querySelector("#chargeQuick").textContent=totalCount?totalCount+" 站":"充電站";
    if(document.querySelector("#chargeValue"))document.querySelector("#chargeValue").textContent=totalCount||"—";
  };

  renderParking=function(){
    originalRenderParking();
    if(state.parkingRemote?.source?.includes("TDX")&&state.parkingRemote.city===state.parkingCity){
      const t=document.querySelector("#parkingLiveTime");
      const s=document.querySelector("#parkingScopeStatus");
      if(state.parkingRemote.stale){
        if(t)t.textContent=state.parkingRemote.updatedAt?formatTime(state.parkingRemote.updatedAt):"最後可用資料";
        if(s)s.textContent="TDX 更新暫時中斷，顯示最後可用資料";
      }else{
        if(t)t.textContent=state.parkingRemote.updatedAt?formatTime(state.parkingRemote.updatedAt):"TDX 官方資料";
        if(s)s.textContent="TDX 官方停車資料 · 以顯示更新時間為準";
      }
    }
  };

  async function waitForBaseCharging(){
    for(let i=0;i<30;i++){
      if(Array.isArray(state.charging)&&state.charging.length)return;
      await new Promise(r=>setTimeout(r,100));
    }
  }

  async function loadOfficialCharging(){
    try{
      const data=await officialGet("./data/tdx/charging.json");
      if(!Array.isArray(data?.items)||!data.items.length)return;
      await waitForBaseCharging();
      curatedCharging=(state.charging||[]).filter(x=>x.road!=="tdx");
      officialChargingAll=data.items;
      chargingUpdatedAt=data.updatedAt||null;
      chargingStatus=data.status||"official";
      const search=document.querySelector("#chargingSearch");
      if(search)search.oninput=()=>renderCharging();
      renderCharging();
    }catch{}
  }

  async function loadOfficialCCTV(){
    try{
      const data=await officialGet("./data/tdx/cctv.json");
      if(!Array.isArray(data?.items)||!data.items.length)return;
      const source=(data.source||"TDX／交通部")+(data.stale?"（最後可用資料）":"");
      state.cctv={status:"ready",items:data.items,source,error:""};
      renderCCTV();
    }catch{}
  }

  function hasHighwayRows(data){
    return data?.highways&&Object.values(data.highways).some(rows=>Array.isArray(rows)&&rows.length);
  }

  async function loadOfficialTraffic(){
    const [trafficResult,tunnelResult]=await Promise.allSettled([
      officialGet("./data/tdx/traffic.json"),
      officialGet("./data/tdx/tunnel.json")
    ]);
    let changed=false;
    if(trafficResult.status==="fulfilled"&&hasHighwayRows(trafficResult.value)){
      state.traffic=trafficResult.value;
      state.trafficFallbackStatus="done";
      changed=true;
    }
    if(tunnelResult.status==="fulfilled"){
      const data=tunnelResult.value;
      if((Array.isArray(data?.south)&&data.south.length)||(Array.isArray(data?.north)&&data.north.length)){
        state.tunnel=data;
        changed=true;
      }
    }
    if(changed)renderAll();
  }

  ensureParkingCity=async function(city){
    if(!city||city==="all")return;
    if(state.parkingRemote.status==="ready"&&state.parkingRemote.city===city)return;
    if(state.parkingRemoteLoading)return;
    state.parkingRemoteLoading=true;
    state.parkingRemote={status:"loading",city,items:[],updatedAt:null,source:"TDX／交通部",error:""};
    renderParking();
    try{
      const data=await officialGet("./data/tdx/parking/"+encodeURIComponent(city)+".json");
      if(!Array.isArray(data?.items)||!data.items.length)throw new Error("no official cache");
      const stale=Boolean(data.stale||data.status==="stale");
      state.parkingRemote={status:"ready",city,items:data.items,updatedAt:data.updatedAt||null,source:data.source||"TDX／交通部",stale,error:""};
      if(city==="Tainan"){
        state.parkingLive={
          status:stale?"stale":"live",stale,updatedAt:data.updatedAt||null,
          items:data.items.map(x=>({id:x.id,name:x.name,zone:x.town,address:x.address,chargeFee:x.fare,
            carTotal:x.total,car:x.available,sourceUpdate:x.dataCollectTime,lat:x.lat,lng:x.lon}))
        };
      }
    }catch(error){
      state.parkingRemote={status:"unavailable",city,items:[],updatedAt:null,source:"TDX／交通部",error:String(error?.message||error)};
    }finally{
      state.parkingRemoteLoading=false;
      renderParking();
    }
  };

  document.querySelector("#parkingCitySelect")?.addEventListener("change",e=>ensureParkingCity(e.target.value));
  document.querySelector("#parkingCityGrid")?.addEventListener("click",e=>{
    const b=e.target.closest("[data-parking-city]");
    if(b)ensureParkingCity(b.dataset.parkingCity);
  });

  ensureChargingCityFilter();
  Promise.resolve().then(loadOfficialCharging);
  Promise.resolve().then(loadOfficialCCTV);
  Promise.resolve().then(loadOfficialTraffic);
})();
