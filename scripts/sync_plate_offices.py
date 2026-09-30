#!/usr/bin/env python3
import csv
import hashlib
import io
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "plates" / "offices.json"
URL = "https://www.thb.gov.tw/Common/ThbOpenDataService.ashx?SN=556&format=1"
SOURCE_URL = "https://www.thb.gov.tw/News_Content_thbOpenData.aspx?n=13&s=556"
DATASET_URL = "https://data.gov.tw/dataset/14203"
TZ8 = timezone(timedelta(hours=8))

ALIASES = {
    "office": ("OrganizationName1", "監理所名稱"),
    "station": ("OrganizationName2", "監理(分)站名稱", "監理（分）站名稱"),
    "address": ("Address", "地址"),
    "tel": ("Tel", "電話"),
    "fax": ("Fax", "傳真"),
    "precinct": ("Precinct", "所轄區域(縣(市)、鄉鎮(市)", "所轄區域（縣（市），鄉鎮（市））"),
}

def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Unable to decode office directory CSV")

def clean_headers(row):
    return {
        str(k or "").strip().lstrip("\ufeff"): (v.strip() if isinstance(v, str) else v)
        for k, v in row.items()
    }

def pick(row, key):
    for alias in ALIASES[key]:
        if alias in row and str(row.get(alias) or "").strip():
            return str(row.get(alias) or "").strip()
    return ""

def stable_id(parts):
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:14]

def source_modified(headers):
    raw = headers.get("Last-Modified")
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TZ8).isoformat(timespec="seconds")
    except Exception:
        return None

def fetch():
    req = urllib.request.Request(URL, headers={
        "User-Agent": "COLA-GO/1.0 (+https://ykc1117.github.io/cola-go/)",
        "Accept": "text/csv,text/plain,application/octet-stream,*/*",
    })
    with urllib.request.urlopen(req, timeout=40) as res:
        raw = res.read()
        modified = source_modified(res.headers)
    if len(raw) < 100:
        raise RuntimeError("Office directory response is unexpectedly small")
    return raw, modified

def normalize_station(value):
    text = str(value or "").strip()
    return "" if text in ("-", "－", "—") else text

def main():
    raw, modified = fetch()
    text = decode_csv(raw).replace("\x00", "")
    reader = csv.DictReader(io.StringIO(text))
    items = []
    seen = set()

    for original in reader:
        row = clean_headers(original)
        office = pick(row, "office")
        station = normalize_station(pick(row, "station"))
        address = pick(row, "address")
        tel = pick(row, "tel")
        fax = pick(row, "fax")
        precinct = pick(row, "precinct")
        name = station or office

        if not (office and name and address):
            continue

        key = stable_id([office, station, address])
        if key in seen:
            continue
        seen.add(key)

        items.append({
            "id": key,
            "office": office,
            "station": station,
            "name": name,
            "address": address,
            "tel": tel,
            "fax": fax,
            "precinct": precinct,
        })

    if not items:
        raise RuntimeError("No office directory rows parsed; refusing to overwrite existing cache")

    items.sort(key=lambda x: (x.get("office") or "", x.get("station") or "", x.get("name") or ""))
    digest = hashlib.sha256(raw).hexdigest()
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}

    if previous.get("schema") == 1 and previous.get("sourceHash") == digest and previous.get("items") == items:
        print(f"UNCHANGED plate offices: {len(items)} rows")
        return

    payload = {
        "schema": 1,
        "status": "live",
        "source": "交通部公路局開放資料：監理所及轄站基本資料",
        "sourceUrl": SOURCE_URL,
        "datasetUrl": DATASET_URL,
        "downloadUrl": URL,
        "updatedAt": datetime.now(TZ8).isoformat(timespec="seconds"),
        "sourceUpdatedAt": modified,
        "sourceHash": digest,
        "count": len(items),
        "items": items,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"UPDATED plate offices: {len(items)} rows")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"plate office sync failed: {exc}", file=sys.stderr)
        raise
