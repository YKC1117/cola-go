/* COLA GO official TDX cache adapter.
   Credentials stay in GitHub Actions Secrets; browsers only read generated JSON snapshots. */
(function(){
  const officialGet=async path=>{
    const r=await fetch(path,{cache:"no-store"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  };

  const originalRenderCharging=renderCharging;
  renderCharging=function(){
    originalRenderCharging();
    document.querySelectorAll("#chargingList .charging-item").forEach(card=>{
      const tag=card.querySelector(".route-tag");
      if(tag?.textContent.trim()==="國 tdx"){
        tag.textContent="TDX";
        card.querySelector("[data-camera-road]")?.remove();
      }
    });
  };

  async function loadOfficialCharging(){
    try{
      const data=await officialGet("./data/tdx/charging.json");
      if(!Array.isArray(data?.items)||!data.items.length)return;
      const curated=(state.charging||[]).filter(x=>x.road!=="tdx");
      state.charging=[...data.items,...curated];
      renderCharging();
      if($("#chargeQuick"))$("#chargeQuick").textContent=state.charging.length+" 處";
      if($("#chargeValue"))$("#chargeValue").textContent=state.charging.length;
    }catch{}
  }

  async function loadOfficialCCTV(){
    try{
      const data=await officialGet("./data/tdx/cctv.json");
      if(!Array.isArray(data?.items)||!data.items.length)return;
      state.cctv={status:"ready",items:data.items,source:data.source||"TDX／交通部",error:""};
      renderCCTV();
    }catch{}
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
      state.parkingRemote={status:"ready",city,items:data.items,updatedAt:data.updatedAt||null,source:data.source||"TDX／交通部",error:""};
      if(city==="Tainan"){
        state.parkingLive={
          status:"live",updatedAt:data.updatedAt||null,
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

  $("#parkingCitySelect")?.addEventListener("change",e=>ensureParkingCity(e.target.value));
  $("#parkingCityGrid")?.addEventListener("click",e=>{
    const b=e.target.closest("[data-parking-city]");
    if(b)ensureParkingCity(b.dataset.parkingCity);
  });

  Promise.resolve().then(loadOfficialCharging);
  Promise.resolve().then(loadOfficialCCTV);
})();
