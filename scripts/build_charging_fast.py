#!/usr/bin/env python3
"""Build a compact first-paint charging snapshot from the published TDX cache.

The full charging cache keeps maintenance/debug fields. The first charging
paint only needs driver-facing fields. Rows are encoded as arrays so thousands
of stations do not repeat JSON property names; the service worker expands them
back to normal row objects before the existing UI sees them.
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

# Keep everything required for the first useful charging screen: station
# identity for humans, location/distance, rates, power/connectors and live gun
# status. Internal IDs, source URLs and maintenance-only fields stay in the full
# snapshot that is downloaded in the background.
ROW_KEYS = (
    "city", "cityName", "name", "location", "operator",
    "parkingRate", "chargingRate", "spaces", "connectors", "connectorCount",
    "maxPowerKw", "lat", "lon", "liveStateCount", "availableConnectors",
    "occupiedConnectors", "faultedConnectors", "unavailableConnectors",
    "unknownConnectors", "liveStatusKnown", "statusUpdatedAt", "liveStale",
)


def compact_row(row):
    return [row.get(key) for key in ROW_KEYS]


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    items = [compact_row(row) for row in data.get("items", []) if isinstance(row, dict)]
    if not items:
        raise SystemExit("charging-fast: source has no items")

    output = {key: data.get(key) for key in META_KEYS if key in data}
    output["fastSnapshot"] = True
    output["fastSchema"] = 2
    output["fields"] = list(ROW_KEYS)
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
