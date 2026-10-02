# V23 — Nearby Available Charger Reliability

Root cause found during real-world testing: the “附近有空槍” action inherited several previous charging filters. A user who had previously selected CCS2, 100 kW+, an operator, a priority network, a quick filter or search text could get a false zero even though TDX currently had many available chargers.

V23 makes the button deterministic:

- Gets the user's location.
- Switches to distance sorting.
- Enables available/recent-available filtering.
- Clears city, road, direction, connector, minimum power, operator, major-network, quick-filter, favorites-only and search-text constraints.
- Does not clear saved favorites themselves.
- If the official TDX charging dataset has not arrived yet, the UI shows a loading state instead of “0 available”.
- Once official rows load, the existing TDX runtime re-renders automatically.
- Live availability stays honest: current status uses the live window; up to 6-hour recent reports remain labeled non-live.

At the time of diagnosis, the formal charging cache contained 443 Tainan stations, 211 stations with live connector status, 197 stations reporting at least one available connector, and 625 available connectors in total. The prior zero result was therefore a UI/filter problem, not an absence of Tainan availability data.
