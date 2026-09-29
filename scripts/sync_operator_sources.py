#!/usr/bin/env python3
import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

OUT = Path("data/operators")
UPOWER_URL = "https://www.u-power.com.tw/"
EVOASIS_URL = "https://www.evoasis.com.tw/charging-station"
TAIL_URL = "https://www.evtail.com.tw/locations"
TESLA_SUPERCHARGER_URL = "https://www.tesla.com/zh_TW/findus/list/superchargers/Taiwan"

CITY_PREFIXES = [
    ("臺北市", "Taipei", "臺北市"), ("台北市", "Taipei", "臺北市"),
    ("新北市", "NewTaipei", "新北市"), ("桃園市", "Taoyuan", "桃園市"),
    ("臺中市", "Taichung", "臺中市"), ("台中市", "Taichung", "臺中市"),
    ("臺南市", "Tainan", "臺南市"), ("台南市", "Tainan", "臺南市"),
    ("高雄市", "Kaohsiung", "高雄市"), ("基隆市", "Keelung", "基隆市"),
    ("新竹市", "Hsinchu", "新竹市"), ("新竹縣", "HsinchuCounty", "新竹縣"),
    ("苗栗縣", "MiaoliCounty", "苗栗縣"), ("彰化縣", "ChanghuaCounty", "彰化縣"),
    ("南投縣", "NantouCounty", "南投縣"), ("雲林縣", "YunlinCounty", "雲林縣"),
    ("嘉義市", "Chiayi", "嘉義市"), ("嘉義縣", "ChiayiCounty", "嘉義縣"),
    ("屏東縣", "PingtungCounty", "屏東縣"), ("宜蘭縣", "YilanCounty", "宜蘭縣"),
    ("花蓮縣", "HualienCounty", "花蓮縣"), ("臺東縣", "TaitungCounty", "臺東縣"),
    ("台東縣", "TaitungCounty", "臺東縣"), ("澎湖縣", "PenghuCounty", "澎湖縣"),
    ("金門縣", "KinmenCounty", "金門縣"), ("連江縣", "LienchiangCounty", "連江縣"),
]


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clean_text(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or "")).replace("\xa0", " ")).strip()


def seat_count(value):
    m = re.search(r"(\d+)\s*席", clean_text(value))
    return int(m.group(1)) if m else 0


def city_from_address(address):
    text = clean_text(address)
    for prefix, code, name in CITY_PREFIXES:
        if text.startswith(prefix):
            return code, name
    return "", ""


