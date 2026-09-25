# COLA GO TDX Worker

安全的 TDX server-side proxy。GitHub Pages 前端不保存 TDX Client ID / Client Secret。

## 架構

GitHub Pages / PWA → Cloudflare Worker → edge Cache API → SQLite Durable Object → TDX

Durable Object 名稱固定使用 `global`，集中處理：
- OAuth access token 共用與更新
- TDX 每分鐘呼叫預算
- 月點數估算預算
- 429 全域 cooldown
- 最後成功 snapshot
- fresh / stale / unavailable 狀態

Cache API 只作區域性 edge cache，不當全域一致性資料庫。 靜態資料會沿用完整 fresh TTL，減少不必要的 Durable Object 請求；動態資料則以 5 分鐘為主，優先保護 TDX 免費額度。

## API

- `GET /api/v1/health`
- `GET /api/v1/capabilities`
- `GET /api/v1/parking/:city`
- `GET /api/v1/parking/:city/availability`
- `GET /api/v1/charging/stations?scope=city:Taipei`
- `GET /api/v1/charging/points?scope=city:Taipei`
- `GET /api/v1/charging/connectors?scope=city:Taipei`
- `GET /api/v1/charging/availability?scope=city:Taipei`
- `GET /api/v1/freeway/sections`
- `GET /api/v1/freeway/live`
- `GET /api/v1/freeway/cctv`
- `GET /api/v1/tunnel/xueshan/live`

所有資料路由支援：
- `limit=1..1000`
- `cursor=<non-negative offset>`

前端不能傳入任意 OData `$filter`、URL 或上游 host。

## 資料狀態

- `static`: 基本／設備 metadata
- `live`: 官方動態資料
- `stale`: TDX 暫時失敗，但仍在允許的 stale 時間內
- `unavailable`: 無可安全使用快照

`updatedAt` 是來源時間；不知道就維持 null。
`fetchedAt` 是 Worker 最後成功取得時間。
Cache 命中不會重寫這兩個欄位。

## Secrets

不要寫進 repository。

Production:

```bash
npx wrangler secret put TDX_CLIENT_ID --config wrangler.toml
npx wrangler secret put TDX_CLIENT_SECRET --config wrangler.toml
```

Staging:

```bash
npx wrangler secret put TDX_CLIENT_ID --config wrangler.staging.toml
npx wrangler secret put TDX_CLIENT_SECRET --config wrangler.staging.toml
```

`.dev.vars.example` 只有欄位名稱，不包含值。

## 預設安全開關

`TDX_ENABLED = "false"`

部署後先保持關閉。Secrets 設好、staging smoke test 完成後再改為 true。

## 本地驗證

```bash
npm ci
npm test
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
```

## Cache / stale TTL

- 停車基本：fresh 24h / stale 7d
- 停車即時：fresh 5m / stale 15m
- 充電站／樁／槍：fresh 24h / stale 7d
- 充電即時：fresh 5m / stale 15m
- 國道路段：fresh 24h / stale 7d
- 國道即時：fresh 5m / stale 15m
- CCTV metadata：fresh 24h / stale 7d

動態資料超過 stale 上限後不再顯示成可用即時資料。

## 免費模式保護

預設：
- TDX upstream 最多 4 calls / 60s
- 月點數預算 2.4
- 上游 timeout 8s
- 單一上游 page 2 MiB
- 公開 response 512 KiB
- 公開單次最多 1000 items

這是保守起步模式，不代表足以永久提供全台每分鐘即時服務。

## CORS

Production：
- `https://ykc1117.github.io`

Staging 額外：
- `http://localhost:5173`
- `http://127.0.0.1:5173`

CORS 不是認證；真正保護 TDX 的是 Durable Object 的共用 cache、budget 與 cooldown。

## 尚未完成的正式部署驗證

在沒有真實 TDX Secrets 的情況下：
- 真實 OAuth：NOT RUN
- 真實 TDX payload schema：NOT RUN
- 充電 station / point / connector / live ID 關聯：NOT RUN
- CCTV 實際展示條件：NOT RUN

因此 Worker 預設保持 `TDX_ENABLED=false`，不能把 mock / parser 測試當成正式 TDX PASS。
