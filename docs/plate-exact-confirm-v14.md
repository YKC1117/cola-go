# Plate Center V14 — Official Exact Plate Confirmation

V14 upgrades numeric range matching into an official-detail verification flow.

For a watched number such as 1010:

1. Read current unresolved MVDIS auction announcements nationwide.
2. Build the concrete full plate for each matching range, e.g. CFQ-1010.
3. Follow that announcement's official `initdetail&seq=...` Excel detail.
4. Parse the sheet named 「重複號牌明細」.
5. Plates listed there are explicitly excluded because they duplicate newer-format plates, so COLA GO removes them from exact results and LINE alerts.
6. A plate inside the official announced range and not in the exclusion detail is labeled 「官方明細已確認」.
7. The user can copy that full plate and open the official MVDIS bidding page. Login, identity verification, bidding and payment remain entirely on MVDIS.

Detail XLS results are cached server-side for 24 hours and are fetched only for ranges that actually match a user's watched number. COLA GO does not crawl all detail files in bulk.

Production smoke test on 2026-10-02 for 1010 + private-car scope returned five confirmed full plates and zero official-detail exclusions: CFQ-1010, CGH-1010, CFU-1010, EBL-1010 and CDR-1010.
