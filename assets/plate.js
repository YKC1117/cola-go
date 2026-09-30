(()=>{
"use strict";
const STORE_KEY="cola-go-plate-watch-v1";
const ALERT_KEY="cola-go-plate-alerts-v1";
const official={
  pick:"https://www.mvdis.gov.tw/m3-emv-plate/webpickno/queryPickNo",
  bid:"https://www.mvdis.gov.tw/m3-emv-plate/bid/queryBiding"
};
const $p=(q)=>document.querySelector(q);
const escPlate=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const moneyPlate=v=>Number.isFinite(Number(v))&&Number(v)>0?"NT$ "+new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(Number(v)):"—";
const normalize=v=>String(v||"").trim().toUpperCase().replace(/\s+/g,"");
function loadRows(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveRows(rows){try{localStorage.setItem(STORE_KEY,JSON.stringify(rows))}catch{}}
function loadAlerts(){try{return JSON.parse(localStorage.getItem(ALERT_KEY)||"{}")||{}}catch{return{}}}
function saveAlerts(x){try{localStorage.setItem(ALERT_KEY,JSON.stringify(x))}catch{}}
function notify(title,body){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  try{new Notification(title,{body,icon:"./assets/logo.svg",tag:"cola-go-plate"})}catch{}
}
function fmtTime(v){
  if(!v)return "未設定";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return "未設定";
  return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
}
function budgetState(row){
  const budget=Number(row.budget)||0,current=Number(row.current)||0;
  if(!budget||!current)return {label:"等待價格",cls:""};
  if(current>budget)return {label:"已超預算",cls:"over"};
  if(current>=budget*.9)return {label:"接近預算",cls:"warn"};
  return {label:"預算內",cls:""};
}
function render(){
  const root=$p("#plateWatchList"), count=$p("#plateWatchCount");
  if(!root)return;
  const rows=loadRows();
  if(count)count.textContent=String(rows.length);
  if(!rows.length){root.innerHTML='<div class="plate-watch-empty"><b>還沒有候選號碼</b><br>把你喜歡的 1117、8888 或完整車牌先加進來。之後即時資料串接完成，這裡就是你的搶牌監控清單。</div>';return}
  root.innerHTML=rows.map(row=>{
    const s=budgetState(row);
    const budget=Number(row.budget)||0,current=Number(row.current)||0;
    const remain=budget&&current?budget-current:null;
    return '<article class="plate-watch-card" data-plate-id="'+escPlate(row.id)+'">'+
      '<div class="plate-watch-top"><div><div class="plate-watch-number">'+escPlate(row.plate)+'</div><small class="meta">存在此裝置</small></div><span class="plate-budget-state '+s.cls+'">'+escPlate(s.label)+'</span></div>'+
      '<div class="plate-watch-meta">'+
        '<div><small>最高預算</small><b>'+moneyPlate(budget)+'</b></div>'+
        '<div><small>目前價格</small><b>'+moneyPlate(current)+'</b></div>'+
        '<div><small>距離預算</small><b>'+(remain===null?"—":remain>=0?moneyPlate(remain):"超過 "+moneyPlate(Math.abs(remain)))+'</b></div>'+
        '<div><small>結標時間</small><b>'+escPlate(fmtTime(row.endTime))+'</b></div>'+
      '</div>'+
      '<div class="plate-watch-actions"><button data-plate-action="price" type="button">更新目前價</button><button data-plate-action="official" type="button">官方競標頁</button><button class="danger" data-plate-action="remove" type="button">移除</button></div>'+
    '</article>'
  }).join("");
}
function updateNotifyText(){
  const el=$p("#plateNotifyState");
  if(!el)return;
  if(!("Notification" in window)){el.textContent="這個瀏覽器不支援網站通知；可先使用 LINE 官方帳號與頁面內追蹤。";return}
  if(Notification.permission==="granted")el.textContent="瀏覽器通知已開啟。頁面開啟期間會檢查候選車牌的結標倒數；背景 Web Push 與 LINE 個人化通知接續串接。";
  else if(Notification.permission==="denied")el.textContent="瀏覽器通知目前被封鎖；請到瀏覽器網站設定重新允許。";
  else el.textContent="頁面開啟時可使用瀏覽器提醒；背景 Web Push 與 LINE 個人化競標通知接續串接。";
}
function checkDeadlines(){
  const now=Date.now(),alerts=loadAlerts();
  loadRows().forEach(row=>{
    if(!row.endTime)return;
    const ms=new Date(row.endTime).getTime()-now;
    if(!Number.isFinite(ms)||ms<=0)return;
    [[15,"15 分鐘"],[5,"5 分鐘"],[1,"1 分鐘"]].forEach(([m,label])=>{
      const key=row.id+"-"+m;
      if(ms<=m*60000&&!alerts[key]){
        alerts[key]=Date.now();
        notify("COLA GO 車牌提醒",row.plate+" 距離你設定的結標時間約剩 "+label+"。請回官方頁確認最新價格與決標時間。");
      }
    });
  });
  saveAlerts(alerts);
}
function bind(){
  if(!$p('[data-view="plate"]'))return;
  render();updateNotifyText();

  const search=$p("#plateSearchOfficial");
  if(search)search.onclick=()=>{
    const q=normalize($p("#plateSearchInput")?.value);
    if(q)try{localStorage.setItem("cola-go-last-plate-search",q)}catch{}
    window.open(official.pick,"_blank","noopener");
  };

  const add=$p("#plateAddWatch");
  if(add)add.onclick=()=>{
    const plate=normalize($p("#plateCandidate")?.value);
    if(!plate){window.toast?toast("先輸入候選號碼"):alert("先輸入候選號碼");return}
    const budget=Math.max(0,Number($p("#plateBudget")?.value)||0);
    const current=Math.max(0,Number($p("#plateCurrentPrice")?.value)||0);
    const endTime=$p("#plateEndTime")?.value||"";
    const rows=loadRows();
    const existing=rows.find(x=>x.plate===plate);
    if(existing){existing.budget=budget;existing.current=current;existing.endTime=endTime}
    else rows.unshift({id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),plate,budget,current,endTime,createdAt:new Date().toISOString()});
    saveRows(rows);render();
    if(current&&budget){
      if(current>budget)notify("COLA GO 車牌提醒",plate+" 目前價格已超過你設定的預算。");
      else if(current>=budget*.9)notify("COLA GO 車牌提醒",plate+" 已接近你設定的預算上限。");
    }
    ["#plateCandidate","#plateBudget","#plateCurrentPrice","#plateEndTime"].forEach(s=>{const el=$p(s);if(el)el.value=""});
  };

  const enable=$p("#plateEnableNotify");
  if(enable)enable.onclick=async()=>{
    if(!("Notification" in window)){alert("這個瀏覽器不支援網站通知");return}
    const p=await Notification.requestPermission();
    updateNotifyText();
    if(p==="granted")notify("COLA GO 車牌提醒","通知已開啟。之後候選車牌接近你設定的結標時間時，頁面開啟期間會提醒你。");
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
    if(action==="remove"){saveRows(rows.filter(x=>x.id!==id));render();return}
    if(action==="official"){window.open(official.bid,"_blank","noopener");return}
    if(action==="price"){
      const raw=prompt("輸入 "+row.plate+" 在官方頁看到的目前價格",row.current||"");
      if(raw===null)return;
      const value=Math.max(0,Number(String(raw).replace(/[^0-9.]/g,""))||0);
      row.current=value;saveRows(rows);render();
      if(value&&row.budget){
        if(value>row.budget)notify("COLA GO 車牌提醒",row.plate+" 目前價格 "+moneyPlate(value)+"，已超過你的預算 "+moneyPlate(row.budget)+"。");
        else if(value>=row.budget*.9)notify("COLA GO 車牌提醒",row.plate+" 目前價格已接近你的預算上限。");
      }
    }
  };

  const last=localStorage.getItem("cola-go-last-plate-search");
  if(last&&$p("#plateSearchInput"))$p("#plateSearchInput").value=last;
  setInterval(checkDeadlines,10000);
  checkDeadlines();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();