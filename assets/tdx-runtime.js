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
  let operatorSourceHealth={};
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

  const DEDUPE_CITY_PREFIXES=["基隆","台北","新北","桃園","新竹","苗栗","台中","彰化","南投","雲林","嘉義","台南","高雄","屏東","宜蘭","花蓮","台東","澎湖","金門","連江"];

  function normalizedStationName(value){
    let name=String(value||"").replace(/臺/g,"台").toLowerCase()
      .replace(/evoasis|tail|特爾電力|e-?value|華城電能|華城電機|u-?power|旭電馳科研/gi,"")
      .replace(/[^\p{L}\p{N}]+/gu,"");
    for(const prefix of DEDUPE_CITY_PREFIXES){
      if(name.startsWith(prefix)&&name.length>prefix.length+4){
        name=name.slice(prefix.length);
        break;
      }
    }
    return name.replace(/(超級綠洲|超充站|快充站|充電站)$/,"");
  }

  function normalizedAddressCore(value){
    let address=String(value||"").replace(/臺/g,"台").replace(/^\d{3,5}\s*/,"");
    const match=address.match(/^(.*?(?:路|街|巷|道|大道|段|村|里|鄉|鎮|區).*?\d+(?:-\d+)?號)/);
    if(match)address=match[1];
    return address.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  }

  function stationNameKey(x){
    const city=String(x?.city||"");
    const name=String(x?.name||"").replace(/臺/g,"台").toLowerCase().replace(/[\s\-_.·・()（）,，。號]/g,"");
    return city&&name?city+"|"+name:"";
  }

  function stationMergeKeys(x,{withBrand=true}={}){
    const brand=chargingOperatorProfile(x)?.key||String(x?.networkKey||x?.operator||"").toLowerCase();
    const city=String(x?.city||"");
    if(!city)return [];
    const prefix=withBrand?[brand,city]:[city];
    const keys=[];
    const exactName=String(x?.name||"").replace(/臺/g,"台").toLowerCase().replace(/[\s\-_.·・()（）,，。號]/g,"");
    const safeName=normalizedStationName(x?.name);
    const address=String(x?.location||"").replace(/臺/g,"台").toLowerCase().replace(/[\s\-_.·・()（）,，。號]/g,"");
    const addressCore=normalizedAddressCore(x?.location);
    if(exactName)keys.push([...prefix,"n",exactName].join("|"));
    if(safeName&&safeName.length>=4)keys.push([...prefix,"fn",safeName].join("|"));
    if(address)keys.push([...prefix,"a",address].join("|"));
    if(addressCore&&addressCore.length>=6)keys.push([...prefix,"fa",addressCore].join("|"));
    return [...new Set(keys)];
  }

  function stationIdentityKeys(x){
    return stationMergeKeys(x,{withBrand:true});
  }

  function uniqueLookup(rows,keyFn){
    const map=new Map();
    for(const row of rows||[]){
      for(const key of keyFn(row)){
        if(!key)continue;
        if(!map.has(key))map.set(key,row);
        else if(map.get(key)!==row)map.set(key,null);
      }
    }
    return map;
  }

  function enrichOfficialRows(rows){
    const exactByName=new Map();
    operatorChargingAll.forEach(item=>{
      const key=stationNameKey(item);
      if(key&&!exactByName.has(key))exactByName.set(key,item);
    });
    const conservative=uniqueLookup(operatorChargingAll,item=>stationMergeKeys(item,{withBrand:false}));
    return (rows||[]).map(row=>{
      let match=exactByName.get(stationNameKey(row))||null;
      if(!match){
        const hits=[...new Set(stationMergeKeys(row,{withBrand:false}).map(key=>conservative.get(key)).filter(Boolean))];
        if(hits.length===1)match=hits[0];
      }
      if(!match)return row;
      return {
        ...row,
        networkKey:match.networkKey||chargingOperatorProfile(match)?.key||row.networkKey,
        officialSource:match.officialSource||row.officialSource,
        officialSourceURL:match.officialSourceURL||row.officialSourceURL,
        officialNetworkMatch:true,
        officialSitePowerKw:Number(match.sitePowerKw)||0,
        officialConnectors:Array.isArray(match.connectors)?match.connectors:[],
        officialSpaces:Number(match.spaces)||0
      };
    });
  }

  function operatorSupplementRows(officialRows){
    const city=document.querySelector("#chargingCity")?.value||"all";
    const officialKeys=new Set((officialRows||[]).flatMap(stationIdentityKeys));
    const officialNames=new Set((officialRows||[]).map(stationNameKey).filter(Boolean));
    return operatorChargingAll.filter(x=>
      (city==="all"||x.city===city)&&
      !officialNames.has(stationNameKey(x))&&
      !stationIdentityKeys(x).some(key=>officialKeys.has(key))
    );
  }

  function primeChargingMajorStatus(){
    document.querySelectorAll("#chargingMajorFilter [data-charge-major]").forEach(button=>{
      const key=button.dataset.chargeMajor||"all";
      const status=button.querySelector("[data-major-status]");
      if(!status)return;
      if(key==="all")status.textContent="站數載入中";
      else if(key==="icharging")status.textContent="TDX 站數載入中 · 官方地圖可用";
      else if(key==="tesla")status.textContent="站數載入中 · TDX 即時＋Tesla 官方";
      else status.textContent="官方站點已導入 · 站數載入中";
    });
  }

  function primeChargingCoverageGrid(){
    const grid=document.querySelector("#chargingCoverageGrid");
    const summary=document.querySelector("#chargingCoverageSummary");
    if(!grid)return;
    if(summary)summary.textContent="站數載入中";
    if(grid.children.length)return;
    grid.innerHTML=CHARGING_MAJOR_KEYS.map(key=>{
      const profile=CHARGING_OPERATOR_PROFILES.find(x=>x.key===key);
      if(!profile)return "";
      const source=key==="icharging"?"官方地圖可用・站點快取待導入":key==="tesla"?"TDX 即時＋Tesla 官方":"官方站點已導入";
      const badge=key==="icharging"?'<em class="official">官方地圖可用</em>':key==="tesla"?'<em class="official">優先整合</em>':'';
      return '<button type="button" data-coverage-major="'+key+'">'+
        '<span class="charging-coverage-brand"><b>'+profile.brand+'</b><small>'+source+'</small></span>'+
        '<span class="charging-coverage-stats"><strong>—</strong><small>站</small><em>資料載入中</em>'+badge+'</span>'+
      '</button>';
    }).join("");
    grid.querySelectorAll("[data-coverage-major]").forEach(button=>button.onclick=()=>{
      state.chargingMajor=button.dataset.coverageMajor||"all";
      state.chargingOperator="all";
      const select=document.querySelector("#chargingOperator");
      if(select)select.value="all";
      renderCharging();
      document.querySelector("#chargingList")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }

  function renderChargingCoverage(){
    const grid=document.querySelector("#chargingCoverageGrid");
    const summary=document.querySelector("#chargingCoverageSummary");
    if(!grid||!summary)return;

    const city=document.querySelector("#chargingCity")?.value||"all";
    const baseTdxRows=city==="all"?officialChargingAll:officialChargingAll.filter(x=>x.city===city);
    const tdxRows=enrichOfficialRows(baseTdxRows);
    const supplementRows=operatorSupplementRows(tdxRows);
    const majorProfiles=CHARGING_MAJOR_KEYS.map(key=>CHARGING_OPERATOR_PROFILES.find(x=>x.key===key)).filter(Boolean);
    const rows=majorProfiles.map(profile=>{
      const tdxBrand=tdxRows.filter(x=>chargingOperatorProfile(x)?.key===profile.key);
      const supplementBrand=supplementRows.filter(x=>chargingOperatorProfile(x)?.key===profile.key);
      const live=tdxBrand.filter(x=>!x.liveStale&&Number(x.liveStateCount)>0).length;
      const merged=tdxBrand.length+supplementBrand.length;
      const ratio=tdxBrand.length?Math.round(live/tdxBrand.length*100):0;
      const health=operatorSourceHealth[profile.key]||null;
      const degraded=health?.syncStatus==="degraded";
      const pendingOfficial=profile.key==="icharging"&&!health;
      const teslaPriority=profile.key==="tesla";
      const officialGuideOnly=pendingOfficial||teslaPriority;
      const source=pendingOfficial
        ?(live?"TDX 即時・官方資料待新增":"TDX・官方資料待新增")
        :teslaPriority
          ?(live?"TDX 即時＋Tesla 官方":"TDX＋Tesla 官方")
          :supplementBrand.length
            ?(degraded?"TDX＋官方舊資料":"TDX＋業者官方")
            :(live?"TDX 即時":"TDX");
      return {profile,tdx:tdxBrand.length,supplement:supplementBrand.length,live,merged,ratio,source,degraded,officialGuideOnly,pendingOfficial,teslaPriority};
    });

    const mergedTotal=rows.reduce((sum,x)=>sum+x.merged,0);
    const liveTotal=rows.reduce((sum,x)=>sum+x.live,0);
    const healthKeys=Object.keys(operatorSourceHealth).sort();
    grid.dataset.sourceHealth=healthKeys.join(",");
    grid.dataset.degradedSources=rows.filter(x=>x.degraded).map(x=>x.profile.key).join(",");
    summary.textContent=(city==="all"?"全台":"目前縣市")+" · "+mergedTotal+" 站 · "+liveTotal+" 站有即時槍況";

    document.querySelectorAll("#chargingMajorFilter [data-charge-major]").forEach(button=>{
      const key=button.dataset.chargeMajor||"all";
      const status=button.querySelector("[data-major-status]");
      if(key==="all"){
        if(status)status.textContent=mergedTotal+" 站 · "+liveTotal+" 即時";
        button.dataset.sourceMode="combined";
        button.setAttribute("aria-label","全部主力充電網，"+mergedTotal+" 站，"+liveTotal+" 站有即時槍況");
        return;
      }
      const row=rows.find(item=>item.profile.key===key);
      if(!row)return;
      if(status)status.textContent=row.pendingOfficial
        ?row.merged+" 站 · 官方地圖可用"
        :row.merged+" 站 · "+row.live+" 即時";
      button.dataset.sourceMode=row.pendingOfficial?"pending":row.supplement?"official-cache":(row.officialGuideOnly?"official-guide":"tdx");
      button.classList.toggle("has-live",row.live>0);
      button.classList.toggle("has-official-supplement",row.supplement>0);
      button.setAttribute("aria-label",row.profile.brand+"，"+row.merged+" 站，"+row.live+" 站有即時槍況");
    });

    grid.innerHTML=rows.map(row=>
      '<button type="button" class="'+(row.degraded?'is-degraded':'')+'" data-coverage-major="'+row.profile.key+'">'+
        '<span class="charging-coverage-brand"><b>'+esc(row.profile.brand)+'</b><small>'+esc(row.source)+'</small></span>'+
        '<span class="charging-coverage-stats">'+
          '<strong>'+row.merged+'</strong><small>站</small>'+
          '<em>'+row.live+' 即時</em>'+
          (row.pendingOfficial?'<em class="official">官方地圖可用</em>':row.teslaPriority?'<em class="official">優先整合</em>':row.supplement?'<em class="official">'+row.supplement+' 官方補</em>':'')+
        '</span>'+
      '</button>'
    ).join("");
    grid.querySelectorAll("[data-coverage-major]").forEach(button=>button.onclick=()=>{
      state.chargingMajor=button.dataset.coverageMajor||"all";
      state.chargingOperator="all";
      const select=document.querySelector("#chargingOperator");
      if(select)select.value="all";
      renderCharging();
      document.querySelector("#chargingList")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }

  renderCharging=function(){
    ensureChargingCityFilter();
    const currentCurated=(state.charging||[]).filter(x=>x.road!=="tdx");
    if(currentCurated.length&&!curatedCharging.length)curatedCharging=currentCurated;
    if(!officialChargingAll.length){
      originalRenderCharging();
      renderChargingCoverage();
      return;
    }
    const rawOfficial=state.road==="all"?chargingSubset():[];
    const official=enrichOfficialRows(rawOfficial);
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
      const baseScope=city==="all"?officialChargingAll:officialChargingAll.filter(x=>x.city===city);
      const scope=enrichOfficialRows(baseScope);
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
    renderChargingCoverage();
    const totalCount=officialChargingAll.length+operatorSupplementRows(officialChargingAll).length+curatedCharging.length;
    if(document.querySelector("#chargeQuick"))document.querySelector("#chargeQuick").textContent=totalCount?totalCount+" 站":"充電站";
    if(document.querySelector("#chargeValue"))document.querySelector("#chargeValue").textContent=totalCount||"—";
  };

  renderParking=function(){
    originalRenderParking();
    if(state.parkingRemote?.source?.includes("TDX")&&state.parkingRemote.city===state.parkingCity){
      const t=document.querySelector("#parkingLiveTime");
      const s=document.querySelector("#parkingScopeStatus");
      const info=dataStatusInfo(state.parkingRemote);
      if(t)t.textContent=info.known?info.label:"尚無更新時間";
      if(s)s.textContent=info.live
        ?"TDX 官方停車資料 · "+state.parkingRemote.items.length+" 筆"
        :state.parkingRemote.items.length
          ?"資料較舊 · "+state.parkingRemote.items.length+" 筆 · 剩餘車位僅供參考"
          :"TDX 官方停車資料暫不可用";
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
    const sources=[
      {path:"./data/operators/upower.json",key:"upower"},
      {path:"./data/operators/evoasis.json",key:"evoasis"},
      {path:"./data/operators/tail.json",key:"tail"},
      {path:"./data/operators/evalue.json",key:"evalue"}
    ];
    const results=await Promise.allSettled(sources.map(source=>officialGet(source.path)));
    const datasets=results.map((result,index)=>({result,source:sources[index]}))
      .filter(x=>x.result.status==="fulfilled"&&Array.isArray(x.result.value?.items)&&x.result.value.items.length);
    if(!datasets.length)return;
    operatorSourceHealth=Object.fromEntries(datasets.map(({result,source})=>[source.key,{
      syncStatus:result.value.syncStatus||"ok",
      updatedAt:result.value.updatedAt||null,
      lastSuccessAt:result.value.lastSuccessAt||result.value.updatedAt||null,
      lastAttemptAt:result.value.lastAttemptAt||result.value.updatedAt||null
    }]));
    const coverageGrid=document.querySelector("#chargingCoverageGrid");
    if(coverageGrid)coverageGrid.dataset.sourceHealth=Object.keys(operatorSourceHealth).sort().join(",");
    operatorChargingAll=datasets.flatMap(({result,source})=>
      result.value.items.map(x=>({...x,officialSupplemental:true,networkKey:x.networkKey||source.key,officialSyncStatus:result.value.syncStatus||"ok"}))
    );
    operatorUpdatedAt=datasets.map(x=>x.result.value.lastSuccessAt||x.result.value.updatedAt).filter(Boolean).sort().at(-1)||null;
    syncChargingOperatorOptions();
    renderCharging();
  }

  async function loadOfficialCCTV(){
    try{
      const data=await officialGet("./data/tdx/cctv.json");
      if(!Array.isArray(data?.items)||!data.items.length)return;
      const source=(data.source||"TDX／交通部")+(data.stale?"（最後可用資料）":"");
      state.cctv={status:"ready",items:data.items,source,updatedAt:data.updatedAt||data.liveUpdatedAt||null,error:""};
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
  primeChargingMajorStatus();
  primeChargingCoverageGrid();
  Promise.resolve().then(loadOfficialCharging);
  Promise.resolve().then(loadOperatorCharging);
  Promise.resolve().then(loadOfficialCCTV);
  Promise.resolve().then(loadOfficialTraffic);
})();
