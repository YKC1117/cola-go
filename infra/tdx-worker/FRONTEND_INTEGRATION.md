# COLA GO 前端接入契約

本文件只定義前端如何接 Worker；目前不代表 Cloudflare 已部署，也不代表真實 TDX 已通過。

## 啟用條件

只有在 staging 完成真實 TDX OAuth 與資料 payload 驗證後，才把正式 Worker Base URL 接進 COLA GO。正式前端不得保存 TDX Client ID / Client Secret。

## 建議 Base URL

前端只保存公開 Worker Base URL，例如：

```js
const COLA_DATA_API = "https://<production-worker-host>";
```

實際 hostname 必須以 Cloudflare 部署結果為準，不在 repository 內猜測。

## 公開資料入口

- `GET /api/parking/:city/lots`
- `GET /api/parking/:city/availability`
- `GET /api/ev/:city/stations`
- `GET /api/ev/:city/connectors`
- `GET /api/ev/:city/status`
- `GET /api/highway/traffic`
- `GET /api/highway/cctv`

所有路由都只接受 Worker 白名單中的 scope；前端不得自行組任意 TDX URL、OData filter 或 upstream host。

## 前端狀態處理

Worker envelope 的 `status` / `stale` 是顯示依據：

- `live`：可標示為官方即時資料。
- `static`：只當基本資料，不標示成即時。
- `stale` 或 `stale: true`：可顯示最後成功資料，但 UI 必須明確標示快取／非即時。
- `unavailable`：不要顯示假的 0 車位、假的可用充電槍或假的路況；改走既有靜態資料或官方／地圖入口。

`updatedAt` 是來源更新時間，`fetchedAt` 是 Worker 成功抓取時間。兩者未知時保持未知，不自行填現在時間。

## HTTP 錯誤

- `400`：前端參數錯誤。
- `403`：Origin 不在允許清單。
- `422`：該 scope / 城市目前不支援。
- `429`：單一使用者請求過多。
- `503`：TDX 關閉、額度保護、timeout、429/5xx 或沒有可安全使用的資料。

前端遇到非 2xx 時先解析 JSON error envelope，再降級；不得把 HTTP error 當成空陣列後顯示「0」。

## 分頁

預設 `limit=500`，可傳 `limit=1..1000` 與 `cursor=<non-negative offset>`。若 `pagination.nextCursor` 非 null，再取下一頁。

## 正式切換前驗收

以下全部有真實結果後才能把正式資料來源切過去：

1. Cloudflare staging deploy 成功。
2. Secrets 只存在 Worker Secrets。
3. 真實 OAuth 成功。
4. 至少一個支援城市的停車基本／即時 payload 通過。
5. 至少一個支援城市的 EV station / connector / live status 關聯通過。
6. 國道路況 payload 通過。
7. CCTV 清單 payload 與 URL 安全規則通過。
8. 429、timeout 或上游失敗時 stale / unavailable 行為實測。
9. 確認沒有產生付費方案或購買 TDX 點數。

未完成上述項目時，一律維持 `TDX_ENABLED=false`，不可宣稱正式上線。
