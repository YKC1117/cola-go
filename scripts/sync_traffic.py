#!/usr/bin/env python3
import json, re, sys, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://tisvcloud.freeway.gov.tw/history/motc20"
SECTION_URL = f"{BASE}/Section.xml"
LIVE_URL = f"{BASE}/LiveTraffic.xml"
VD_URL = f"{BASE}/VDLive.xml"
OUT = Path("data")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent":"COLA-GO/1.0 (+https://github.com/YKC1117/cola-go)"})
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
        print("FETCH", url, r.status, r.headers.get("content-type"), len(data))
        return data

def lname(tag):
    return tag.rsplit("}",1)[-1]

def child_text(node, name, default=""):
    for c in list(node):
        if lname(c.tag).lower() == name.lower():
            return (c.text or "").strip()
    return default

def descendants(root, name):
    n=name.lower()
    return [e for e in root.iter() if lname(e.tag).lower()==n]

def road_no(*vals):
    s=" ".join(v for v in vals if v)
    for p in (r"國道\s*([1-6])", r"Freeway\s*No\.?\s*([1-6])"):
        m=re.search(p,s,re.I)
        if m: return m.group(1)
    return None

def speed_level(v):
    if v < 0: return "異常"
    if v >= 80: return "順暢"
    if v >= 60: return "車較多"
    if v >= 40: return "車多"
    if v >= 20: return "較壅塞"
    return "壅塞"

def parse_sections(data):
    root=ET.fromstring(data)
    nodes=descendants(root,"Section")
    out={}
    for x in nodes:
        sid=child_text(x,"SectionID")
        if not sid: continue
        item={k:child_text(x,k) for k in ["SectionID","SectionName","RoadID","RoadName","RoadDirection","SectionLength","SpeedLimit"]}
        # Some feeds use Start/End instead of SectionName.
        st=child_text(x,"Start"); en=child_text(x,"End")
        if not item["SectionName"] and (st or en): item["SectionName"]=f"{st} → {en}".strip(" →")
        item["road"]=road_no(item["RoadName"],item["SectionName"])
        out[sid]=item
    print("SECTIONS",len(out),"SAMPLE",list(out.values())[:3])
    return out

def parse_live(data, sections):
    root=ET.fromstring(data)
    candidates=descendants(root,"LiveTraffic")
    if not candidates:
        candidates=[e for e in root.iter() if child_text(e,"SectionID")]
    highways={str(i):[] for i in range(1,7)}
    newest=""
    raw_count=0
    for x in candidates:
        sid=child_text(x,"SectionID")
        if not sid: continue
        raw_count+=1
        try: speed=float(child_text(x,"TravelSpeed","-99"))
        except: speed=-99
        if speed==250: speed=-1
        collect=child_text(x,"DataCollectTime")
        newest=max(newest,collect)
        sec=sections.get(sid,{})
        rn=sec.get("road") or road_no(sec.get("RoadName",""),sec.get("SectionName",""))
        if rn not in highways: continue
        name=sec.get("SectionName") or sid
        direction=sec.get("RoadDirection","")
        highways[rn].append({
            "id":sid,"name":name,"direction":direction,"speed":round(speed,1),
            "level":speed_level(speed),"dataCollectTime":collect
        })
    for rn in highways:
        # de-duplicate while preserving source order
        seen=set(); arr=[]
        for x in highways[rn]:
            key=(x["id"],x["direction"])
            if key in seen: continue
            seen.add(key); arr.append(x)
        highways[rn]=arr
    print("LIVE",raw_count,"COUNTS",{k:len(v) for k,v in highways.items()})
    return {"updatedAt":newest or datetime.now(timezone.utc).isoformat(),"source":"交通部高速公路局 LiveTraffic.xml","status":"live","highways":highways}

def parse_vd(data):
    root=ET.fromstring(data)
    # Collect VD entries generically and retain lane speeds. LinkID is enough for later section mapping.
    vds=[]
    for node in root.iter():
        vdid=child_text(node,"VDID")
        link=child_text(node,"LinkID")
        if not vdid or not link: continue
        lanes=[]
        for lane in node.iter():
            if lname(lane.tag).lower()!="lane": continue
            lid=child_text(lane,"LaneID") or lane.attrib.get("LaneID") or lane.attrib.get("laneid") or lane.attrib.get("vsrid")
            speeds=[]
            for s in lane.iter():
                if lname(s.tag).lower()=="speed":
                    try:
                        v=float((s.text or "").strip())
                        if 0 < v < 200: speeds.append(v)
                    except: pass
            # TDX v2 stores speed inside Vehicles/Vehicle.
            if not speeds:
                for v in lane.iter():
                    if lname(v.tag).lower()=="vehicle":
                        try:
                            sp=float(child_text(v,"Speed","-1"))
                            if 0 < sp < 200: speeds.append(sp)
                        except: pass
            if speeds: lanes.append({"lane":str(lid or len(lanes)+1),"speed":round(sum(speeds)/len(speeds),1)})
        if lanes:
            vds.append({"vdid":vdid,"linkID":link,"lanes":lanes,"avg":round(sum(x["speed"] for x in lanes)/len(lanes),1)})
    print("VD",len(vds),"SAMPLE",vds[:2])
    return vds

def main():
    OUT.mkdir(exist_ok=True)
    sections=parse_sections(fetch(SECTION_URL))
    traffic=parse_live(fetch(LIVE_URL),sections)
    (OUT/"traffic.json").write_text(json.dumps(traffic,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    tunnel={"updatedAt":traffic["updatedAt"],"source":"交通部高速公路局","status":"live","south":[],"north":[]}
    # Section-level fallback for National Freeway 5 / Snow Mountain corridor.
    for row in traffic["highways"].get("5",[]):
        name=row["name"]
        if any(k in name for k in ["坪林","頭城","雪山","石碇"]):
            d=(row.get("direction") or "").upper()
            item={"name":name,"speed":row["speed"],"note":"國5即時路段速度","dataCollectTime":row["dataCollectTime"]}
            if any(k in d for k in ["S","南"]): tunnel["south"].append(item)
            elif any(k in d for k in ["N","北"]): tunnel["north"].append(item)
            else:
                tunnel["south"].append(item); tunnel["north"].append(item)
    (OUT/"tunnel.json").write_text(json.dumps(tunnel,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    # Probe VD endpoint for lane-level enhancement; failure must not break highway data.
    try:
        vds=parse_vd(fetch(VD_URL))
        (OUT/"vd-live.json").write_text(json.dumps({"updatedAt":datetime.now(timezone.utc).isoformat(),"source":VD_URL,"items":vds},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    except Exception as e:
        print("VD_PROBE_FAILED",repr(e),file=sys.stderr)

if __name__=="__main__":
    main()
