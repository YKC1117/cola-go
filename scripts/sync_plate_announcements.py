#!/usr/bin/env python3
import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "plates" / "announcements.json"
URL = "https://www.thb.gov.tw/Common/ThbOpenDataService.ashx?SN=506&format=1"
SOURCE_URL = "https://www.thb.gov.tw/News_Content_thbOpenData.aspx?n=13&s=506"
DATASET_URL = "https://data.gov.tw/dataset/96623"
TZ8 = timezone(timedelta(hours=8))

ALIASES = {
    "office": ("VehiclesOffice", "監理單位"),
    "category": ("BidCategory", "號牌類別"),
    "start_number": ("StartingNumber", "號牌起號"),
    "end_number": ("EndingNumber", "號牌迄號"),
    "start_date": ("StartDate", "起標時間"),
    "end_date": ("EndDate", "決標時間"),
    "transfer_deadline": ("DeadlineOfTransfer", "轉帳截止時間"),
}

def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Unable to decode plate announcement CSV")

def clean_headers(row):
    return {str(k or "").strip().lstrip("\ufeff"): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}

def pick(row, key):
    for alias in ALIASES[key]:
        if alias in row and str(row.get(alias) or "").strip():
            return str(row.get(alias) or "").strip()
    return ""

def parse_official_time(value):
    text = str(value or "").strip()
    if not text:
        return None
    digits = re.sub(r"\D", "", text)
    try:
        if len(digits) >= 14 and int(digits[:4]) >= 1900:
            y, mo, d, h, mi, s = int(digits[:4]), int(digits[4:6]), int(digits[6:8]), int(digits[8:10]), int(digits[10:12]), int(digits[12:14])
        elif len(digits) >= 13:
            y, mo, d, h, mi, s = int(digits[:3]) + 1911, int(digits[3:5]), int(digits[5:7]), int(digits[7:9]), int(digits[9:11]), int(digits[11:13])
        else:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=TZ8)
            return parsed.astimezone(TZ8).isoformat(timespec="seconds")
        return datetime(y, mo, d, h, mi, s, tzinfo=TZ8).isoformat(timespec="seconds")
    except Exception:
        return None

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
        "Accept": "text/csv,text/plain,*/*",
    })
    with urllib.request.urlopen(req, timeout=40) as res:
        raw = res.read()
        modified = source_modified(res.headers)
    if len(raw) < 100:
        raise RuntimeError("Plate announcement response is unexpectedly small")
    return raw, modified

def main():
    raw, modified = fetch()
    text = decode_csv(raw).replace("\x00", "")
    reader = csv.DictReader(io.StringIO(text))
    items = []
    seen = set()
    for original in reader:
        row = clean_headers(original)
        office = pick(row, "office")
        category = pick(row, "category")
        start_number = pick(row, "start_number").upper()
        end_number = pick(row, "end_number").upper()
        start_raw = pick(row, "start_date")
        end_raw = pick(row, "end_date")
        deadline_raw = pick(row, "transfer_deadline")
        if not (office and start_number and end_number):
            continue
        start_at = parse_official_time(start_raw)
        end_at = parse_official_time(end_raw)
        deadline = parse_official_time(deadline_raw)
        key = stable_id([office, category, start_number, end_number, start_raw, end_raw])
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "id": key,
            "office": office,
            "category": category,
            "startNumber": start_number,
            "endNumber": end_number,
            "startAt": start_at,
            "endAt": end_at,
            "transferDeadline": deadline,
        })
    if not items:
        raise RuntimeError("No plate announcement rows parsed; refusing to overwrite existing cache")
    items.sort(key=lambda x: (x.get("startAt") or "9999", x.get("office") or "", x.get("startNumber") or ""))
    digest = hashlib.sha256(raw).hexdigest()
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}
    if previous.get("schema") == 1 and previous.get("sourceHash") == digest and previous.get("items") == items:
        print(f"UNCHANGED plate announcements: {len(items)} rows")
        return
    payload = {
        "schema": 1,
        "status": "live",
        "source": "交通部公路局開放資料：標牌公告",
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
    print(f"UPDATED plate announcements: {len(items)} rows")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"plate sync failed: {exc}", file=sys.stderr)
        raise
