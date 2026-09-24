#!/usr/bin/env python3
import json, re, sys, time, urllib.request
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

URL = "https://data.tainan.gov.tw/Resource/91073f40-d251-42cc-9f4c-88e8937c9911?handler=GoJson"
OUT = Path("data/parking-live-tainan.json")

FIELDS = [
    "typeId","typeName","id","code","name","zoneId","zone","address",
    "largeCar","car","carDis","carWoman","carGreen","moto","motoDis",
    "largeCar_total","car_total","carDis_total","carWoman_total",
    "carGreen_total","moto_total","motoDis_total","chargeTime",
    "chargeFee","update_time","lnglat"
]

def fetch():
    last=None
    for attempt in range(1,4):
        try:
            req=urllib.request.Request(URL,headers={
                "User-Agent":"COLA-GO/1.0 (+https://github.com/YKC1117/cola-go)",
                "Accept":"application/json,text/html,*/*",
                "Connection":"close",
            })
            with urllib.request.urlopen(req,timeout=35) as response:
                data=response.read()
                print("FETCH",response.status,response.headers.get("content-type"),len(data))
                return data.decode("utf-8-sig","replace")
        except Exception as exc:
            last=exc
            print("FETCH_RETRY",attempt,repr(exc),file=sys.stderr)
            if attempt<3:
                time.sleep(attempt*5)
    raise last

def normalize_payload(value):
    if isinstance(value,list):
        return value
    if isinstance(value,dict):
        for key in ("data","Data","result","Result","items","Items"):
            if isinstance(value.get(key),list):
                return value[key]
    return []

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows=[]
        self.row=None
        self.cell=None
        self.buf=[]
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        if tag=="tr":
            self.row=[]
        elif tag in ("td","th") and self.row is not None:
            self.cell=tag
            self.buf=[]
    def handle_data(self,data):
        if self.cell:
            self.buf.append(data)
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag in ("td","th") and self.cell:
            self.row.append(" ".join("".join(self.buf).split()))
            self.cell=None
            self.buf=[]
        elif tag=="tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row=None

def parse(text):
    try:
        rows=normalize_payload(json.loads(text))
        if rows:
            return rows
    except Exception:
        pass

    plain=unescape(re.sub(r"<[^>]+>"," ",text))
    matches=re.findall(r'\{[^{}]*"typeId"\s*:\s*[^{}]*"lnglat"\s*:\s*"[^"]*"[^{}]*\}',plain,re.S)
    rows=[]
    for block in matches:
        try:
            rows.append(json.loads(block))
        except Exception:
            pass
    if rows:
        return rows

    parser=TableParser()
    parser.feed(text)
    parsed=[]
    for row in parser.rows:
        if len(row)<len(FIELDS):
            continue
        if row[0] in ("typeId","停車場類型"):
            continue
        if not re.fullmatch(r"\d+",row[0] or ""):
            continue
        parsed.append(dict(zip(FIELDS,row[:len(FIELDS)])))
    return parsed

def number(value,default=0):
    try:
        return int(float(str(value).replace(",","").strip()))
    except Exception:
        return default

def main():
    try:
        text=fetch()
        rows=parse(text)
        if not rows:
            raise RuntimeError("No parking rows parsed")
    except Exception as exc:
        print("PARKING_SYNC_FAILED",repr(exc),file=sys.stderr)
        return 0

    items=[]
    newest=""
    for row in rows:
        name=str(row.get("name","")).strip()
        if not name:
            continue
        update=str(row.get("update_time","")).strip()
        if update>newest:
            newest=update
        lat=lng=None
        coords=str(row.get("lnglat","")).strip().split(",")
        if len(coords)==2:
            try:
                lat=float(coords[0]); lng=float(coords[1])
            except Exception:
                pass
        items.append({
            "id":str(row.get("id","")),
            "code":str(row.get("code","")),
            "name":name,
            "typeName":str(row.get("typeName","")),
            "zone":str(row.get("zone","")),
            "address":str(row.get("address","")),
            "car":number(row.get("car")),
            "carTotal":number(row.get("car_total")),
            "green":number(row.get("carGreen")),
            "greenTotal":number(row.get("carGreen_total")),
            "chargeTime":str(row.get("chargeTime","")),
            "chargeFee":str(row.get("chargeFee","")),
            "sourceUpdate":update,
            "lat":lat,
            "lng":lng,
        })

    if len(items)<5:
        print("PARKING_SYNC_SKIPPED: parsed too few rows",len(items),file=sys.stderr)
        return 0

    payload={
        "status":"live",
        "updatedAt":newest or datetime.now(timezone.utc).isoformat(),
        "fetchedAt":datetime.now(timezone.utc).isoformat(),
        "source":"臺南市政府交通局｜臺南市停車場即時剩餘車位資訊",
        "sourceUrl":URL,
        "items":items,
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PARKING_SYNC_OK",len(items),"updated",payload["updatedAt"])
    return 0

if __name__=="__main__":
    raise SystemExit(main())
