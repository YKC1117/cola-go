# COLA GO TDX Worker

Zero-cost-first proxy for COLA GO. The browser never receives TDX credentials.

## Secrets

Set these only in Cloudflare Workers secrets:

```
npx wrangler secret put TDX_CLIENT_ID
npx wrangler secret put TDX_CLIENT_SECRET
```

Do not commit credentials.

## Routes

- `/api/parking/{City}/lots`
- `/api/parking/{City}/availability`
- `/api/ev/{City}/stations`
- `/api/ev/{City}/connectors`
- `/api/ev/{City}/status`
- `/api/highway/traffic`
- `/api/highway/cctv`
- `/health`

The Worker uses Cloudflare Cache API and only returns TDX data marked with source/fetchedAt/stale metadata. It does not proxy CCTV video.

## Cost rule

Keep the service on Cloudflare Workers Free and TDX free allowance. If upstream quota is unavailable, return an explicit error (or a previously cached stale response where available) rather than silently purchasing capacity or fabricating live data.
