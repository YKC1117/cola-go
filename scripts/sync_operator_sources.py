#!/usr/bin/env python3
import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

OUT = Path("data/operators")
UPOWER_URL = "https://www.u-power.com.tw/"
EVOASIS_URL = "https://www.evoasis.com.tw/charging-station"
TAIL_URL = "https://www.evtail.com.tw/locations"
EVALUE_URL = "https://www.evalue.com.tw/find"

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


class EvalueListParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current_select = None
        self.current_option = None
        self.option_parts = []
        self.select_options = {}
        self.current_href = ""
        self.anchor_parts = []
        self.stations = []
        self.total_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        tag = tag.lower()
        if tag == "select":
            self.current_select = attrs.get("name") or attrs.get("id") or ""
            self.select_options.setdefault(self.current_select, [])
        elif tag == "option" and self.current_select is not None:
            self.current_option = attrs.get("value", "")
            self.option_parts = []
        elif tag == "a":
            href = attrs.get("href") or ""
            if re.search(r"(?:^|/)find/\d+/?(?:[?#].*)?$", href):
                self.current_href = href
                self.anchor_parts = []

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "option" and self.current_option is not None:
            text = clean_text(" ".join(self.option_parts))
            self.select_options.setdefault(self.current_select or "", []).append((self.current_option, text))
            self.current_option = None
            self.option_parts = []
        elif tag == "select":
            self.current_select = None
        elif tag == "a" and self.current_href:
            name = clean_text(" ".join(self.anchor_parts))
            if name:
                self.stations.append((self.current_href, name))
            self.current_href = ""
            self.anchor_parts = []

    def handle_data(self, data):
        value = clean_text(data)
        if not value:
            return
        self.total_text.append(value)
        if self.current_option is not None:
            self.option_parts.append(value)
        if self.current_href:
            self.anchor_parts.append(value)

    def total_count(self):
        text = " ".join(self.total_text)
        m = re.search(r"全部共\s*(\d+)\s*筆", text)
        return int(m.group(1)) if m else 0


def normalize_station_name(value):
    return re.sub(r"[^0-9a-zA-Z一-龥]+", "", clean_text(value).replace("臺", "台")).lower()


def evalue_city_select(parser):
    best = None
    best_rows = []
    for name, options in parser.select_options.items():
        rows = []
        for value, label in options:
            city, city_name = city_from_address(label)
            if city:
                rows.append((value, city, city_name))
        if len(rows) > len(best_rows):
            best = name
            best_rows = rows
    return best, best_rows


def parse_evalue_detail(html_text, item):
    parser = TextNodeParser()
    parser.feed(html_text)
    text = "\n".join(parser.nodes)
    power_match = re.search(r"功率[:：]\s*([^\n]+)", text)
    count_match = re.search(r"充電樁數[:：]\s*([^\n]+)", text)
    connector_match = re.search(r"介面規格[:：]\s*([^\n]+)", text)

    power_text = clean_text(power_match.group(1)) if power_match else ""
    count_text = clean_text(count_match.group(1)) if count_match else ""
    connector_text = clean_text(connector_match.group(1)) if connector_match else ""

    kw_values = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*kW", power_text, re.I)]
    max_power = max(kw_values) if kw_values else None
    spaces = sum(int(x) for x in re.findall(r"(\d+)\s*座", count_text))

    connectors = []
    aliases = [
        (r"CCS\s*1", "CCS1"),
        (r"CCS\s*2", "CCS2"),
        (r"CHAdeMO", "CHAdeMO"),
        (r"J1772|Type\s*1", "J1772"),
        (r"Type\s*2|Mennekes", "Type2"),
    ]
    for pattern, label in aliases:
        if re.search(pattern, connector_text, re.I) and label not in connectors:
            connectors.append(label)

    item = dict(item)
    item.update({
        "sitePowerKw": max_power or 0,
        "maxPowerKw": max_power,
        "power": power_text,
        "spaces": spaces,
        "connectorCount": spaces,
        "connectors": connectors,
        "description": "EVALUE 官方站點" + ((" · " + count_text) if count_text else ""),
    })
    return item


def load_tdx_evalue_names():
    path = Path("data/tdx/charging.json")
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return set()
    names = set()
    for row in data.get("items") or []:
        text = " ".join(str(row.get(k) or "") for k in ("operator", "name", "description", "operatorWebURL")).lower()
        if "華城電能" in text or "華城電機" in text or "evalue" in text:
            city = str(row.get("city") or "")
            name = normalize_station_name(row.get("name"))
            if city and name:
                names.add((city, name))
    return names


