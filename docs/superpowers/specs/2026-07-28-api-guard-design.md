# 2026-07-28 API保護(レート制限・購読境界・利用量上限)設計

Status: ユーザー承認済み(方式3点をAskUserQuestionで確認)

## 目的

`/api/analyze` と `/api/chat` が認証なしで無制限に叩ける状態を解消し、
API費用の暴走と課金境界の曖昧さを公開前に塞ぐ(DECISIONS.md D-07の第一段階)。

## 決定事項

1. **レート制限はプロセス内メモリ方式**(承認済み)
   - IPアドレス単位・固定ウィンドウ(60秒)のカウンタ。
   - 既存の分析キャッシュ(D-04)と同じ「プロセス内のみ」の制約を明記する。
   - 複数インスタンス構成では効かないため、本番スケール時はRedis等へ差し替える。
   - モジュールはストレージを内包した小さなファクトリにし、将来差し替え可能にする。
2. **購読境界は entitlementスタブ+プレビューゲート**(承認済み)
   - `checkChatEntitlement()` をサーバー側に置き、現在は環境変数
     `KIRI_CHAT_PREVIEW`(`1`/`true`)のときのみチャットを許可する。
   - 未設定なら403 + `code: "chat_disabled"` を返す。クライアントのフラグは見ない。
   - 将来のStoreKit/RevenueCat検証はこの関数の内部に実装する(呼び出し側は不変)。
3. **利用量は日次グローバル上限+ログ**(承認済み)
   - JST日単位でAnthropic呼び出し回数を数え、上限超過で429を返す。
   - analyzeのキャッシュヒットは上限を消費しない(コストが発生しないため)。
   - 呼び出しごとに `[kiri-usage]` ログで当日カウントを出す。

## モジュール構成

### `src/lib/apiGuard.js`(新規・純粋モジュール)

- `createRateLimiter({ windowMs, max })` → `{ check(key, now) }`
  - 戻り値 `{ allowed: boolean, retryAfterSeconds: number }`
  - 固定ウィンドウ。ウィンドウをまたいだ古いエントリは検査時に破棄。
  - エントリ上限(1000キー)を超えたら古いものから削除しメモリを抑える。
- `createDailyQuota({ limit, timeZone: "Asia/Tokyo" })` → `{ consume(now), peek(now) }`
  - JST日付キーで加算。日付が変われば自動リセット。
  - 戻り値 `{ allowed: boolean, used: number, limit: number }`
- `clientKeyFromHeaders(headers)` → `x-forwarded-for` 先頭 → `x-real-ip` → `"unknown"`
- `now` は引数注入でテスト可能にする。実行時は `Date.now()`。

### `src/lib/entitlement.js`(新規)

- `checkChatEntitlement()` → `{ allowed, mode: "preview", reason }`
- 現在は `process.env.KIRI_CHAT_PREVIEW` のみで判定。env読み取りは関数呼び出し時に行う。

### 環境変数(すべて任意・デフォルトあり)

| 変数 | 既定値 | 意味 |
|---|---|---|
| `RATE_LIMIT_ANALYZE_PER_MIN` | 10 | analyzeのIP別 回/分 |
| `RATE_LIMIT_CHAT_PER_MIN` | 20 | chatのIP別 回/分 |
| `DAILY_LIMIT_ANALYZE` | 300 | analyzeのAnthropic呼び出し 回/日(全体) |
| `DAILY_LIMIT_CHAT` | 600 | chatのAnthropic呼び出し 回/日(全体) |
| `KIRI_CHAT_PREVIEW` | 未設定=無効 | チャット開発プレビューの有効化 |

## ルートへの組み込み順序

- `/api/analyze`: ①IPレート制限(429+Retry-After) → ②入力検証(既存) → ③キャッシュ照会(既存) → ④日次クォータ消費 → ⑤Anthropic呼び出し
- `/api/chat`: ①entitlement(403, `code: "chat_disabled"`) → ②IPレート制限(429) → ③入力検証(既存) → ④日次クォータ消費 → ⑤Anthropic呼び出し
- 429/403のエラーメッセージは詳細を含めない(既存方針を維持)。

## エラー応答の形

```json
{ "success": false, "error": "Too many requests", "code": "rate_limited" }
{ "success": false, "error": "Daily limit reached", "code": "daily_limit" }
{ "success": false, "error": "Chat is not available", "code": "chat_disabled" }
```

## テスト

- `src/lib/__tests__/apiGuard.test.js`: ウィンドウ内上限、ウィンドウ経過後の回復、
  キー分離、retryAfterSeconds、日次クォータの消費・日付リセット、clientKey抽出。
- `src/lib/__tests__/entitlement.test.js`: env未設定→拒否、`1`/`true`→許可。
- ルートは薄い統合に留め、ロジックはlib側で単体テストする。

## 既知の制限(DECISIONS.mdへD-08として追記)

- プロセス内のみ。再起動でカウンタはリセットされ、複数インスタンスでは共有されない。
- IPはプロキシヘッダ依存。信頼できるリバースプロキシ配下でのみ意味を持つ。
- 認証がないため同一IP内の複数ユーザーは同じ枠を共有する。
