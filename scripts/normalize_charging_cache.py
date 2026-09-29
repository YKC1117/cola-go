#!/usr/bin/env python3
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARGING = ROOT / "data" / "tdx" / "charging.json"
PARKING = ROOT / "data" / "tdx" / "parking"

CONNECTORS = {
    "1": "CCS1", "2": "CCS2", "3": "CHAdeMO", "4": "Tesla TPC",
    "5": "J1772", "6": "Type2", "254": "其他", "255": "其他",
    "J1772(Type1)": "J1772", "J1772 / Type1": "J1772", "J1772/Type1": "J1772",
    "Mennekes(Type2)": "Type2", "Mennekes / Type2": "Type2",
    "Mennekes/Type2": "Type2", "Type 2": "Type2",
}

def canonical_name(value):
    text = re.sub(r"\s+", "", str(value or "")).strip()
    if text.startswith("YES裕捷能源"):
        text = text[len("YES裕捷能源"):]
    return text

def unique_parking_addresses(city):
    path = PARKING / f"{city}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    grouped = defaultdict(set)
    for row in data.get("items", []):
        if not isinstance(row, dict):
            continue
        name = canonical_name(row.get("name"))
        address = str(row.get("address") or "").strip()
        if name and address:
            grouped[name].add(address)
    return {name: next(iter(values)) for name, values in grouped.items() if len(values) == 1}

def main():
    data = json.loads(CHARGING.read_text(encoding="utf-8"))
    rows = [row for row in data.get("items", []) if isinstance(row, dict)]
    before_legacy = sum(
        any(str(v) in {"J1772(Type1)", "Mennekes(Type2)"} for v in row.get("connectors", []))
        for row in rows
    )
    before_numeric_operator = sum(bool(re.fullmatch(r"\d{8}", str(row.get("operator") or ""))) for row in rows)
    before_city_only = sum(not row.get("location") or row.get("location") == row.get("cityName") for row in rows)

    address_maps = {}
    connector_changes = operator_changes = location_changes = 0
    for row in rows:
        connectors = row.get("connectors")
        if isinstance(connectors, list):
            normalized = []
            for raw in connectors:
                value = CONNECTORS.get(str(raw), str(raw))
                if value and value not in normalized:
                    normalized.append(value)
            if normalized != connectors:
                row["connectors"] = normalized
                connector_changes += 1

        operator = str(row.get("operator") or "").strip()
        operator_id = str(row.get("operatorId") or "").strip()
        if re.fullmatch(r"\d{8}", operator):
            row["operator"] = f"TDX 業者 {operator}"
            operator_changes += 1
        elif not operator and operator_id:
            row["operator"] = f"TDX 業者 {operator_id}"
            operator_changes += 1

        city = str(row.get("city") or "")
        city_name = str(row.get("cityName") or "")
        location = str(row.get("location") or "").strip()
        if city and (not location or location == city_name):
            if city not in address_maps:
                address_maps[city] = unique_parking_addresses(city)
            address = address_maps[city].get(canonical_name(row.get("name")))
            if address:
                row["location"] = address
                row["locationSource"] = "TDX parking"
                location_changes += 1

    after_legacy = sum(
        any(str(v) in {"J1772(Type1)", "Mennekes(Type2)"} for v in row.get("connectors", []))
        for row in rows
    )
    after_numeric_operator = sum(bool(re.fullmatch(r"\d{8}", str(row.get("operator") or ""))) for row in rows)
    after_city_only = sum(not row.get("location") or row.get("location") == row.get("cityName") for row in rows)

    CHARGING.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        "CHARGING_CACHE_NORMALIZED",
        "rows", len(rows),
        "connectorChanges", connector_changes,
        "operatorChanges", operator_changes,
        "locationChanges", location_changes,
        "legacy", before_legacy, "->", after_legacy,
        "numericOperator", before_numeric_operator, "->", after_numeric_operator,
        "cityOnly", before_city_only, "->", after_city_only,
    )

if __name__ == "__main__":
    main()