def sync_evalue(fetch_details=True):
    first = fetch_text(EVALUE_URL)
    first_parser = EvalueListParser()
    first_parser.feed(first)
    select_name, cities = evalue_city_select(first_parser)
    if not select_name or len(cities) < 10:
        raise RuntimeError("unable to discover EVALUE city filter")

    collected = {}
    for value, city, city_name in cities:
        if not value:
            continue
        if str(value).startswith(("http://", "https://", "/find")):
            page_url = urllib.parse.urljoin(EVALUE_URL, value)
        else:
            query = urllib.parse.urlencode({select_name: value})
            page_url = EVALUE_URL + "?" + query

        html_text = fetch_text(page_url)
        parser = EvalueListParser()
        parser.feed(html_text)
        total = parser.total_count()
        pages = max(1, (total + 23) // 24)
        for page in range(1, pages + 1):
            if page > 1:
                parsed = urllib.parse.urlsplit(page_url)
                params = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
                params["page"] = str(page)
                next_url = urllib.parse.urlunsplit((
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    urllib.parse.urlencode(params),
                    parsed.fragment,
                ))
                html_text = fetch_text(next_url)
                parser = EvalueListParser()
                parser.feed(html_text)
            for href, name in parser.stations:
                detail_url = urllib.parse.urljoin(EVALUE_URL, href)
                key = (city, normalize_station_name(name))
                if not key[1]:
                    continue
                collected[key] = {
                    "id": stable_id("evalue", name, detail_url),
                    "road": "operator",
                    "city": city,
                    "cityName": city_name,
                    "name": name,
                    "location": "",
                    "operator": "華城電能科技股份有限公司",
                    "operatorId": "90807408",
                    "networkKey": "evalue",
                    "operatorWebURL": EVALUE_URL,
                    "officialSource": "EVALUE 官方充電站",
                    "officialSourceURL": detail_url,
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
                    "operatorTelephone": "",
                    "description": "EVALUE 官方站點",
                }

    items = list(collected.values())
    if fetch_details:
        tdx_names = load_tdx_evalue_names()
        for index, item in enumerate(items):
            key = (item.get("city") or "", normalize_station_name(item.get("name")))
            if key in tdx_names:
                continue
            try:
                detail = fetch_text(item["officialSourceURL"])
                items[index] = parse_evalue_detail(detail, item)
            except Exception as error:
                print(f"EVALUE_DETAIL_WARN {item.get('name')} {error}", file=sys.stderr)
    return items


def validate_evalue(items):
    errors = []
    if len(items) < 700:
        errors.append(f"expected at least 700 EVALUE stations, got {len(items)}")
    if len({x.get("city") for x in items if x.get("city")}) < 15:
        errors.append("EVALUE official list covers too few cities")
    if any(not x.get("name") or not x.get("city") or not x.get("officialSourceURL") for x in items):
        errors.append("one or more EVALUE rows are missing name/city/officialSourceURL")
    if errors:
        raise RuntimeError("; ".join(errors))


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


def read_existing_payload(filename):
    target = OUT / filename
    if not target.exists():
        return None
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        if isinstance(data.get("items"), list) and data["items"]:
            return data
    except Exception:
        pass
    return None


def source_result(key, filename, source_name, source_url, loader, validator, extra=None):
    attempted_at = now()
    try:
        items = loader()
        validator(items)
        payload = {
            "schema": 2,
            "source": source_name,
            "sourceUrl": source_url,
            "updatedAt": attempted_at,
            "lastSuccessAt": attempted_at,
            "lastAttemptAt": attempted_at,
            "syncStatus": "ok",
            "count": len(items),
            "items": sorted(items, key=lambda x: (x.get("cityName") or "", x.get("name") or "")),
        }
        if extra:
            payload.update(extra(items))
        print(f"{key.upper()}_OK stations={len(items)}")
        return payload, None
    except Exception as error:
        print(f"{key.upper()}_SYNC_ERROR {error}", file=sys.stderr)
        existing = read_existing_payload(filename)
        if existing:
            existing["schema"] = max(int(existing.get("schema") or 1), 2)
            existing["lastAttemptAt"] = attempted_at
            existing["lastSuccessAt"] = existing.get("lastSuccessAt") or existing.get("updatedAt")
            existing["syncStatus"] = "degraded"
            existing["syncError"] = clean_text(error)[:180]
            print(f"{key.upper()}_KEEP_LAST_GOOD stations={len(existing.get('items') or [])}")
            return existing, error
        return None, error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-online", action="store_true", help="fetch and validate without writing data")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    sources = [
        ("upower", "upower.json", "U-POWER 官方網站", UPOWER_URL,
         lambda: parse_upower(fetch_text(UPOWER_URL)), validate_upower,
         lambda items: {"totalSeats": sum(int(x.get("ccs1Seats") or 0) + int(x.get("ccs2Seats") or 0) for x in items)}),
        ("evoasis", "evoasis.json", "EVOASIS 官方 DC 站點", EVOASIS_URL,
         lambda: parse_evoasis(fetch_text(EVOASIS_URL)), validate_evoasis, None),
        ("tail", "tail.json", "TAIL 特爾電力官方站點", TAIL_URL,
         lambda: parse_tail(fetch_text(TAIL_URL)), validate_tail, None),
        ("evalue", "evalue.json", "EVALUE 官方充電站", EVALUE_URL,
         lambda: sync_evalue(fetch_details=not args.check_online), validate_evalue, None),
    ]

    failures = []
    payloads = {}
    for key, filename, source_name, source_url, loader, validator, extra in sources:
        payload, error = source_result(key, filename, source_name, source_url, loader, validator, extra)
        if error:
            failures.append((key, error))
        if payload:
            payloads[filename] = payload

    if args.check_online:
        if failures:
            raise RuntimeError("; ".join(f"{key}: {error}" for key, error in failures))
        return 0

    if not payloads:
        raise RuntimeError("no operator source has usable data")

    for filename, payload in payloads.items():
        target = OUT / filename
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {target} {len(payload['items'])} stations status={payload.get('syncStatus')}")

    if failures:
        print("PARTIAL_OPERATOR_SYNC " + ",".join(key for key, _ in failures), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
