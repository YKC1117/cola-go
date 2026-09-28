#!/usr/bin/env python3
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

TOKEN_URL="https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
API="https://tdx.transportdata.tw/api/basic"
OUT=Path("data/tdx")
PARK=OUT/"parking"
CITIES=[
("Taipei","臺北市"),("NewTaipei","新北市"),("Taoyuan","桃園市"),("Taichung","臺中市"),("Tainan","臺南市"),
("Kaohsiung","高雄市"),("Keelung","基隆市"),("Hsinchu","新竹市"),("HsinchuCounty","新竹縣"),("MiaoliCounty","苗栗縣"),
("ChanghuaCounty","彰化縣"),("NantouCounty","南投縣"),("YunlinCounty","雲林縣"),("Chiayi","嘉義市"),("ChiayiCounty","嘉義縣"),
("PingtungCounty","屏東縣"),("YilanCounty","宜蘭縣"),("HualienCounty","花蓮縣"),("TaitungCounty","臺東縣"),
("PenghuCounty","澎湖縣"),("KinmenCounty","金門縣"),("LienchiangCounty","連江縣")]
PARK_BASIC={c for c,_ in CITIES if c!="NewTaipei"}
PARK_LIVE={"Taipei","Taoyuan","Taichung","Tainan","Kaohsiung","Keelung","ChanghuaCounty","YunlinCounty","PingtungCounty","YilanCounty","HualienCounty","KinmenCounty"}
EV_CITIES={c for c,_ in CITIES if c!="LienchiangCounty"}
MIN_INTERVAL=float(os.environ.get("TDX_MIN_INTERVAL","12.5"))
last_call=0.0

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def request(url, *, data=None, headers=None, timeout=45):
    global last_call
    if url.startswith(API):
        wait=MIN_INTERVAL-(time.monotonic()-last_call)
        if wait>0: time.sleep(wait)
        last_call=time.monotonic()
    req=urllib.request.Request(url,data=data,headers=headers or {})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.load(r)

def token():
    cid=os.environ.get("TDX_CLIENT_ID","")
    secret=os.environ.get("TDX_CLIENT_SECRET","")
    if not cid or not secret:
        raise SystemExit("TDX_CLIENT_ID / TDX_CLIENT_SECRET missing")
    body=urllib.parse.urlencode({"grant_type":"client_credentials","client_id":cid,"client_secret":secret}).encode()
    p=request(TOKEN_URL,data=body,headers={"Content-Type":"application/x-www-form-urlencoded","User-Agent":"COLA-GO/1.0"})
    if not p.get("access_token"): raise RuntimeError("TDX OAuth response missing access_token")
    return p["access_token"]

def api_get(tok,path,top=1000):
    q=urllib.parse.urlencode({"$format":"JSON","$top":str(top)})
    return request(API+path+"?"+q,headers={"Authorization":"Bearer "+tok,"Accept":"application/json","User-Agent":"COLA-GO/1.0"})

def items(payload):
    if isinstance(payload,list): return payload
    if isinstance(payload,dict):
        for v in payload.values():
            if isinstance(v,list): return v
    return []

def zh(v):
    if isinstance(v,str): return v
    if isinstance(v,dict):
        return v.get("Zh_tw") or v.get("ZhTw") or v.get("zh_tw") or v.get("En") or ""
    return ""

def pos(x):
    p=x.get("CarParkPosition") or x.get("StationPosition") or x.get("Position") or x
    def n(v):
        try: return float(v)
        except: return None
    return n(p.get("PositionLat") or p.get("Latitude")),n(p.get("PositionLon") or p.get("Longitude"))

def availability(x):
    total=x.get("TotalSpaces")
    avail=x.get("AvailableSpaces")
    rows=x.get("Availabilities") if isinstance(x.get("Availabilities"),list) else []
    car=next((v for v in rows if str(v.get("SpaceType"))=="1"), rows[0] if rows else {})
    if total is None: total=car.get("NumberOfSpaces",car.get("NumberOfSpace"))
    if avail is None: avail=car.get("AvailableSpaces",car.get("AvailableSpace"))
    def num(v):
        try: return int(float(v))
        except: return None
    return num(total),num(avail)

def load_old(path,default):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except: return default

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

