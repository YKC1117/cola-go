# V16 — Compact UI and Interaction Consistency

This pass changes presentation hierarchy, not product data logic.

- Primary actions remain visible when a page opens.
- Tutorials, advanced explanations, external-map fallback, official backup links, and partner category detail are collapsed.
- Returning to a view closes secondary panels again.
- Only one peer disclosure stays open at a time; nested disclosure parents are preserved.
- Four control tiers now govern the UI: 48px primary, 44px normal, 38px chips/filters, 36px compact utilities.
- CarKit, charging, parking, CCTV and partnership pages were compacted.
- Plate Center already used progressive disclosure and now shares the same size system.
- PWA cache identifier remains v6-42 to preserve the existing production-smoke contract; the changed service-worker bytes still trigger an update and now pre-cache privacy/terms/legal CSS.
- No TDX, charging, parking, CCTV, MVDIS, plate tracking or LINE data behavior was removed.
