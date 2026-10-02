# V22 — Nearby Charging Availability Fix

Root cause: the charging adapter applied a single dataset-level 45-minute freshness decision to every TDX station. When TDX's newest source timestamp was older than 45 minutes, every station became liveStale, so “附近有空槍” returned zero even when many stations had recent per-station availability records.

V22 changes the model:

- <= 45 minutes: TDX 即時驗證.
- >45 minutes and <=6 hours: TDX 最近回報, explicitly marked 非即時.
- >6 hours: stale/unknown and excluded from available results.
- Nearby/available filtering accepts live plus recent reports, preferring live.
- Recent rows are amber, not green, and never described as real-time.
- Station freshness is calculated per statusUpdatedAt. A stale dataset-level timestamp no longer blindly marks every station stale.
- Main-network fast-charge filtering can use a recent <=6h report, but the UI labels it as recent.
- Also fixes the charging empty-state relax buttons to use the querySelectorAll helper.

Diagnostic snapshot at 2026-10-02 18:46 +08 using the checked-in TDX cache:
- Tainan stations reporting available connectors: 198.
- <=45m fresh: 0.
- 45m–6h recent: 145.
- >6h old: 53.
This is why the previous 45-minute hard cutoff falsely produced “no nearby available chargers.”
