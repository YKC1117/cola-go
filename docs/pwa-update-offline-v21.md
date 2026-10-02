# V21 — PWA Update & Offline Reliability

V21 prepares COLA GO for installed-PWA public testing without adding permanent UI.

- Service Worker identifies itself as Public Beta V21 and reports activation to currently open COLA GO windows.
- From V21 onward, a future Service Worker update can be detected by an already-open installed PWA.
- COLA GO does not forcibly reload while the user is actively using a page. It marks an update pending, shows a short toast, and reloads only after the app/page has gone to the background and later becomes visible again.
- First-time Service Worker installation does not trigger a false "new version" reload.
- Same-origin static assets remain network-first with cache fallback.
- Offline app-shell fallback is now limited to navigation requests. An uncached image/script/file returns a proper 503 instead of receiving index.html with the wrong content type.
- TDX, charging-operator and plate dynamic data remain network-only so old dynamic information is not silently presented as current.

The existing cache identifier remains unchanged to preserve the current production-smoke contract.
