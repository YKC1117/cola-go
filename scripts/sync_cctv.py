#!/usr/bin/env python3
import json, re, sys, time, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

URL = "https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml"
OUT = Path("data/cctv.json")

def fetch(tries=2, timeout=30):
    last = None
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(URL, headers={
                "User-Agent": "COLA-GO/1.0 (+https://github.com/YKC1117/cola-go)",
                "Accept": "application/xml,text/xml,*/*",
                "Connection": "close",
            })
            with urllib.request.urlopen(req, timeout=timeout) as response:
                data = response.read()
                print("FETCH", response.status, response.headers.get("content-type"), len(data))
                return data
        except Exception as exc:
            last = exc
            print("FETCH_RETRY", attempt, repr(exc), file=sys.stderr)
            if attempt < tries:
                time.sleep(5 * attempt)
    raise last

def lname(tag):
    return tag.rsplit("}", 1)[-1]

def child_text(node, name):
    target = name.lower()
    for child in list(node):
        if lname(child.tag).lower() == target:
            return (child.text or "").strip()
    return ""

def road_no(*values):
    text = " ".join(v for v in values if v)
    for pattern in (r"國道\s*([1-6])", r"Freeway(?:\s*No\.?)?\s*([1-6])"):
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1)
    return None

def safe_http(value):
    value = str(value or "").strip()
    return value if value.startswith("https://") or value.startswith("http://") else ""

def number(value):
    try:
        return float(value)
    except Exception:
        return None

def parse(data):
    root = ET.fromstring(data)
    items, seen = [], set()
    for node in root.iter():
        cid = child_text(node, "CCTVID")
        stream = safe_http(child_text(node, "VideoStreamURL"))
        if not cid or not stream or cid in seen:
            continue
        seen.add(cid)
        road = child_text(node, "RoadName")
        start = child_text(node, "Start")
        end = child_text(node, "End")
        items.append({
            "id": cid,
            "stream": stream,
            "road": road,
            "roadNo": road_no(road, start, end),
            "direction": child_text(node, "RoadDirection"),
            "mile": child_text(node, "LocationMile"),
            "start": start,
            "end": end,
            "lat": number(child_text(node, "PositionLat")),
            "lon": number(child_text(node, "PositionLon")),
        })
    return items

def main():
    try:
        items = parse(fetch())
        if not items:
            raise RuntimeError("No CCTV rows parsed")
    except Exception as exc:
        print("CCTV_SYNC_FAILED", repr(exc), file=sys.stderr)
        return 0

    payload = {
        "status": "ready",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "交通部高速公路局 CCTV.xml",
        "items": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("CCTV_SYNC_OK", len(items))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
