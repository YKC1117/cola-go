#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
API = "https://tdx.transportdata.tw/api/basic"
OUT = Path("data/tdx")
PARK = OUT / "parking"

CITIES = [
    ("Taipei", "臺北市"), ("NewTaipei", "新北市"), ("Taoyuan", "桃園市"),
    ("Taichung", "臺中市"), ("Tainan", "臺南市"), ("Kaohsiung", "高雄市"),
    ("Keelung", "基隆市"), ("Hsinchu", "新竹市"), ("HsinchuCounty", "新竹縣"),
    ("MiaoliCounty", "苗栗縣"), ("ChanghuaCounty", "彰化縣"),
    ("NantouCounty", "南投縣"), ("YunlinCounty", "雲林縣"),
    ("Chiayi", "嘉義市"), ("ChiayiCounty", "嘉義縣"),
    ("PingtungCounty", "屏東縣"), ("YilanCounty", "宜蘭縣"),
    ("HualienCounty", "花蓮縣"), ("TaitungCounty", "臺東縣"),
    ("PenghuCounty", "澎湖縣"), ("KinmenCounty", "金門縣"),
    ("LienchiangCounty", "連江縣"),
]
CITY_NAMES = dict(CITIES)
PARK_BASIC = {c for c, _ in CITIES if c != "NewTaipei"}
PARK_LIVE = {
    "Taipei", "Taoyuan", "Taichung", "Tainan", "Kaohsiung", "Keelung",
    "ChanghuaCounty", "YunlinCounty", "PingtungCounty", "YilanCounty",
    "HualienCounty", "KinmenCounty",
}
EV_CITIES = {c for c, _ in CITIES if c != "LienchiangCounty"}

MIN_INTERVAL = float(os.environ.get("TDX_MIN_INTERVAL", "13"))
SYNC_MODE = os.environ.get("TDX_SYNC_MODE", "all").strip().lower()
if os.environ.get("TDX_BOOTSTRAP") == "1":
    SYNC_MODE = "all"
if SYNC_MODE not in {"all", "static", "dynamic"}:
    raise SystemExit("TDX_SYNC_MODE must be all, static, or dynamic")

last_call = 0.0


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def request(url, *, data=None, headers=None, timeout=50):
    global last_call
    if url.startswith(API):
        wait = MIN_INTERVAL - (time.monotonic() - last_call)
        if wait > 0:
            time.sleep(wait)
        last_call = time.monotonic()

    req = urllib.request.Request(url, data=data, headers=headers or {})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 4:
                delay = max(35, int(error.headers.get("Retry-After") or 35))
                print("TDX_RATE_LIMIT", delay, "seconds", file=sys.stderr, flush=True)
                time.sleep(delay)
                last_call = time.monotonic()
                continue
            raise


def token():
    client_id = os.environ.get("TDX_CLIENT_ID", "")
    client_secret = os.environ.get("TDX_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise SystemExit("TDX_CLIENT_ID / TDX_CLIENT_SECRET missing")

    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode()
    payload = request(
        TOKEN_URL,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "COLA-GO/1.0",
        },
    )
    if not payload.get("access_token"):
        raise RuntimeError("TDX OAuth response missing access_token")
    return payload["access_token"]


