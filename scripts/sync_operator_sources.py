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

    total_seats = sum(int(x.get("ccs1Seats") or 0) + int(x.get("ccs2Seats") or 0) for x in upower_items)
    print(f"UPOWER_OK stations={len(upower_items)} seats={total_seats}")
    print(f"EVOASIS_OK stations={len(evoasis_items)}")

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
    }
    for filename, payload in payloads.items():
        target = OUT / filename
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {target} {len(payload['items'])} stations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
