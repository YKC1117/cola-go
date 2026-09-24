#!/usr/bin/env python3
import json, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL="https://opendata.tycg.gov.tw/api/dataset/f4cc0b12-86ac-40f9-8745-885bddc18f79/resource/0381e141-f7ee-450e-99da-2240208d1773/download"
OUT=Path("data/parking-live-taoyuan.json")

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
                data=json.load(response)
            if not isinstance(data,list):
                raise RuntimeError("Taoyuan payload is not a list")
            return data
        except Exception as exc:
            last=exc
            print("TAOYUAN_FETCH_RETRY",attempt,repr(exc),file=sys.stderr)
            if attempt<3:
                time.sleep(attempt*3)
    raise last

def number_or_none(value):
    try:
        text=str(value).replace(",","").strip()
        if not text or not text.lstrip("-").isdigit():
            return None
        return int(text)
    except Exception:
        return None

def float_or_none(value):
    try:
        return float(str(value).strip())
    except Exception:
        return None

def main():
    try:
        rows=fetch()
    except Exception as exc:
        print("TAOYUAN_PARKING_SYNC_FAILED",repr(exc),file=sys.stderr)
        return 0

    fetched=datetime.now(timezone.utc).isoformat()
    items=[]
    for row in rows:
        name=str(row.get("parkName","")).strip()
        if not name:
            continue
        # Official metadata names wgsX as latitude and wgsY as longitude.
        lat=float_or_none(row.get("wgsX"))
        lng=float_or_none(row.get("wgsY"))
        items.append({
            "id":str(row.get("parkId","")),
            "code":str(row.get("parkId","")),
            "name":name,
            "typeName":"路外停車場",
            "zone":str(row.get("areaName","")),
            "address":str(row.get("address","")),
            "car":number_or_none(row.get("surplusSpace")),
            "carTotal":number_or_none(row.get("totalSpace")),
            "green":None,
            "greenTotal":None,
            "evTotal":number_or_none(row.get("chargingSpaces")),
            "chargeTime":"依現場",
            "chargeFee":str(row.get("payGuide","")),
            "sourceUpdate":fetched,
            "lat":lat,
            "lng":lng,
        })

    if len(items)<50:
        print("TAOYUAN_PARKING_SYNC_SKIPPED: too few rows",len(items),file=sys.stderr)
        return 0

    numeric=sum(1 for x in items if x["car"] is not None)
    payload={
        "status":"live",
        "updatedAt":fetched,
        "fetchedAt":fetched,
        "source":"桃園市政府交通局｜桃園市路外停車資訊",
        "sourceUrl":URL,
        "items":items,
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("TAOYUAN_PARKING_SYNC_OK",len(items),"numeric",numeric,"updated",fetched)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
