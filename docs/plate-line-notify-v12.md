# COLA GO 車牌中心 V12：LINE 個人化競標通知

## 目前狀態

網站端配對與候選同步流程已完成，正式安全後端已部署並啟用。GitHub Pages 不得持有 LINE Channel Secret 或 Channel Access Token。

## 隱私邊界

LINE 通知後端只接收：候選車牌號碼、主攻號碼、提醒事件種類與語系。最高預算、手動價格、監理站帳密、身分驗證資料與付款資料不得上傳。

## API contract

- POST /v1/plate-line/pairings
  - body: { profile, returnUrl }
  - response: { pairingId, expiresAt, lineUrl }
- GET /v1/plate-line/pairings/{pairingId}
  - pending: { status: "pending" }
  - linked: { status: "linked", deviceToken, displayName? }
- PUT /v1/plate-line/subscription
  - Authorization: Bearer {deviceToken}
  - body: { profile }
- DELETE /v1/plate-line/subscription
  - Authorization: Bearer {deviceToken}
- POST /v1/line/webhook
  - LINE Messaging API webhook. Must verify X-Line-Signature before processing.

配對由使用者主動開始。後端建立一次性配對碼並回傳 LINE 官方帳號聊天網址；使用者送出配對訊息後，回網站手動按「檢查綁定」。網站不可高頻輪詢。

## LINE backend requirements

1. Existing COLA GO LINE Official Account must enable Messaging API.
2. Channel ID and Channel Secret stay only in server-side secret storage; the backend issues short-lived stateless access tokens as needed.
3. Webhook verifies LINE signature before reading userId.
4. Pairing code is one-time and short-lived.
5. Store only the minimum mapping needed for notifications.
6. Push messages link back to COLA GO #plate; formal bidding/payment always remains on MVDIS.
7. Deduplicate events so a user doesn't receive the same alert repeatedly.

## Notification events

Initial profile subscribes to:
- official announcement match
- auction start reminders
- auction end reminders
- official deadline changes

The website does not claim live bid-price tracking. Official current price, bid count and final extended closing time must still be confirmed on MVDIS.

## Enable switch

After the HTTPS backend is deployed, update data/line-notify.json:

- enabled: true
- apiBase: the HTTPS backend base URL

Do not put any secret in data/line-notify.json.


## V12 backend implementation

施工分支已加入 Supabase Edge Function、資料表 migration 與獨立驗證腳本。

Backend includes LINE webhook signature verification, one-time 10-minute pairing codes, OA Basic ID @638jxfra handoff, hashed device bearer tokens, candidate/primary synchronization, announcement/start/end/deadline-change events, per-user batching, delivery deduplication, monthly LINE quota checks, and a protected cron endpoint.

正式部署時只把 line_channel_id、line_channel_secret、colago_cron_secret 存進 Supabase Vault；GitHub 與 data/line-notify.json 不保存憑證。後端會自動呼叫 LINE stateless token API 取得短效 access token，不需要保存長期 Channel Access Token。

為了維持 LINE 輕用量方案，runner 會先查當月 quota/consumption，並保留 20 則緩衝；同一輪多個候選事件會合併成同一個使用者的一次 push。


## Deployed free backend status

- Supabase project: existing free project, isolated under `cola-go-line` and `plate_line_*`.
- Edge Function: `cola-go-line` ACTIVE.
- Scheduler: every 2 minutes via pg_cron + pg_net.
- LINE webhook URL has been registered through the official Messaging API.
- LINE webhook verification returned success with HTTP 200.
- Current LINE webhook usage status is still inactive until `Use webhook` is enabled in the LINE console.
- The backend checks LINE monthly quota before push and reserves 20 messages.
- No long-lived Channel Access Token is stored; short-lived stateless access tokens are issued server-side from Channel ID + Channel Secret.

- 2026-10-02: LINE webhook official status confirmed active=true; pairing smoke test returned HTTP 200 and a valid one-time LINE handoff URL. Public website config is now enabled.
