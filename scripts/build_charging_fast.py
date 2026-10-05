#!/usr/bin/env python3
"""Build a small first-paint charging snapshot from the published TDX cache.

The full charging cache intentionally keeps source IDs and detailed fields for
maintenance/debugging. The browser's first charging visit only needs the
fields below to sort nearby stations and render the normal charging cards.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "tdx" / "charging.json"
TARGET = ROOT / "data" / "tdx" / "charging-fast.json"

META_KEYS = (
    "status", "stale", "updatedAt", "staticUpdatedAt", "liveUpdatedAt",
    "lastAttemptAt", "source", "failedCities",
)

ROW_KEYS = (
    "id", "sourceId", "city", "cityName", "name", "location", "locationSource",
    "operator", "operatorId", "operatorWebURL", "serviceTime", "parkingRate",
    "chargingRate", "road", "direction", "note", "spaces", "connectors",
    "connectorCount", "powerModes", "maxPowerKw", "power", "lat", "lon",
    "liveStateCount", "availableConnectors", "occupiedConnectors",
    "faultedConnectors", "unavailableConnectors", "unknownConnectors",
    "liveStatusKnown", "statusUpdatedAt", "liveStale",
)


def compact_row(row):
    return {key: row[key] for key in ROW_KEYS if key in row}


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    items = [compact_row(row) for row in data.get("items", []) if isinstance(row, dict)]
    if not items:
        raise SystemExit("charging-fast: source has no items")

    output = {key: data.get(key) for key in META_KEYS if key in data}
    output["fastSnapshot"] = True
    output["items"] = items
    TARGET.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    source_size = SOURCE.stat().st_size
    target_size = TARGET.stat().st_size
    ratio = round(target_size / source_size * 100, 1) if source_size else 0
    print(
        "CHARGING_FAST_BUILT",
        "rows", len(items),
        "bytes", target_size,
        "sourceBytes", source_size,
        "ratioPct", ratio,
    )


if __name__ == "__main__":
    main()
