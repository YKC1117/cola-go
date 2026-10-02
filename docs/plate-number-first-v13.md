# Plate Center V13 — Number First

Goal: make the default flow usable by a driver who only cares about a number such as 1010.

Default flow:

1. Enter 1–4 digits.
2. Start nationwide tracking.
3. COLA GO matches that number across all public plate-announcement rows, regardless of letter prefix or motor-vehicle office.
4. If LINE is already bound, candidate changes automatically sync to the LINE subscription.
5. The candidate card shows nationwide match count and offices. Full announcement lists, budget, manual price, sorting, backup, notification diagnostics, checklist, and office directory are collapsed by default.

New watches are stored as numeric targets. Legacy full-plate watches remain readable, but LINE subscription profiles normalize them to their numeric suffix so notifications follow the new nationwide-number semantics.

Formal availability, bidding, identity verification, payment, and final results remain on MVDIS.

## Fresh official data path

V13 normal operation no longer depends on GitHub cache freshness.

- The 2-minute Supabase runner is only the notification clock; it does not hit MVDIS every 2 minutes.
- Primary source is the official MVDIS 「號牌標售公告」 page.
- The backend opens one MVDIS session, keeps its CSRF token/cookie, selects 「全國不分區域」 + 「不分車牌」 + 「未決標」, then follows every current result page using the official pagination parameter.
- The current production smoke test discovered 41 pages and parsed/deduplicated 409 current unresolved announcement rows.
- A full nationwide source refresh occurs at most once every 6 hours. Between refreshes, website and LINE notification checks use the Supabase cache.
- The static GitHub `data/plates/announcements.json` is fallback only; GitHub Actions frequency is not increased.
- Direct THB CSV access from Supabase is blocked by the official site's Incapsula protection, so the cloud backend intentionally uses MVDIS instead of repeatedly retrying the blocked CSV.
- Numeric watches are nationwide: 1010 matches any prefix and any motor-vehicle office whose official announcement range contains 1010.
- New announcement matches are deduplicated per official row, then grouped into one LINE summary per watched number. Expired old rows do not cause the same number to be announced again.
- Start/end/deadline reminders retain the concrete full plate prefix and office so the user knows which official auction to open.
- The LINE quota API is only called when there is actually a message ready to send, and 20 messages remain reserved as a safety buffer.
- pg_net waits up to 15 seconds for the 2-minute runner, avoiding false timeout records when the Edge Function legitimately needs more than 5 seconds.

Formal availability, bidding, identity verification, payment, extension results, and final outcomes remain on MVDIS.


## Vehicle scope

The default nationwide watch is now 「自用汽車」 rather than every vehicle class. This keeps motorcycle auction rows from creating noise for typical car owners. The default server/client categories include self-use passenger/light vehicles and electric self-use passenger vehicles (plus their disabled-owner variants). Users who really want every plate class can switch 「追蹤車種」 to 「全部車種」 inside Advanced Settings.

The selected scope is part of the LINE subscription profile. Existing LINE bindings are migrated once to the V13 numeric + vehicle-scope profile; an invalid old device token is cleared and asks the user to bind LINE again instead of falsely showing a working binding.
