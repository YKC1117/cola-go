#!/usr/bin/env python3
import json, re, sys, time, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://tisvcloud.freeway.gov.tw/history/motc20"
SECTION_URL = f"{BASE}/Section.xml"
LIVE_URL = f"{BASE}/LiveTraffic.xml"
VD_URL = f"{BASE}/VDLive.xml"
OUT = Path("data")
SECTION_CACHE = OUT / "sections-cache.json"

def fetch(url, tries=2, timeout=30):
    last = None
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "COLA-GO/1.0 (+https://github.com/YKC1117/cola-go)",
                    "Accept": "application/xml,text/xml,*/*",
                    "Connection": "close",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                print("FETCH", url, r.status, r.headers.get("content-type"), len(data))
                return data
        except Exception as e:
            last = e
            print(f"FETCH_RETRY {attempt}/{tries} {url}: {e}", file=sys.stderr)
            if attempt < tries:
                time.sleep(8 * attempt)
    raise last

def lname(tag):
    return tag.rsplit("}", 1)[-1]

def child_text(node, name, default=""):
    for c in list(node):
        if lname(c.tag).lower() == name.lower():
            return (c.text or "").strip()
    return default

def descendants(root, name):
    n = name.lower()
    return [e for e in root.iter() if lname(e.tag).lower() == n]

def road_no(*vals):
    s = " ".join(v for v in vals if v)
    for p in (r"國道\s*([1-6])", r"Freeway\s*No\.?\s*([1-6])"):
        m = re.search(p, s, re.I)
        if m:
            return m.group(1)
    return None

def speed_level(v):
    if v < 0:
        return "異常"
    if v >= 80:
        return "順暢"
    if v >= 60:
        return "車較多"
    if v >= 40:
        return "車多"
    if v >= 20:
        return "較壅塞"
    return "壅塞"

def parse_sections(data):
    root = ET.fromstring(data)
    out = {}
    for x in descendants(root, "Section"):
        sid = child_text(x, "SectionID")
        if not sid:
            continue
        item = {k: child_text(x, k) for k in [
            "SectionID", "SectionName", "RoadID", "RoadName",
            "RoadDirection", "SectionLength", "SpeedLimit"
        ]}
        st, en = child_text(x, "Start"), child_text(x, "End")
        if not item["SectionName"] and (st or en):
            item["SectionName"] = f"{st} → {en}".strip(" →")
        item["road"] = road_no(item["RoadName"], item["SectionName"])
        out[sid] = item
    print("SECTIONS", len(out))
    return out

def load_sections():
    try:
        sections = parse_sections(fetch(SECTION_URL))
        SECTION_CACHE.write_text(
            json.dumps(sections, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        return sections
    except Exception as e:
        print("SECTION_FETCH_FAILED", repr(e), file=sys.stderr)
        if SECTION_CACHE.exists():
            print("USING_SECTION_CACHE", SECTION_CACHE)
            return json.loads(SECTION_CACHE.read_text(encoding="utf-8"))
        return None

def parse_live(data, sections):
    root = ET.fromstring(data)
    candidates = descendants(root, "LiveTraffic")
    if not candidates:
        candidates = [e for e in root.iter() if child_text(e, "SectionID")]
    highways = {str(i): [] for i in range(1, 7)}
    newest = ""
    for x in candidates:
        sid = child_text(x, "SectionID")
        if not sid:
            continue
        try:
            speed = float(child_text(x, "TravelSpeed", "-99"))
        except Exception:
            speed = -99
        if speed == 250:
            speed = -1
        collect = child_text(x, "DataCollectTime")
        newest = max(newest, collect)
        sec = sections.get(sid, {})
        rn = sec.get("road") or road_no(sec.get("RoadName", ""), sec.get("SectionName", ""))
        if rn not in highways:
            continue
        highways[rn].append({
            "id": sid,
            "name": sec.get("SectionName") or sid,
            "direction": sec.get("RoadDirection", ""),
            "speed": round(speed, 1),
            "level": speed_level(speed),
            "dataCollectTime": collect,
        })
    total = sum(len(v) for v in highways.values())
    if total == 0:
        raise RuntimeError("LiveTraffic parsed but no freeway sections could be mapped")
    print("LIVE_COUNTS", {k: len(v) for k, v in highways.items()})
    return {
        "updatedAt": newest or datetime.now(timezone.utc).isoformat(),
        "source": "交通部高速公路局 LiveTraffic.xml",
        "status": "live",
        "highways": highways,
    }

def parse_vd(data):
    root = ET.fromstring(data)
    vds = []
    for node in root.iter():
        vdid, link = child_text(node, "VDID"), child_text(node, "LinkID")
        if not vdid or not link:
            continue
        lanes = []
        for lane in node.iter():
            if lname(lane.tag).lower() != "lane":
                continue
            lid = child_text(lane, "LaneID") or lane.attrib.get("LaneID") or lane.attrib.get("laneid")
            speeds = []
            for v in lane.iter():
                if lname(v.tag).lower() == "vehicle":
                    try:
                        sp = float(child_text(v, "Speed", "-1"))
                        if 0 < sp < 200:
                            speeds.append(sp)
                    except Exception:
                        pass
            if speeds:
                lanes.append({"lane": str(lid or len(lanes) + 1), "speed": round(sum(speeds) / len(speeds), 1)})
        if lanes:
            vds.append({"vdid": vdid, "linkID": link, "lanes": lanes, "avg": round(sum(x["speed"] for x in lanes) / len(lanes), 1)})
    return vds

def main():
    OUT.mkdir(exist_ok=True)
    sections = load_sections()
    if not sections:
        print("SYNC_SKIPPED: official Section.xml unavailable and no local cache yet")
        return 0

    try:
        traffic = parse_live(fetch(LIVE_URL), sections)
    except Exception as e:
        print("SYNC_SKIPPED: official LiveTraffic.xml unavailable:", repr(e), file=sys.stderr)
        return 0

    (OUT / "traffic.json").write_text(
        json.dumps(traffic, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    tunnel = {
        "updatedAt": traffic["updatedAt"],
        "source": "交通部高速公路局",
        "status": "live",
        "south": [],
        "north": [],
    }
    for row in traffic["highways"].get("5", []):
        name = row["name"]
        if any(k in name for k in ["坪林", "頭城", "雪山", "石碇"]):
            d = (row.get("direction") or "").upper()
            item = {
                "name": name,
                "speed": row["speed"],
                "note": "國5即時路段速度",
                "dataCollectTime": row["dataCollectTime"],
            }
            if any(k in d for k in ["S", "南"]):
                tunnel["south"].append(item)
            elif any(k in d for k in ["N", "北"]):
                tunnel["north"].append(item)

    (OUT / "tunnel.json").write_text(
        json.dumps(tunnel, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    try:
        vds = parse_vd(fetch(VD_URL, tries=1, timeout=25))
        (OUT / "vd-live.json").write_text(
            json.dumps({
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "source": VD_URL,
                "items": vds,
            }, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    except Exception as e:
        print("VD_OPTIONAL_FAILED", repr(e), file=sys.stderr)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())