def stable_id(provider, name, address):
    digest = hashlib.sha1(f"{provider}|{name}|{address}".encode("utf-8")).hexdigest()[:14]
    return f"official-{provider}-{digest}"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_row = False
        self.in_cell = False
        self.cell_parts = []
        self.row = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self.in_row = True
            self.row = []
        elif tag in {"td", "th"} and self.in_row:
            self.in_cell = True
            self.cell_parts = []
        elif tag == "br" and self.in_cell:
            self.cell_parts.append("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"td", "th"} and self.in_cell:
            value = "".join(self.cell_parts)
            value = "\n".join(clean_text(part) for part in value.split("\n") if clean_text(part))
            self.row.append(value)
            self.in_cell = False
            self.cell_parts = []
        elif tag == "tr" and self.in_row:
            if self.row:
                self.rows.append(self.row[:])
            self.in_row = False
            self.row = []

    def handle_data(self, data):
        if self.in_cell:
            self.cell_parts.append(data)


class TextNodeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []

    def handle_data(self, data):
        value = clean_text(data)
        if value:
            self.nodes.append(value)


def split_station_cell(value):
    raw = str(value or "").strip()
    parts = [clean_text(part) for part in raw.split("\n") if clean_text(part)]
    if len(parts) >= 2:
        name = parts[0]
        address = " ".join(parts[1:])
        if city_from_address(address)[0]:
            return name, address

    one = clean_text(raw)
    city_match = re.search(
        r"(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)",
        one,
    )
    if city_match and city_match.start() > 0:
        return one[: city_match.start()].strip(), one[city_match.start() :].strip()
    return "", ""


def parse_upower(html_text):
    parser = TableParser()
    parser.feed(html_text)
    items = []

    for row in parser.rows:
        if len(row) < 2:
            continue
        name, address = split_station_cell(row[0])
        if not name or not address:
            continue

        power_index = next((i for i, cell in enumerate(row[1:], start=1) if re.search(r"[\d,]+\s*kW", cell, re.I)), None)
        if power_index is None:
            continue

        power_match = re.search(r"([\d,]+)\s*kW", row[power_index], re.I)
        site_power_kw = int(power_match.group(1).replace(",", "")) if power_match else 0

        tail = row[power_index + 1 :]
        ccs1_liquid = seat_count(tail[0]) if len(tail) > 0 else 0
        ccs1_air = seat_count(tail[1]) if len(tail) > 1 else 0
        ccs2_liquid = seat_count(tail[2]) if len(tail) > 2 else 0
        ccs2_air = seat_count(tail[3]) if len(tail) > 3 else 0
        ccs1 = ccs1_liquid + ccs1_air
        ccs2 = ccs2_liquid + ccs2_air
        connectors = []
        if ccs1:
            connectors.append("CCS1")
        if ccs2:
            connectors.append("CCS2")

        note = " · ".join(clean_text(x) for x in tail[4:] if clean_text(x) and clean_text(x) != "-")
        city, city_name = city_from_address(address)
        if not city:
            continue

        items.append(
            {
                "id": stable_id("upower", name, address),
                "road": "operator",
                "city": city,
                "cityName": city_name,
                "name": name,
                "location": address,
                "operator": "旭電馳科研",
                "operatorId": "83235398",
                "operatorWebURL": UPOWER_URL,
                "officialSource": "U-POWER 官方網站",
                "officialSourceURL": UPOWER_URL,
                "officialSupplemental": True,
                "sitePowerKw": site_power_kw,
                "maxPowerKw": None,
                "power": "",
                "spaces": ccs1 + ccs2,
                "connectorCount": ccs1 + ccs2,
                "connectors": connectors,
                "ccs1Seats": ccs1,
                "ccs2Seats": ccs2,
                "liveStateCount": 0,
                "availableConnectors": 0,
                "occupiedConnectors": 0,
                "faultedConnectors": 0,
                "unavailableConnectors": 0,
                "unknownConnectors": 0,
                "liveStatusKnown": False,
                "liveStale": False,
                "statusUpdatedAt": None,
                "lat": None,
                "lon": None,
                "direction": "",
                "serviceTime": "",
                "chargingRate": "",
                "parkingRate": "",
                "telephone": "",
                "operatorTelephone": "0809-0809-81",
                "description": note,
            }
        )

    unique = {}
    for item in items:
        key = (clean_text(item["name"]).lower(), clean_text(item["location"]).lower())
        unique[key] = item
    return list(unique.values())


def parse_evoasis(html_text):
    parser = TableParser()
    parser.feed(html_text)
    items = []

    for row in parser.rows:
        if len(row) < 2:
            continue
        name = clean_text(row[0])
        address = clean_text(row[1])
        city, city_name = city_from_address(address)
        if not name or not city:
            continue
        if name in {"站名", "Station"}:
            continue

        items.append(
            {
                "id": stable_id("evoasis", name, address),
                "road": "operator",
                "city": city,
                "cityName": city_name,
                "name": name,
                "location": address,
                "operator": "源點科技股份有限公司",
                "operatorId": "",
                "operatorWebURL": EVOASIS_URL,
                "officialSource": "EVOASIS 官方 DC 站點",
                "officialSourceURL": EVOASIS_URL,
                "officialSupplemental": True,
                "officialStationType": "DC",
                "sitePowerKw": 0,
                "maxPowerKw": None,
                "power": "DC 快充",
                "spaces": 0,
                "connectorCount": 0,
                "connectors": [],
                "liveStateCount": 0,
                "availableConnectors": 0,
                "occupiedConnectors": 0,
                "faultedConnectors": 0,
                "unavailableConnectors": 0,
                "unknownConnectors": 0,
                "liveStatusKnown": False,
                "liveStale": False,
                "statusUpdatedAt": None,
                "lat": None,
                "lon": None,
                "direction": "",
                "serviceTime": "",
                "chargingRate": "",
                "parkingRate": "",
                "telephone": "",
                "operatorTelephone": "06-602-0889",
                "description": "",
            }
        )

    unique = {}
    for item in items:
        key = (clean_text(item["name"]).lower(), clean_text(item["location"]).lower())
        unique[key] = item
    return list(unique.values())


def validate_evoasis(items):
    errors = []
    if len(items) < 80:
        errors.append(f"expected at least 80 EVOASIS DC stations, got {len(items)}")
    if any(not x.get("city") or not x.get("name") or not x.get("location") for x in items):
        errors.append("one or more EVOASIS rows are missing city/name/location")
    if len({x.get("city") for x in items if x.get("city")}) < 6:
        errors.append("EVOASIS official DC list covers too few cities")
    if errors:
        raise RuntimeError("; ".join(errors))


def normalize_tail_address(value):
    text = clean_text(value)
    text = re.sub(r"^\d{3,5}\s*", "", text)
    for prefix, _, _ in CITY_PREFIXES:
        if text.startswith(prefix):
            second = text.find(prefix, len(prefix))
            if 0 < second < 24:
                text = text[second:]
            break
    return clean_text(text)


def clean_tail_station_name(value):
    name = clean_text(value)
    m = re.match(r"^(.{2,80})\s+\1$", name)
    if m:
        name = clean_text(m.group(1))
    return name


def parse_tail(html_text):
    parser = TextNodeParser()
    parser.feed(html_text)
    nodes = parser.nodes
    items = []
    skip_words = {
        "尋找充電站", "充電地圖", "全部", "北部", "中部", "南部", "東部", "離島",
        "聯絡資訊", "客服信箱", "客服電話", "聯絡地址", "TAIL", "特爾電力",
    }

    for i, raw in enumerate(nodes):
        address = normalize_tail_address(raw)
        city, city_name = city_from_address(address)
        if not city:
            continue
        if len(address) < 8:
            continue

        name = ""
        for step in range(1, 7):
            if i - step < 0:
                break
            candidate = clean_tail_station_name(nodes[i - step])
            if not candidate or candidate in skip_words:
                continue
            if city_from_address(normalize_tail_address(candidate))[0]:
                continue
            if re.fullmatch(r"[\d\s\-()]+", candidate):
                continue
            if len(candidate) > 90:
                continue
            name = candidate
            break
        if not name:
            continue
        if any(word in name for word in ["客服", "聯絡", "Copyright", "隱私權", "服務條款"]):
            continue

        items.append(
            {
                "id": stable_id("tail", name, address),
                "road": "operator",
                "city": city,
                "cityName": city_name,
                "name": name,
                "location": address,
                "operator": "特爾電力股份有限公司",
                "operatorId": "",
                "operatorWebURL": TAIL_URL,
                "officialSource": "TAIL 特爾電力官方站點",
                "officialSourceURL": TAIL_URL,
                "officialSupplemental": True,
                "officialStationType": "",
                "sitePowerKw": 0,
                "maxPowerKw": None,
                "power": "",
                "spaces": 0,
                "connectorCount": 0,
                "connectors": [],
                "liveStateCount": 0,
                "availableConnectors": 0,
                "occupiedConnectors": 0,
                "faultedConnectors": 0,
                "unavailableConnectors": 0,
                "unknownConnectors": 0,
                "liveStatusKnown": False,
                "liveStale": False,
                "statusUpdatedAt": None,
                "lat": None,
                "lon": None,
                "direction": "",
                "serviceTime": "",
                "chargingRate": "",
                "parkingRate": "",
                "telephone": "",
                "operatorTelephone": "02-2531-0858",
                "description": "",
            }
        )

    unique = {}
    for item in items:
        key = (clean_text(item["name"]).lower(), clean_text(item["location"]).lower())
        unique[key] = item
    return list(unique.values())


def validate_tail(items):
    errors = []
    if len(items) < 70:
        errors.append(f"expected at least 70 TAIL stations, got {len(items)}")
    if any(not x.get("city") or not x.get("name") or not x.get("location") for x in items):
        errors.append("one or more TAIL rows are missing city/name/location")
    if len({x.get("city") for x in items if x.get("city")}) < 10:
        errors.append("TAIL official station list covers too few cities")
    if errors:
        raise RuntimeError("; ".join(errors))


def city_from_postal(postal, name="", address=""):
    try:
        code = int(str(postal)[:3])
    except (TypeError, ValueError):
        code = 0

    if 100 <= code <= 116:
        return "Taipei", "臺北市"
    if 200 <= code <= 206:
        return "Keelung", "基隆市"
    if 209 <= code <= 212:
        return "LienchiangCounty", "連江縣"
    if 220 <= code <= 253:
        return "NewTaipei", "新北市"
    if 260 <= code <= 272:
        return "YilanCounty", "宜蘭縣"
    if code == 300:
        return "Hsinchu", "新竹市"
    if 302 <= code <= 315:
        return "HsinchuCounty", "新竹縣"
    if 320 <= code <= 338:
        return "Taoyuan", "桃園市"
    if 350 <= code <= 369:
        return "MiaoliCounty", "苗栗縣"
    if 400 <= code <= 439:
        return "Taichung", "臺中市"
    if 500 <= code <= 530:
        return "ChanghuaCounty", "彰化縣"
    if 540 <= code <= 558:
        return "NantouCounty", "南投縣"
    if code == 600:
        return "Chiayi", "嘉義市"
    if 602 <= code <= 625:
        return "ChiayiCounty", "嘉義縣"
    if 630 <= code <= 655:
        return "YunlinCounty", "雲林縣"
    if 700 <= code <= 745:
        return "Tainan", "臺南市"
    if 800 <= code <= 852:
        return "Kaohsiung", "高雄市"
    if 880 <= code <= 885:
        return "PenghuCounty", "澎湖縣"
    if 890 <= code <= 896:
        return "KinmenCounty", "金門縣"
    if 900 <= code <= 947:
        return "PingtungCounty", "屏東縣"
    if 950 <= code <= 966:
        return "TaitungCounty", "臺東縣"
    if 970 <= code <= 983:
        return "HualienCounty", "花蓮縣"

    haystack = clean_text(f"{name} {address}")
    aliases = [
        ("臺北", "Taipei", "臺北市"), ("台北", "Taipei", "臺北市"),
        ("新北", "NewTaipei", "新北市"), ("基隆", "Keelung", "基隆市"),
        ("桃園", "Taoyuan", "桃園市"), ("新竹", "HsinchuCounty", "新竹縣"),
        ("苗栗", "MiaoliCounty", "苗栗縣"), ("臺中", "Taichung", "臺中市"),
        ("台中", "Taichung", "臺中市"), ("彰化", "ChanghuaCounty", "彰化縣"),
        ("南投", "NantouCounty", "南投縣"), ("雲林", "YunlinCounty", "雲林縣"),
        ("嘉義", "ChiayiCounty", "嘉義縣"), ("臺南", "Tainan", "臺南市"),
        ("台南", "Tainan", "臺南市"), ("高雄", "Kaohsiung", "高雄市"),
        ("屏東", "PingtungCounty", "屏東縣"), ("宜蘭", "YilanCounty", "宜蘭縣"),
        ("花蓮", "HualienCounty", "花蓮縣"), ("臺東", "TaitungCounty", "臺東縣"),
        ("台東", "TaitungCounty", "臺東縣"), ("澎湖", "PenghuCounty", "澎湖縣"),
        ("金門", "KinmenCounty", "金門縣"), ("連江", "LienchiangCounty", "連江縣"),
    ]
    for alias, city, city_name in aliases:
        if alias in haystack:
            return city, city_name
    return "", ""


def parse_tesla_superchargers(html_text):
    parser = TextNodeParser()
    parser.feed(html_text)
    nodes = parser.nodes
    items = []
    skip_words = {
        "Tesla 超級充電站 - 台灣", "Tesla Superchargers in Taiwan", "返回列表", "返回清單",
        "台灣", "Taiwan", "搜尋我們", "超級充電座", "超級充電站",
    }

    for i, raw in enumerate(nodes):
        address_match = re.match(r"^(\d{3,6})\s+(.+)$", clean_text(raw))
        if not address_match:
            continue
        postal = address_match.group(1)
        address_body = clean_text(address_match.group(2))
        if not address_body or re.fullmatch(r"\d+", address_body):
            continue

        name = ""
        for step in range(1, 5):
            if i - step < 0:
                break
            candidate = clean_text(nodes[i - step])
            if not candidate or candidate in skip_words:
                continue
            if candidate.startswith("Roadside Assistance") or candidate.startswith("Phone"):
                continue
            if re.match(r"^\d{3,6}\s+", candidate):
                continue
            if candidate.startswith("http://") or candidate.startswith("https://"):
                continue
            if len(candidate) > 100:
                continue
            name = candidate
            break
        if not name:
            continue

        city, city_name = city_from_postal(postal, name, address_body)
        if not city:
            continue

        address = f"{postal} {address_body}"
        items.append(
            {
                "id": stable_id("tesla", name, address),
                "road": "operator",
                "city": city,
                "cityName": city_name,
                "name": name,
                "location": address,
                "operator": "台灣特斯拉汽車有限公司",
                "operatorId": "",
                "operatorWebURL": TESLA_SUPERCHARGER_URL,
                "officialSource": "Tesla 台灣官方超級充電站",
                "officialSourceURL": TESLA_SUPERCHARGER_URL,
                "officialSupplemental": True,
                "officialStationType": "Supercharger",
                "sitePowerKw": 0,
                "maxPowerKw": None,
                "power": "Tesla Supercharger",
                "spaces": 0,
                "connectorCount": 0,
                "connectors": [],
                "liveStateCount": 0,
                "availableConnectors": 0,
                "occupiedConnectors": 0,
                "faultedConnectors": 0,
                "unavailableConnectors": 0,
                "unknownConnectors": 0,
                "liveStatusKnown": False,
                "liveStale": False,
                "statusUpdatedAt": None,
                "lat": None,
                "lon": None,
                "direction": "",
                "serviceTime": "",
                "chargingRate": "",
                "parkingRate": "",
                "telephone": "",
                "operatorTelephone": "0809007518",
                "description": "",
            }
        )

    unique = {}
    for item in items:
        key = (clean_text(item["name"]).lower(), clean_text(item["location"]).lower())
        unique[key] = item
    return list(unique.values())


def validate_tesla_superchargers(items):
    errors = []
    if len(items) < 90:
        errors.append(f"expected at least 90 Tesla Supercharger locations, got {len(items)}")
    if any(not x.get("city") or not x.get("name") or not x.get("location") for x in items):
        errors.append("one or more Tesla Supercharger rows are missing city/name/location")
    if len({x.get("city") for x in items if x.get("city")}) < 15:
        errors.append("Tesla Supercharger list covers too few cities/counties")
    if errors:
        raise RuntimeError("; ".join(errors))


def fetch_text(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "COLA-GO/1.0 (+https://ykc1117.github.io/cola-go/) AppleWebKit/537.36 Chrome/130 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def validate_upower(items):
    errors = []
    if len(items) < 50:
        errors.append(f"expected at least 50 U-POWER stations, got {len(items)}")
    if any(not x.get("city") or not x.get("name") or not x.get("location") for x in items):
        errors.append("one or more U-POWER rows are missing city/name/location")
    if sum(1 for x in items if x.get("sitePowerKw", 0) > 0) < 50:
        errors.append("too few U-POWER rows contain official site power")
    if sum(int(x.get("ccs1Seats") or 0) + int(x.get("ccs2Seats") or 0) for x in items) < 300:
        errors.append("U-POWER connector-seat total is unexpectedly low")
    if errors:
        raise RuntimeError("; ".join(errors))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-online", action="store_true", help="fetch and validate without writing data")
    args = parser.parse_args()

    try:
        upower_source = fetch_text(UPOWER_URL)
        upower_items = parse_upower(upower_source)
        validate_upower(upower_items)
    except Exception as error:
        print(f"UPOWER_SYNC_ERROR {error}", file=sys.stderr)
        raise

    try:
        evoasis_source = fetch_text(EVOASIS_URL)
        evoasis_items = parse_evoasis(evoasis_source)
        validate_evoasis(evoasis_items)
    except Exception as error:
        print(f"EVOASIS_SYNC_ERROR {error}", file=sys.stderr)
        raise

    try:
        tail_source = fetch_text(TAIL_URL)
        tail_items = parse_tail(tail_source)
        validate_tail(tail_items)
    except Exception as error:
        print(f"TAIL_SYNC_ERROR {error}", file=sys.stderr)
        raise

    try:
        tesla_source = fetch_text(TESLA_SUPERCHARGER_URL)
        tesla_items = parse_tesla_superchargers(tesla_source)
        validate_tesla_superchargers(tesla_items)
    except Exception as error:
        print(f"TESLA_SYNC_ERROR {error}", file=sys.stderr)
        raise

    total_seats = sum(int(x.get("ccs1Seats") or 0) + int(x.get("ccs2Seats") or 0) for x in upower_items)
    print(f"UPOWER_OK stations={len(upower_items)} seats={total_seats}")
    print(f"EVOASIS_OK stations={len(evoasis_items)}")
    print(f"TAIL_OK stations={len(tail_items)}")
    print(f"TESLA_OK superchargers={len(tesla_items)}")

    if args.check_online:
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    generated_at = now()
    payloads = {
        "upower.json": {
            "schema": 1,
            "source": "U-POWER 官方網站",
            "sourceUrl": UPOWER_URL,
            "updatedAt": generated_at,
            "count": len(upower_items),
            "totalSeats": total_seats,
            "items": sorted(upower_items, key=lambda x: (x.get("cityName") or "", x.get("name") or "")),
        },
        "evoasis.json": {
            "schema": 1,
            "source": "EVOASIS 官方 DC 站點",
            "sourceUrl": EVOASIS_URL,
            "updatedAt": generated_at,
            "count": len(evoasis_items),
            "items": sorted(evoasis_items, key=lambda x: (x.get("cityName") or "", x.get("name") or "")),
        },
        "tail.json": {
            "schema": 1,
            "source": "TAIL 特爾電力官方站點",
            "sourceUrl": TAIL_URL,
            "updatedAt": generated_at,
            "count": len(tail_items),
            "items": sorted(tail_items, key=lambda x: (x.get("cityName") or "", x.get("name") or "")),
        },
        "tesla-superchargers.json": {
            "schema": 1,
            "source": "Tesla 台灣官方超級充電站",
            "sourceUrl": TESLA_SUPERCHARGER_URL,
            "updatedAt": generated_at,
            "count": len(tesla_items),
            "items": sorted(tesla_items, key=lambda x: (x.get("cityName") or "", x.get("name") or "")),
        },
    }
    for filename, payload in payloads.items():
        target = OUT / filename
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {target} {len(payload['items'])} stations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
