#!/usr/bin/env python3
import json, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL="https://motoretag.taichung.gov.tw/DataAPI/api/ParkingAPIV2/Opendata"
OUT=Path("data/parking-live-taichung.json")

def fetch():
    last=None
    for attempt in range(1,4):
        try:
            req=urllib.request.Request(URL,headers={
                "User-Agent":"COLA-GO/1.0 (+https://github.com/YKC1117/cola-go)",
                "Accept":"application/json",
                "Connection":"close",
            })
            with urllib.request.urlopen(req,timeout=30) as response:
                raw=response.read()
            data=json.loads(raw.decode("utf-8-sig","replace"))
            if not isinstance(data,list):
                raise RuntimeError("Taichung payload is not a list")
            return data
        except Exception as exc:
            last=exc
            print("TAICHUNG_FETCH_RETRY",attempt,repr(exc),file=sys.stderr)
            if attempt<3:
                time.sleep(attempt*3)
    raise last

def num(value):
    try:
        return int(float(str(value).strip()))
    except Exception:
        return None

def fnum(value):
    try:
        return float(str(value).strip())
    except Exception:
        return None

def zone_from_name(name):
    first=str(name).split("-",1)[0].strip()
    return first if first.endswith("區") else ""

def main():
    try:
        rows=fetch()
    except Exception as exc:
        print("TAICHUNG_PARKING_SYNC_FAILED",repr(exc),file=sys.stderr)
        return 0

    fetched=datetime.now(timezone.utc).isoformat()
    items=[]
    for row in rows:
        name=str(row.get("Position","")).strip()
        if not name:
            continue
        lat=fnum(row.get("Lat"))
        lng=fnum(row.get("Lng"))
        items.append({
            "id":str(row.get("ID","")),
            "code":str(row.get("ID","")),
            "name":name,
            "typeName":"路外停車場",
            "zone":zone_from_name(name),
            "address":"",
            "keyword":str(row.get("KeyWord","")),
            "mapQuery":"臺中市 "+name,
            "car":None,
            "carSignal":str(row.get("AvailableCarRGB","")).strip().upper(),
            "carTotal":num(row.get("TotalCar")),
            "green":None,
            "greenTotal":None,
            "evTotal":num(row.get("EvTotal")),
            "evSignal":str(row.get("EvRGB","")).strip().upper(),
            "chargeTime":"未提供",
            "chargeFee":"",
            "sourceUpdate":fetched,
            "lat":lat,
            "lng":lng,
        })

    if len(items)<500:
        print("TAICHUNG_PARKING_SYNC_SKIPPED: too few rows",len(items),file=sys.stderr)
        return 0

    payload={
        "status":"live",
        "availabilityMode":"signal",
        "updatedAt":fetched,
        "fetchedAt":fetched,
        "source":"臺中市政府交通局｜臺中市路外剩餘車位",
        "sourceUrl":URL,
        "items":items,
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    signals={}
    for x in items:
        signals[x["carSignal"]]=signals.get(x["carSignal"],0)+1
    print("TAICHUNG_PARKING_SYNC_OK",len(items),"signals",signals,"updated",fetched)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
