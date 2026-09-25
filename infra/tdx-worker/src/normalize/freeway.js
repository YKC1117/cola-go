import { numberOrNull, uniqueById } from "./common.js";

export function normalizeFreewaySections(items) {
  return uniqueById(items.map((x) => {
    const id=String(x.SectionID||""); if(!id) return null;
    return {id,roadId:x.RoadID||null,roadName:x.RoadName||null,direction:x.RoadDirection||null,
      name:x.SectionName||[x.Start,x.End].filter(Boolean).join(" → ")||id,
      startMile:numberOrNull(x.StartMile),endMile:numberOrNull(x.EndMile),lengthKm:numberOrNull(x.Distance)};
  }).filter(Boolean));
}
export function normalizeFreewayLive(items) {
  return uniqueById(items.map((x)=>{
    const id=String(x.SectionID||""); if(!id)return null;
    let speed=numberOrNull(x.TravelSpeed); if(speed===250||(speed!=null&&speed<0))speed=null;
    return {id,roadName:x.RoadName||null,direction:x.RoadDirection||null,speedKph:speed,
      travelTimeSeconds:numberOrNull(x.TravelTime),congestionCode:numberOrNull(x.CongestionLevel),
      closed:Boolean(x.IsClosed||x.Closed),sourceUpdatedAt:x.DataCollectTime||null};
  }).filter(Boolean));
}
function mergeKnown(base,overlay){
  const out={...base};
  for(const [key,value] of Object.entries(overlay||{})) if(value!==null&&value!==undefined&&value!=="") out[key]=value;
  return out;
}
export function normalizeXueshan(sectionItems,liveItems){
  const sections=new Map(normalizeFreewaySections(sectionItems).map((x)=>[x.id,x]));
  return normalizeFreewayLive(liveItems).map((live)=>{
    const section=sections.get(live.id);if(!section)return null;
    const label=`${section.roadName||""} ${section.name||""}`;
    if(!/(國道5|國5|Freeway 5|National Highway 5)/i.test(label)||!/(雪山|坪林|頭城|石碇)/.test(label))return null;
    return mergeKnown(section,live);
  }).filter(Boolean);
}
export function projectXueshanFromNormalized(sections,live){
  const sectionMap=new Map((sections||[]).map((x)=>[x.id,x]));
  return (live||[]).map((row)=>{
    const section=sectionMap.get(row.id);if(!section)return null;
    const label=`${section.roadName||""} ${section.name||""}`;
    if(!/(國道5|國5|Freeway 5|National Highway 5)/i.test(label)||!/(雪山|坪林|頭城|石碇)/.test(label))return null;
    return mergeKnown(section,row);
  }).filter(Boolean);
}