def sync_parking(tok, bootstrap):
    for city,city_name in CITIES:
        path=PARK/f"{city}.json"
        old=load_old(path,{"items":[]})
        basics={}
        if bootstrap or not old.get("items"):
            if city in PARK_BASIC:
                try:
                    raw=items(api_get(tok,f"/v1/Parking/OffStreet/CarPark/City/{city}"))
                    for x in raw:
                        sid=str(x.get("CarParkID") or "")
                        if not sid: continue
                        lat,lon=pos(x)
                        basics[sid]={"id":sid,"city":city,"cityName":city_name,"name":zh(x.get("CarParkName")) or sid,
                          "town":str(x.get("TownName") or x.get("District") or ""),"address":str(x.get("Address") or x.get("CarParkAddress") or ""),
                          "fare":str(x.get("FareDescription") or x.get("FareDescriptionText") or ""),"total":x.get("TotalSpaces") or x.get("NumberOfSpaces") or 0,
                          "available":None,"dataCollectTime":"","lat":lat,"lon":lon,"sourceType":"basic"}
                except Exception as e:
                    print("PARK_BASIC_FAIL",city,repr(e),file=sys.stderr)
            else:
                basics={str(x.get("id")):x for x in old.get("items",[]) if x.get("id")}
        else:
            basics={str(x.get("id")):x for x in old.get("items",[]) if x.get("id")}
        if city in PARK_LIVE:
            try:
                raw=items(api_get(tok,f"/v1/Parking/OffStreet/ParkingAvailability/City/{city}"))
                for x in raw:
                    sid=str(x.get("CarParkID") or "")
                    if not sid: continue
                    total,avail=availability(x)
                    row=basics.get(sid)
                    if row:
                        if total is not None: row["total"]=total
                        row["available"]=avail
                        row["dataCollectTime"]=str(x.get("DataCollectTime") or x.get("UpdateTime") or "")
                        row["sourceType"]="live"
            except Exception as e:
                print("PARK_LIVE_FAIL",city,repr(e),file=sys.stderr)
        rows=list(basics.values())
        if rows:
            save(path,{"status":"live" if city in PARK_LIVE else "official","updatedAt":now(),"source":"TDX／交通部","city":city,"cityName":city_name,"items":rows})
            print("PARK",city,len(rows))

def connector_summary(x):
    rows=x.get("Connectors") or x.get("ConnectorTypes") or []
    if not isinstance(rows,list): return []
    out=[]
    for c in rows:
        t=c.get("ConnectorType") or c.get("Type") or c.get("ChargingType")
        p=c.get("MaxPower") or c.get("MaxPowerKW") or c.get("Power")
        out.append({"type":t,"power":p})
    return out

def sync_charging(tok, bootstrap):
    path=OUT/"charging.json"
    if not bootstrap and path.exists(): return
    rows=[]
    for city,city_name in CITIES:
        if city not in EV_CITIES: continue
        try:
            raw=items(api_get(tok,f"/v1/EV/Station/City/{city}"))
            for x in raw:
                sid=str(x.get("StationID") or x.get("ChargingStationID") or "")
                lat,lon=pos(x)
                cons=connector_summary(x)
                types=sorted({str(c["type"]) for c in cons if c.get("type")})
                powers=[]
                for c in cons:
                    try: powers.append(float(c.get("power")))
                    except: pass
                rows.append({"id":f"{city}:{sid}" if sid else f"{city}:{len(rows)}","city":city,"cityName":city_name,
                  "name":zh(x.get("StationName")) or zh(x.get("Name")) or sid or "充電站","location":str(x.get("Address") or city_name),
                  "operator":str(x.get("OperatorID") or x.get("OperatorId") or "TDX"),"connectors":types,
                  "power":(str(int(max(powers)))+" kW") if powers else "功率依現場","spaces":(len(x.get("ChargingPoints")) if isinstance(x.get("ChargingPoints"),list) else (x.get("TotalChargingPoints") or "—")),
                  "lat":lat,"lon":lon,"road":"tdx","direction":city_name,"note":"TDX 官方充電站"})
            print("EV",city,len(raw))
        except Exception as e:
            print("EV_FAIL",city,repr(e),file=sys.stderr)
    if rows: save(path,{"status":"official","updatedAt":now(),"source":"TDX／交通部","items":rows})

def sync_cctv(tok):
    try:
        raw=items(api_get(tok,"/v2/Road/Traffic/CCTV/Freeway"))
        rows=[]
        for x in raw:
            sid=str(x.get("CCTVID") or x.get("CCTVId") or "")
            if not sid: continue
            road=str(x.get("RoadName") or "")
            m=re.search(r"(?:國道|Freeway\\s*(?:No\\.?\\s*)?)([1-6])",road,re.I)
            road_no=m.group(1) if m else ""
            stream=x.get("VideoStreamURL") or x.get("StreamURL") or x.get("ImageURL") or x.get("ImageUrl") or ""
            rows.append({"id":sid,"road":road,"roadNo":road_no,"direction":str(x.get("RoadDirection") or ""),
              "mile":str(x.get("LocationMile") or x.get("LocationDescription") or ""),"start":"","end":"",
              "lat":float(x.get("PositionLat")) if x.get("PositionLat") is not None else None,
              "lon":float(x.get("PositionLon")) if x.get("PositionLon") is not None else None,"stream":stream})
        if rows: save(OUT/"cctv.json",{"status":"official","updatedAt":now(),"source":"TDX／交通部","items":rows})
        print("CCTV",len(rows))
    except Exception as e:
        print("CCTV_FAIL",repr(e),file=sys.stderr)

def main():
    OUT.mkdir(parents=True,exist_ok=True); PARK.mkdir(parents=True,exist_ok=True)
    tok=token()
    bootstrap=os.environ.get("TDX_BOOTSTRAP","0")=="1"
    sync_parking(tok,bootstrap)
    sync_charging(tok,bootstrap)
    sync_cctv(tok)
    save(OUT/"status.json",{"status":"official","updatedAt":now(),"source":"TDX／交通部","mode":"GitHub Actions protected secret cache"})
    return 0

if __name__=="__main__": raise SystemExit(main())
