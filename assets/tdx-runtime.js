/* COLA GO official TDX cache adapter.
   Credentials stay in GitHub Actions Secrets; browsers only read generated JSON snapshots. */
(function(){
  const officialGet=async path=>{
    const r=await fetch(path,{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  };

  const DYNAMIC_MAX_AGE_MS=45*60*1000;
  const withFreshness=(data, dynamic=false)=>{
    if(!data||!dynamic)return data;
    const stamp=Date.parse(data.liveUpdatedAt||data.updatedAt||"");
    if(!Number.isFinite(stamp))return {...data,status:"stale",stale:true};
    if(Date.now()-stamp>DYNAMIC_MAX_AGE_MS)return {...data,status:"stale",stale:true};
    return data;
  };

  const cityOptions=[["all","全台灣"],...TAIWAN_CITIES.filter(x=>x.code!=="LienchiangCounty").map(x=>[x.code,x.name])];

  let officialChargingAll=[];
  let operatorChargingAll=[];
  let operatorUpdatedAt=null;
  let curatedCharging=[];
  let chargingUpdatedAt=null;
  let chargingStatus="official";
  const originalRenderCharging=renderCharging;
  const originalRenderParking=renderParking;

  function ensureChargingCityFilter(){
    let select=document.querySelector("#chargingCity");
    if(!select){
      const grid=document.querySelector(".charging-filter-grid");
      if(!grid)return;
      const label=document.createElement("label");
      label.innerHTML='<span>縣市</span><select id="chargingCity">'+cityOptions.map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join("")+'</select>';
      grid.prepend(label);
      select=label.querySelector("select");
    }
    if(select.dataset.bound==="1")return;
    select.dataset.bound="1";
    select.addEventListener("change",()=>{
      state.road="all";
      document.querySelectorAll("#roadFilter button").forEach(b=>b.classList.toggle("active",b.dataset.road==="all"));
      renderCharging();
    });
  }

  function syncChargingOperatorOptions(){
    const select=document.querySelector("#chargingOperator");
    if(!select)return;
    const current=select.value||"all";
    const operators=[...new Set([
      ...curatedCharging.map(x=>x.operator),
      ...officialChargingAll.map(x=>x.operator),
      ...operatorChargingAll.map(x=>x.operator)
    ].filter(Boolean))].sort((a,b)=>{
      const major=chargingMajorRank({operator:a})-chargingMajorRank({operator:b});
      return major||chargingOperatorLabel(a).localeCompare(chargingOperatorLabel(b),"zh-Hant");
    });
    select.innerHTML='<option value="all">全部業者</option>'+operators.map(name=>{
      const value=String(name).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      const label=chargingOperatorLabel(name).replace(/&/g,"&amp;").replace(/</g,"&lt;");
      return '<option value="'+value+'">'+label+'</option>';
    }).join("");
    select.value=operators.includes(current)?current:"all";
    if(select.value==="all")state.chargingOperator="all";
  }

  function chargingSubset(){
    const city=document.querySelector("#chargingCity")?.value||"all";
    let rows=officialChargingAll;
    if(city!=="all")rows=rows.filter(x=>x.city===city);
    return rows;
  }

  function stationIdentityKeys(x){
    const brand=chargingOperatorProfile(x)?.key||String(x?.operator||"").toLowerCase();
    const city=String(x?.city||"");
    const normalize=value=>String(value||"").toLowerCase().replace(/[\s\-_.·・()（）,，。號]/g,"");
    const keys=[];
    const name=normalize(x?.name);
    const address=normalize(x?.location);
    if(name)keys.push([brand,city,"n",name].join("|"));
    if(address)keys.push([brand,city,"a",address].join("|"));
    return keys;
  }

  function operatorSupplementRows(officialRows){
    const city=document.querySelector("#chargingCity")?.value||"all";
    const officialKeys=new Set((officialRows||[]).flatMap(stationIdentityKeys));
    return operatorChargingAll.filter(x=>(city==="all"||x.city===city)&&!stationIdentityKeys(x).some(key=>officialKeys.has(key)));
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
    const supplemental=state.road==="all"?operatorSupplementRows(official):[];
    state.charging=[...official,...supplemental,...curatedCharging];
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
    const sourceNote=document.querySelector(".charging-source small");
    if(title)title.textContent="TDX 全台官方充電站＋業者品牌";
    if(chip||sourceNote){
      const city=document.querySelector("#chargingCity")?.value||"all";
      const scope=city==="all"?officialChargingAll:officialChargingAll.filter(x=>x.city===city);
      const supplement=operatorSupplementRows(scope);
      const total=scope.length+supplement.length;
      const liveCount=scope.filter(x=>!x.liveStale&&Number(x.liveStateCount)>0).length;
      const brandCount=scope.filter(x=>Boolean(chargingOperatorProfile(x))).length+supplement.length;
      const majorCount=scope.filter(x=>CHARGING_MAJOR_KEYS.includes(chargingOperatorProfile(x)?.key||"")).length+supplement.filter(x=>CHARGING_MAJOR_KEYS.includes(chargingOperatorProfile(x)?.key||"")).length;
      const syncTime=chargingUpdatedAt?formatTime(chargingUpdatedAt).replace(" 更新",""):"";
      const operatorTime=operatorUpdatedAt?formatTime(operatorUpdatedAt).replace(" 更新",""):"";
      if(chip)chip.textContent=total+" 站 · "+liveCount+" 站有即時槍況 · 官方補 "+supplement.length;
      if(sourceNote)sourceNote.textContent="交通部 TDX＋業者公開官方站點 · 六大主力 "+majorCount+" 站 · 已辨識品牌 "+brandCount+" 站"+(syncTime?" · TDX "+syncTime:"")+(operatorTime?" · 業者 "+operatorTime:"");
    }
    const totalCount=officialChargingAll.length+operatorSupplementRows(officialChargingAll).length+curatedCharging.length;
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
      const data=withFreshness(await officialGet("./data/tdx/charging.json"),true);
      if(!Array.isArray(data?.items)||!data.items.length)return;
      await waitForBaseCharging();
      curatedCharging=(state.charging||[]).filter(x=>x.road!=="tdx"&&!x.officialSupplemental);
      officialChargingAll=data.items.map(x=>data.stale?{...x,liveStale:true}:x);
      chargingUpdatedAt=data.liveUpdatedAt||data.updatedAt||null;
      chargingStatus=data.status||"official";
      syncChargingOperatorOptions();
      const search=document.querySelector("#chargingSearch");
      if(search)search.oninput=()=>renderCharging();
      renderCharging();
    }catch{}
  }

  async function loadOperatorCharging(){
    const paths=["./data/operators/upower.json","./data/operators/evoasis.json","./data/operators/tail.json"];
    const results=await Promise.allSettled(paths.map(path=>officialGet(path)));
    const datasets=results.filter(x=>x.status==="fulfilled"&&Array.isArray(x.value?.items)&&x.value.items.length).map(x=>x.value);
    if(!datasets.length)return;
    operatorChargingAll=datasets.flatMap(data=>data.items).map(x=>({...x,officialSupplemental:true}));
    operatorUpdatedAt=datasets.map(x=>x.updatedAt).filter(Boolean).sort().at(-1)||null;
    syncChargingOperatorOptions();
    renderCharging();
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

  function sanitizeParkingItems(items){
    return (Array.isArray(items)?items:[]).map(item=>{
      const total=Number(item?.total);
      const raw=item?.available;
      const available=raw==null?null:Number(raw);
      const invalid=available!=null&&(!Number.isFinite(available)||available<0||(Number.isFinite(total)&&total>0&&available>total));
      return invalid?{...item,available:null}:item;
    });
  }

  async function waitForBaseTraffic(){
    for(let i=0;i<30;i++){
      if(state.traffic!==null&&state.tunnel!==null)return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }

  async function loadOfficialTraffic(){
    await waitForBaseTraffic();
    const [trafficResult,tunnelResult]=await Promise.allSettled([
      officialGet("./data/tdx/traffic.json"),
      officialGet("./data/tdx/tunnel.json")
    ]);
    let changed=false;
    if(trafficResult.status==="fulfilled"&&hasHighwayRows(trafficResult.value)){
      state.traffic=withFreshness(trafficResult.value,true);
      state.trafficFallbackStatus="done";
      changed=true;
    }
    if(tunnelResult.status==="fulfilled"){
      const data=withFreshness(tunnelResult.value,true);
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
      const raw=await officialGet("./data/tdx/parking/"+encodeURIComponent(city)+".json");
      const data=withFreshness(raw,raw?.status==="live"||Boolean(raw?.liveUpdatedAt));
      if(!Array.isArray(data?.items)||!data.items.length)throw new Error("no official cache");
      const stale=Boolean(data.stale||data.status==="stale");
      const safeItems=sanitizeParkingItems(data.items);
      state.parkingRemote={status:"ready",city,items:safeItems,updatedAt:data.updatedAt||null,source:data.source||"TDX／交通部",stale,error:""};
      if(city==="Tainan"){
        state.parkingLive={
          status:stale?"stale":"live",stale,updatedAt:data.updatedAt||null,
          items:safeItems.map(x=>({id:x.id,name:x.name,zone:x.town,address:x.address,chargeFee:x.fare,
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
  Promise.resolve().then(loadOperatorCharging);
  Promise.resolve().then(loadOfficialCCTV);
  Promise.resolve().then(loadOfficialTraffic);
})();
