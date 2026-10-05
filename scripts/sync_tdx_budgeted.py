#!/usr/bin/env python3
"""Run TDX sync in quota-aware slices.

The legacy sync_tdx.py keeps the data normalization logic. This wrapper only
decides which slice is allowed to run so scheduled jobs cannot accidentally
refresh every live dataset every hour.
"""
import os

BUDGET_MODE = os.environ.get("TDX_BUDGET_MODE", "charging").strip().lower()
ALLOWED = {"charging", "roads", "parking", "static", "all"}
if BUDGET_MODE not in ALLOWED:
    raise SystemExit(
        "TDX_BUDGET_MODE must be charging, roads, parking, static, or all"
    )

# sync_tdx validates TDX_SYNC_MODE during import. Feed it a compatible legacy
# value, then expose the precise budget mode in status.json after import.
os.environ["TDX_SYNC_MODE"] = (
    BUDGET_MODE if BUDGET_MODE in {"static", "all"} else "dynamic"
)

import sync_tdx as tdx  # noqa: E402


def main():
    tdx.OUT.mkdir(parents=True, exist_ok=True)
    tdx.PARK.mkdir(parents=True, exist_ok=True)

    tok = tdx.token()
    print("TDX_BUDGET_MODE", BUDGET_MODE, flush=True)
    if not tok:
        print(
            "TDX_SYNC_SKIPPED_AUTH; existing published cache remains unchanged",
            flush=True,
        )
        return 0

    # Keep status.json honest about the slice that actually ran.
    tdx.SYNC_MODE = BUDGET_MODE

    if BUDGET_MODE in {"all", "static"}:
        tdx.sync_parking_static(tok)
        tdx.sync_charging_static(tok)
        tdx.sync_freeway_sections(tok)
        tdx.sync_cctv(tok)

    if BUDGET_MODE == "all":
        tdx.sync_parking_live(tok)
        tdx.sync_charging_live(tok)
        tdx.sync_freeway_live(tok)
    elif BUDGET_MODE == "charging":
        tdx.sync_charging_live(tok)
    elif BUDGET_MODE == "roads":
        tdx.sync_freeway_live(tok)
    elif BUDGET_MODE == "parking":
        tdx.sync_parking_live(tok)

    tdx.write_status()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
