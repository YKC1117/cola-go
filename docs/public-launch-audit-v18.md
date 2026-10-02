# V18 — Public Launch Audit

Public-launch reliability and data-honesty pass.

- Fixed the V16 page-switch/disclosure regression caused by JavaScript replacement-string semantics converting $$ into a single $.
- Verification now checks the exact runtime collection selectors, not only syntax.
- Dynamic traffic, tunnel and parking status is evaluated from real timestamps with a 45-minute freshness threshold.
- Old parking availability is retained only as last-known reference and is labeled "最後剩餘 / 資料較舊".
- Old road data is clearly labeled and points users to 1968 for the current official state.
- Charging fault details no longer force themselves open.
- Fixed a visible Plate Center vehicle-scope engineering literal.
- Exact plate verification failures now say the service is unavailable instead of implying zero matches.

No core feature or data source was removed.