def items(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                return value
    return []


def api_page(tok, path, *, top=1000, skip=0):
    query = urllib.parse.urlencode({
        "$format": "JSON",
        "$top": str(top),
        "$skip": str(skip),
    })
    return request(
        API + path + "?" + query,
        headers={
            "Authorization": "Bearer " + tok,
            "Accept": "application/json",
            "User-Agent": "COLA-GO/1.0",
        },
    )


def api_all(tok, path, *, page_size=1000, max_pages=20):
    rows = []
    for page in range(max_pages):
        batch = items(api_page(tok, path, top=page_size, skip=page * page_size))
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
    raise RuntimeError(f"TDX pagination exceeded {max_pages} pages: {path}")


def zh(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return (
            value.get("Zh_tw") or value.get("ZhTw") or value.get("zh_tw")
            or value.get("En") or ""
        )
    return ""


def number(value):
    try:
        result = float(value)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def integer(value):
    value = number(value)
    return int(value) if value is not None else None


def pos(record):
    value = (
        record.get("CarParkPosition") or record.get("StationPosition")
        or record.get("Position") or record
    )
    return (
        number(value.get("PositionLat") or value.get("Latitude")),
        number(value.get("PositionLon") or value.get("Longitude")),
    )


def load_old(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {} if default is None else default


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def useful(snapshot):
    if not isinstance(snapshot, dict):
        return False
    if snapshot.get("items"):
        return True
    highways = snapshot.get("highways")
    if isinstance(highways, dict) and any(highways.values()):
        return True
    if snapshot.get("south") or snapshot.get("north"):
        return True
    return False


def stale_or_unavailable(path, *, source="TDX／交通部", message="TDX 暫時無法更新"):
    stamp = now()
    old = load_old(path, {})
    if useful(old):
        old["status"] = "stale"
        old["stale"] = True
        old["lastAttemptAt"] = stamp
        old["message"] = message
        old.setdefault("source", source)
        save(path, old)
        return old
    empty = {
        "status": "unavailable",
        "stale": True,
        "updatedAt": None,
        "lastAttemptAt": stamp,
        "source": source,
        "message": message,
        "items": [],
    }
    save(path, empty)
    return empty


def max_source_time(rows, *keys):
    values = []
    for row in rows:
        for key in keys:
            value = row.get(key)
            if value:
                values.append(str(value))
                break
    return max(values) if values else None


def parking_availability(record):
    total = record.get("TotalSpaces")
    available = record.get("AvailableSpaces")
    rows = record.get("Availabilities") if isinstance(record.get("Availabilities"), list) else []
    car = next((v for v in rows if str(v.get("SpaceType")) == "1"), rows[0] if rows else {})
    if total is None:
        total = car.get("NumberOfSpaces", car.get("NumberOfSpace"))
    if available is None:
        available = car.get("AvailableSpaces", car.get("AvailableSpace"))
    return integer(total), integer(available)


def normalize_parking_basic(record, city, city_name):
    source_id = str(record.get("CarParkID") or record.get("ParkingID") or "")
    if not source_id:
        return None
    lat, lon = pos(record)
    return {
        "id": source_id,
        "city": city,
        "cityName": city_name,
        "name": zh(record.get("CarParkName")) or source_id,
        "town": str(record.get("TownName") or record.get("District") or ""),
        "address": str(record.get("Address") or record.get("CarParkAddress") or ""),
        "fare": str(record.get("FareDescription") or record.get("FareDescriptionText") or ""),
        "total": integer(record.get("TotalSpaces") or record.get("NumberOfSpaces")) or 0,
        "available": None,
        "dataCollectTime": "",
        "lat": lat,
        "lon": lon,
        "sourceType": "basic",
    }


def sync_parking_static(tok):
    for city, city_name in CITIES:
        path = PARK / f"{city}.json"
        old = load_old(path, {})
        if city not in PARK_BASIC:
            if useful(old):
                continue
            save(path, {
                "status": "unavailable",
                "stale": False,
                "updatedAt": None,
                "lastAttemptAt": now(),
                "source": "TDX／交通部",
                "city": city,
                "cityName": city_name,
                "message": "TDX 此資料集未提供此縣市停車場基本資料",
                "items": [],
            })
            print("PARK_STATIC_UNSUPPORTED", city)
            continue

        try:
            raw = api_all(tok, f"/v1/Parking/OffStreet/CarPark/City/{city}")
            rows = [normalize_parking_basic(x, city, city_name) for x in raw]
            rows = [x for x in rows if x]
            if not rows:
                raise RuntimeError("TDX returned no parking basic rows")

            old_by_id = {
                str(x.get("id")): x for x in old.get("items", [])
                if isinstance(x, dict) and x.get("id")
            }
            for row in rows:
                previous = old_by_id.get(row["id"], {})
                if previous.get("available") is not None:
                    row["available"] = previous.get("available")
                    row["dataCollectTime"] = previous.get("dataCollectTime") or ""
                    row["sourceType"] = previous.get("sourceType") or "live"

            stamp = now()
            live_updated = old.get("liveUpdatedAt")
            stale = bool(old.get("stale")) if live_updated else False
            status = old.get("status") if live_updated else "official"
            if status not in {"live", "stale", "official"}:
                status = "official"
            snapshot = {
                "status": status,
                "stale": stale,
                "updatedAt": live_updated or stamp,
                "staticUpdatedAt": stamp,
                "liveUpdatedAt": live_updated,
                "lastAttemptAt": stamp,
                "source": "TDX／交通部",
                "city": city,
                "cityName": city_name,
                "items": rows,
            }
            save(path, snapshot)
            print("PARK_STATIC", city, len(rows))
        except Exception as error:
            print("PARK_STATIC_FAIL", city, repr(error), file=sys.stderr)
            stale_or_unavailable(path, message="TDX 停車場基本資料暫時無法更新")


def sync_parking_live(tok):
    for city, city_name in CITIES:
        if city not in PARK_LIVE:
            continue
        path = PARK / f"{city}.json"
        old = load_old(path, {})
        base_rows = old.get("items", []) if isinstance(old, dict) else []
        if not base_rows:
            print("PARK_LIVE_SKIP_NO_STATIC", city, file=sys.stderr)
            stale_or_unavailable(path, message="尚無可合併的停車場基本資料")
            continue

        try:
            raw = api_all(tok, f"/v1/Parking/OffStreet/ParkingAvailability/City/{city}")
            live = {}
            for record in raw:
                source_id = str(record.get("CarParkID") or record.get("ParkingID") or "")
                if not source_id:
                    continue
                total, available = parking_availability(record)
                live[source_id] = {
                    "total": total,
                    "available": available,
                    "dataCollectTime": str(record.get("DataCollectTime") or record.get("UpdateTime") or ""),
                }

            if not live:
                raise RuntimeError("TDX returned no parking availability rows")

            rows = []
            for base in base_rows:
                row = dict(base)
                row["available"] = None
                row["dataCollectTime"] = ""
                row["sourceType"] = "basic"
                current = live.get(str(row.get("id")))
                if current:
                    if current["total"] is not None:
                        row["total"] = current["total"]
                    row["available"] = current["available"]
                    row["dataCollectTime"] = current["dataCollectTime"]
                    row["sourceType"] = "live"
                rows.append(row)

            stamp = now()
            source_time = max((x["dataCollectTime"] for x in live.values() if x["dataCollectTime"]), default=None)
            snapshot = {
                "status": "live",
                "stale": False,
                "updatedAt": source_time or stamp,
                "staticUpdatedAt": old.get("staticUpdatedAt"),
                "liveUpdatedAt": source_time or stamp,
                "lastAttemptAt": stamp,
                "source": "TDX／交通部",
                "city": city,
                "cityName": city_name,
                "items": rows,
            }
            save(path, snapshot)
            print("PARK_LIVE", city, len(live))
        except Exception as error:
            print("PARK_LIVE_FAIL", city, repr(error), file=sys.stderr)
            stale_or_unavailable(path, message="TDX 即時剩餘車位暫時無法更新")


def inline_connector_summary(record):
    candidates = record.get("Connectors") or record.get("ConnectorTypes") or []
    if not isinstance(candidates, list):
        return []
    out = []
    for connector in candidates:
        out.append({
            "id": str(connector.get("ConnectorID") or ""),
            "type": connector.get("ConnectorType") or connector.get("Type") or connector.get("ChargingType"),
            "power": number(connector.get("MaxPower") or connector.get("MaxPowerKW") or connector.get("Power")),
        })
    return out


def normalize_station(record, city, city_name):
    source_id = str(record.get("StationID") or record.get("ChargingStationID") or "")
    if not source_id:
        return None
    lat, lon = pos(record)
    return {
        "id": f"{city}:{source_id}",
        "sourceId": source_id,
        "city": city,
        "cityName": city_name,
        "name": zh(record.get("StationName")) or zh(record.get("Name")) or source_id,
        "location": str(record.get("Address") or city_name),
        "operator": str(record.get("OperatorID") or record.get("OperatorId") or "TDX"),
        "lat": lat,
        "lon": lon,
        "road": "tdx",
        "direction": city_name,
        "note": "TDX 官方充電站",
        "_inlineConnectors": inline_connector_summary(record),
    }


def normalize_point(record):
    point_id = str(record.get("ChargingPointID") or record.get("PointID") or "")
    station_id = str(record.get("StationID") or record.get("ChargingStationID") or "")
    return {
        "id": point_id,
        "stationId": station_id,
        "connectors": inline_connector_summary(record),
    }


def normalize_connector(record):
    connector_id = str(record.get("ConnectorID") or "")
    station_id = str(record.get("StationID") or record.get("ChargingStationID") or "")
    point_id = str(record.get("ChargingPointID") or "")
    return {
        "id": connector_id,
        "stationId": station_id,
        "pointId": point_id,
        "type": record.get("ConnectorType") or record.get("Type") or record.get("ChargingType"),
        "power": number(record.get("MaxPower") or record.get("MaxPowerKW") or record.get("Power")),
    }


def sync_charging_static(tok):
    path = OUT / "charging.json"
    old = load_old(path, {})
    old_by_id = {
        str(x.get("id")): x for x in old.get("items", [])
        if isinstance(x, dict) and x.get("id")
    }
    all_rows = []
    failures = []

    for city, city_name in CITIES:
        if city not in EV_CITIES:
            continue
        try:
            station_raw = api_all(tok, f"/v1/EV/Station/City/{city}")
            point_raw = []
            connector_raw = []
            try:
                point_raw = api_all(tok, f"/v1/EV/ChargingPoint/City/{city}")
            except Exception as error:
                print("EV_POINT_OPTIONAL_FAIL", city, repr(error), file=sys.stderr)
            try:
                connector_raw = api_all(tok, f"/v1/EV/Connector/City/{city}")
            except Exception as error:
                print("EV_CONNECTOR_OPTIONAL_FAIL", city, repr(error), file=sys.stderr)

            stations = [normalize_station(x, city, city_name) for x in station_raw]
            stations = [x for x in stations if x]
            points = [normalize_point(x) for x in point_raw]
            connectors = [normalize_connector(x) for x in connector_raw]

            points_by_station = defaultdict(list)
            for point in points:
                if point["stationId"]:
                    points_by_station[point["stationId"]].append(point)

            connectors_by_station = defaultdict(list)
            connectors_by_point = defaultdict(list)
            for connector in connectors:
                if connector["stationId"]:
                    connectors_by_station[connector["stationId"]].append(connector)
                if connector["pointId"]:
                    connectors_by_point[connector["pointId"]].append(connector)

            city_rows = []
            for station in stations:
                source_id = station["sourceId"]
                station_points = points_by_station.get(source_id, [])
                joined_connectors = list(connectors_by_station.get(source_id, []))
                if not joined_connectors:
                    for point in station_points:
                        joined_connectors.extend(connectors_by_point.get(point["id"], []))
                if not joined_connectors:
                    for point in station_points:
                        joined_connectors.extend(point["connectors"])
                if not joined_connectors:
                    joined_connectors = station.pop("_inlineConnectors", [])
                else:
                    station.pop("_inlineConnectors", None)

                connector_types = sorted({
                    str(x.get("type")) for x in joined_connectors if x.get("type") not in {None, ""}
                })
                powers = [number(x.get("power")) for x in joined_connectors]
                powers = [x for x in powers if x is not None]
                connector_ids = sorted({
                    str(x.get("id")) for x in joined_connectors if x.get("id")
                })
                point_ids = sorted({x["id"] for x in station_points if x.get("id")})

                station.update({
                    "connectors": connector_types,
                    "connectorIds": connector_ids,
                    "chargingPointIds": point_ids,
                    "connectorCount": len(connector_ids) or len(joined_connectors),
                    "spaces": len(point_ids) or integer(
                        next(
                            (
                                x.get("TotalChargingPoints")
                                for x in station_raw
                                if str(x.get("StationID") or x.get("ChargingStationID") or "") == source_id
                            ),
                            None,
                        )
                    ) or "—",
                    "power": (f"{int(max(powers))} kW" if powers else "功率依現場"),
                })

                previous = old_by_id.get(station["id"], {})
                for key in (
                    "liveStateCount", "availableConnectors", "liveStatusKnown",
                    "liveStates", "statusUpdatedAt", "liveStale",
                ):
                    if key in previous:
                        station[key] = previous[key]
                city_rows.append(station)

            if not city_rows:
                raise RuntimeError("TDX returned no charging stations")
            all_rows.extend(city_rows)
            print("EV_STATIC", city, len(city_rows), "points", len(points), "connectors", len(connectors))
        except Exception as error:
            failures.append(city)
            print("EV_STATIC_FAIL", city, repr(error), file=sys.stderr)
            all_rows.extend([
                dict(x) for x in old.get("items", [])
                if isinstance(x, dict) and x.get("city") == city
            ])

    stamp = now()
    if all_rows:
        save(path, {
            "status": "official" if not failures else "partial",
            "stale": bool(failures),
            "updatedAt": old.get("liveUpdatedAt") or stamp,
            "staticUpdatedAt": stamp,
            "liveUpdatedAt": old.get("liveUpdatedAt"),
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "failedCities": failures,
            "items": all_rows,
        })
    else:
        stale_or_unavailable(path, message="TDX 充電站／接頭資料暫時無法更新")


_AVAILABLE_TOKENS = ("available", "free", "idle", "ready", "可用", "空閒", "閒置", "待機")
_UNAVAILABLE_TOKENS = (
    "occupied", "charging", "busy", "unavailable", "faulted", "fault",
    "offline", "reserved", "inoperative", "使用中", "充電中", "忙碌",
    "故障", "離線", "預約",
)


def classify_live_state(value):
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text or text.replace(".", "", 1).isdigit():
        return None
    if any(token in text for token in _UNAVAILABLE_TOKENS):
        return False
    if any(token in text for token in _AVAILABLE_TOKENS):
        return True
    return None


def sync_charging_live(tok):
    path = OUT / "charging.json"
    old = load_old(path, {})
    rows = [dict(x) for x in old.get("items", []) if isinstance(x, dict)]
    if not rows:
        stale_or_unavailable(path, message="尚無可合併的充電站基本資料")
        return

    failures = []
    success_count = 0
    newest = None

    for city, _ in CITIES:
        if city not in EV_CITIES:
            continue
        city_rows = [x for x in rows if x.get("city") == city]
        try:
            live_raw = api_all(tok, f"/v1/EV/ConnectorLiveStatus/City/{city}")
            grouped = defaultdict(list)
            for record in live_raw:
                station_id = str(record.get("StationID") or record.get("ChargingStationID") or "")
                if station_id:
                    grouped[station_id].append(record)

            for row in city_rows:
                station_rows = grouped.get(str(row.get("sourceId") or ""), [])
                states = Counter()
                classifications = []
                source_times = []
                for record in station_rows:
                    raw_state = (
                        record.get("Status") if record.get("Status") is not None
                        else record.get("ConnectorStatus") if record.get("ConnectorStatus") is not None
                        else record.get("AvailabilityStatus")
                    )
                    states[str(raw_state if raw_state is not None else "unknown")] += 1
                    classifications.append(classify_live_state(raw_state))
                    stamp = record.get("DataCollectTime") or record.get("UpdateTime")
                    if stamp:
                        source_times.append(str(stamp))

                row["liveStateCount"] = len(station_rows)
                row["liveStates"] = dict(states)
                row["liveStale"] = False
                row["statusUpdatedAt"] = max(source_times) if source_times else None
                if station_rows and all(value is not None for value in classifications):
                    row["liveStatusKnown"] = True
                    row["availableConnectors"] = sum(1 for value in classifications if value is True)
                else:
                    row["liveStatusKnown"] = False
                    row["availableConnectors"] = None
                if row["statusUpdatedAt"] and (newest is None or row["statusUpdatedAt"] > newest):
                    newest = row["statusUpdatedAt"]

            success_count += 1
            print("EV_LIVE", city, len(live_raw))
        except Exception as error:
            failures.append(city)
            print("EV_LIVE_FAIL", city, repr(error), file=sys.stderr)
            for row in city_rows:
                if row.get("liveStateCount"):
                    row["liveStale"] = True

    stamp = now()
    if success_count:
        save(path, {
            "status": "live" if not failures else "partial",
            "stale": bool(failures),
            "updatedAt": newest or stamp,
            "staticUpdatedAt": old.get("staticUpdatedAt"),
            "liveUpdatedAt": newest or stamp,
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "failedCities": failures,
            "items": rows,
        })
    else:
        stale_or_unavailable(path, message="TDX 充電接頭即時狀態暫時無法更新")


def normalize_section(record):
    source_id = str(record.get("SectionID") or "")
    if not source_id:
        return None
    start = str(record.get("Start") or "")
    end = str(record.get("End") or "")
    name = str(record.get("SectionName") or " → ".join(x for x in (start, end) if x) or source_id)
    return {
        "id": source_id,
        "roadId": record.get("RoadID"),
        "roadName": str(record.get("RoadName") or ""),
        "direction": str(record.get("RoadDirection") or ""),
        "name": name,
        "start": start,
        "end": end,
        "startMile": number(record.get("StartMile")),
        "endMile": number(record.get("EndMile")),
    }


def road_no(value):
    text = str(value or "")
    patterns = (
        r"國道\s*([1-6])",
        r"國\s*([1-6])",
        r"(?:Freeway|National\s*Highway)(?:\s*No\.?)?\s*([1-6])",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1)
    return None


def speed_level(speed):
    if speed >= 80:
        return "順暢"
    if speed >= 60:
        return "車較多"
    if speed >= 40:
        return "車多"
    if speed >= 20:
        return "較壅塞"
    return "壅塞"


def sync_freeway_sections(tok):
    path = OUT / "freeway-sections.json"
    try:
        raw = api_all(tok, "/v2/Road/Traffic/Section/Freeway")
        rows = [normalize_section(x) for x in raw]
        rows = [x for x in rows if x]
        if not rows:
            raise RuntimeError("TDX returned no freeway sections")
        stamp = now()
        save(path, {
            "status": "official",
            "stale": False,
            "updatedAt": stamp,
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "items": rows,
        })
        print("FREEWAY_SECTIONS", len(rows))
    except Exception as error:
        print("FREEWAY_SECTIONS_FAIL", repr(error), file=sys.stderr)
        stale_or_unavailable(path, message="TDX 國道路段資料暫時無法更新")


def sync_freeway_live(tok):
    traffic_path = OUT / "traffic.json"
    tunnel_path = OUT / "tunnel.json"
    sections_snapshot = load_old(OUT / "freeway-sections.json", {})
    sections = {
        str(x.get("id")): x for x in sections_snapshot.get("items", [])
        if isinstance(x, dict) and x.get("id")
    }
    if not sections:
        stale_or_unavailable(traffic_path, message="尚無國道路段基本資料")
        stale_or_unavailable(tunnel_path, message="尚無雪隧路段基本資料")
        return

    try:
        raw = api_all(tok, "/v2/Road/Traffic/Live/Freeway")
        highways = {str(i): [] for i in range(1, 7)}
        newest = None

        for record in raw:
            source_id = str(record.get("SectionID") or "")
            section = sections.get(source_id, {})
            speed = number(record.get("TravelSpeed"))
            if speed is None or speed == 250 or speed < 0 or speed >= 200:
                continue
            road = road_no(
                " ".join([
                    str(record.get("RoadName") or ""),
                    str(section.get("roadName") or ""),
                    str(section.get("name") or ""),
                ])
            )
            if road not in highways:
                continue
            source_time = str(record.get("DataCollectTime") or "")
            if source_time and (newest is None or source_time > newest):
                newest = source_time
            congestion = integer(record.get("CongestionLevel"))
            level = {
                0: "順暢", 1: "車較多", 2: "車多",
                3: "較壅塞", 4: "壅塞", 5: "壅塞",
            }.get(congestion, speed_level(speed))
            highways[road].append({
                "id": source_id,
                "name": section.get("name") or source_id,
                "direction": section.get("direction") or str(record.get("RoadDirection") or ""),
                "speed": round(speed, 1),
                "level": level,
                "dataCollectTime": source_time,
            })

        total = sum(len(rows) for rows in highways.values())
        if not total:
            raise RuntimeError("TDX freeway live data could not be mapped to known sections")

        stamp = now()
        traffic = {
            "status": "live",
            "stale": False,
            "updatedAt": newest or stamp,
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "highways": highways,
        }
        save(traffic_path, traffic)
        print("FREEWAY_LIVE", total)

        tunnel = {
            "status": "live",
            "stale": False,
            "updatedAt": newest or stamp,
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "south": [],
            "north": [],
        }
        for row in highways.get("5", []):
            label = row["name"]
            if not any(keyword in label for keyword in ("雪山", "坪林", "頭城", "石碇")):
                continue
            item = {
                "id": row["id"],
                "name": row["name"],
                "speed": row["speed"],
                "note": "TDX 國 5／雪隧即時路段速度",
                "dataCollectTime": row["dataCollectTime"],
            }
            direction = (row.get("direction") or "").upper()
            if "S" in direction or "南" in direction:
                tunnel["south"].append(item)
            elif "N" in direction or "北" in direction:
                tunnel["north"].append(item)

        if tunnel["south"] or tunnel["north"]:
            save(tunnel_path, tunnel)
            print("XUESHAN_LIVE", len(tunnel["south"]), len(tunnel["north"]))
        else:
            print("XUESHAN_LIVE_EMPTY", file=sys.stderr)
            stale_or_unavailable(tunnel_path, message="TDX 國 5 即時資料目前沒有可辨識的雪隧路段")
    except Exception as error:
        print("FREEWAY_LIVE_FAIL", repr(error), file=sys.stderr)
        stale_or_unavailable(traffic_path, message="TDX 國道即時路況暫時無法更新")
        stale_or_unavailable(tunnel_path, message="TDX 雪隧即時路況暫時無法更新")


def safe_http_url(value):
    try:
        url = urllib.parse.urlparse(str(value or ""))
        if url.scheme in {"http", "https"} and url.netloc:
            return str(value)
    except Exception:
        pass
    return ""


def sync_cctv(tok):
    path = OUT / "cctv.json"
    try:
        raw = api_all(tok, "/v2/Road/Traffic/CCTV/Freeway")
        rows = []
        for record in raw:
            source_id = str(record.get("CCTVID") or record.get("CCTVId") or "")
            if not source_id:
                continue
            road = str(record.get("RoadName") or "")
            stream = safe_http_url(
                record.get("VideoStreamURL") or record.get("StreamURL")
                or record.get("ImageURL") or record.get("ImageUrl")
            )
            rows.append({
                "id": source_id,
                "road": road,
                "roadNo": road_no(road) or "",
                "direction": str(record.get("RoadDirection") or ""),
                "mile": str(record.get("LocationMile") or record.get("LocationDescription") or ""),
                "start": str(record.get("Start") or ""),
                "end": str(record.get("End") or ""),
                "lat": number(record.get("PositionLat")),
                "lon": number(record.get("PositionLon")),
                "stream": stream,
            })

        rows = [x for x in rows if x["stream"]]
        if not rows:
            raise RuntimeError("TDX returned no displayable CCTV rows")
        stamp = now()
        save(path, {
            "status": "official",
            "stale": False,
            "updatedAt": stamp,
            "lastAttemptAt": stamp,
            "source": "TDX／交通部",
            "items": rows,
        })
        print("CCTV", len(rows))
    except Exception as error:
        print("CCTV_FAIL", repr(error), file=sys.stderr)
        stale_or_unavailable(path, message="TDX 國道 CCTV 清單暫時無法更新")


def dataset_status(path):
    data = load_old(path, {})
    result = {
        "status": data.get("status", "unavailable"),
        "stale": bool(data.get("stale")),
        "updatedAt": data.get("updatedAt"),
    }
    if isinstance(data.get("items"), list):
        result["count"] = len(data["items"])
    elif isinstance(data.get("highways"), dict):
        result["count"] = sum(len(rows) for rows in data["highways"].values())
    elif "south" in data or "north" in data:
        result["count"] = len(data.get("south", [])) + len(data.get("north", []))
    return result


def write_status():
    parking = {}
    for city, _ in CITIES:
        parking[city] = dataset_status(PARK / f"{city}.json")
    save(OUT / "status.json", {
        "status": "official",
        "stale": False,
        "updatedAt": now(),
        "source": "TDX／交通部",
        "mode": "GitHub Actions protected secret cache",
        "syncMode": SYNC_MODE,
        "datasets": {
            "parking": parking,
            "charging": dataset_status(OUT / "charging.json"),
            "traffic": dataset_status(OUT / "traffic.json"),
            "tunnel": dataset_status(OUT / "tunnel.json"),
            "cctv": dataset_status(OUT / "cctv.json"),
            "freewaySections": dataset_status(OUT / "freeway-sections.json"),
        },
    })


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PARK.mkdir(parents=True, exist_ok=True)
    tok = token()
    print("TDX_SYNC_MODE", SYNC_MODE, flush=True)

    if SYNC_MODE in {"all", "static"}:
        sync_parking_static(tok)
        sync_charging_static(tok)
        sync_freeway_sections(tok)
        sync_cctv(tok)

    if SYNC_MODE in {"all", "dynamic"}:
        sync_parking_live(tok)
        sync_charging_live(tok)
        sync_freeway_live(tok)

    write_status()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
