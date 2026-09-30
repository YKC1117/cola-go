# CCTV V3 verification — 2026-09-30

## Base and dependency

Remote main fetched and fast-forwarded: `8f6cfe4ef06614f1e19755b19f5325ab236ad424`.
PR #112 remains open at `92a568dda24593c0fa6443472f58bb1e3c9a183f`.
Its workflow runs returned failure/failure/cancelled, with no executed job steps.
One retry request per affected workflow returned `This workflow run cannot be retried`.
No further retries and no merge were performed.
This branch descends from #112 and preserves all V15 commits. The PR to main includes that dependency; it must not be merged until required checks pass.

## Changes

Road overview (six freeways plus other source roads), existing directions only,
official RoadName / direction / Start / End grouping, expandable compact cameras,
search by official names/direction/mileage/ID, and coordinate validation.
Missing endpoints use explicitly labelled 10K bands; a single supplied endpoint is retained.
No inferred cities or north/central/south region table. All source cameras remain reachable.
Only camera clicks open streams; official HTTP(S) stream URLs and valid coordinates are retained.
TDX and highway-bureau parsers/fallbacks remain in place; blank coordinates no longer become zero.
PWA cache incremented once from v6-38 to v6-39.
Charging runtime, TDX sync, CarKit and shortcut bytes are unchanged from #112.

## Executed checks

- PASS: `node --check assets/app.js` and UI validator syntax.
- PASS: existing `scripts/verify_ui_v6.cjs`, 293 assertions, Chromium 153.
- PASS: 390px, 430px, 1440px; overview and expanded segments; no page horizontal overflow.
- PASS: six-road overview without camera rows, road selection, actual-direction filters and reset.
- PASS: same official endpoints/direction merge; opposite directions remain separate.
- PASS: real checked-in 321K camera search across all roads (the snapshot contains matches on national road 3).
- PASS (explicit fixture): 永康 search, official endpoint grouping, all four direction aliases, missing/partial endpoints, mileage boundaries, ID search.
- PASS: JSON and XML parser retention; official stream URL passed to window.open; maps only with valid coordinates; unsafe stream URL/HTML rejected.
- PASS: no uncaught JavaScript errors; PWA cache and offline bundled charging data.
- PASS: every run step in `.github/workflows/validate-tdx-site.yml` executed locally.
- PASS: `.github/workflows/production-smoke.yml` executed against the local HTTP-served checkout, including shortcut SHA256 checks and data guards (`PRODUCTION_SMOKE_PASS`). This is NOT a deployed-site pass.
- PASS: `git diff --check`.

The existing V15 browser test failed before CCTV changes because it compared online station counts with offline counts; QA fetch fixtures also incorrectly remained online while the browser was offline. The validator now disables fixtures offline and compares the bundled offline dataset. Product charging behavior was not changed.
The V15 production guard still required the removed phrase `iParking／AmpGO／EVOASIS`; it now checks the actual V15 wording `iParking App・依站點支援`. Existing V15 rate/network guards remain.

## Data and verification limitations

All 1,825 checked-in CCTV records lack Start and End. The snapshot also contains no 永康 string. Production therefore displays honest mileage bands until the upstream snapshot supplies official endpoints; the 永康 acceptance is fixture-based, not a claim about production coverage.
The browser tests block external requests. They verify that clicking opens the original official stream URL; actual external video playback is not verified.
No live TDX credentials were read. No new external operator sync was triggered locally.
Deployment and remote CI are reported separately in the PR; this document does not assert their success.

Reproduce browser checks with Playwright and a compatible Chromium installed:

```sh
node --check assets/app.js
node scripts/verify_ui_v6.cjs
```

Optional `CHROMIUM_EXECUTABLE_PATH` and `QA_FONT_DIR` are supported by the existing validator. Screenshots are generated under `docs/ui-v6/screenshots`; CI uploads them as its existing artifact.
