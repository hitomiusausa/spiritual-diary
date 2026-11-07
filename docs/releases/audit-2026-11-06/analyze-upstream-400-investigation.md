# 読み解き実機失敗: upstream 400 調査（2026-11-07）

調査担当: API / safety agent。初回は読み取りのみで調査し、その後の明示指示で下記の診断分類だけを candidate にローカル実装した。追加 AI 送信・API key / 個人日記の読出し・deploy は行っていない。対象は既存ログの親エージェントからの報告、Git 内のソース、Anthropic の公式公開資料。

## 確認事実

- 親エージェントが Cloudflare の Kiri 既存ログを 12:05–12:09 JST の範囲で確認。合成データでの実機 build 2 の 2 試行に対応する 12:06:34.386 / 12:07:49.662 JST の双方が `[kiri-analyze] upstream status 400`。端末側の一般エラー表示だけでなく、Anthropic 応答の HTTP 400 が確認された（ログの直接閲覧は親担当）。
- 親確認の active version: `eb128156-5748-4f31-82dc-925f52dd9ba4`、deployment Git commit: `55933a283c5c44703691ccf7dca318c410980178`。監査基準 `aac43b630a8106903a7da3b5816e5556a07eb239` より古い。ただし両 commit 間の `analyze/route.api.js` / `chat/route.api.js` / `claudeResponse.js` の Git diff は空。監査修正を deploy した状態ではない。
- 親確認の live bindings に `CLAUDE_MODEL` / `KIRI_ANALYZE_EFFORT` は無い。両方ともコードの既定値を使用する。
- 親が既存 Anthropic Console の表示中の組織について、残高あり・spend 0 / 200k・workspace は Default のみ・Kiri 名の key は無し、と確認。ただし当該組織と Kiri の本番 key の対応は未確認。Kiri の残高 / spend 原因を除外・確定できる証拠にはしない。
- production commit の analyze は `claude-sonnet-5-5`、`max_tokens: 8000`、`output_config: { effort: "medium" }`、`fallbacks: "default"`、`anthropic-beta: server-side-fallback-2026-07-01`、`anthropic-version: 2023-06-01`。`temperature` / `top_p` / `top_k` は送っていない。
- upstream 非 2xx の本文は `await response.text()` で捨て、status のみ記録し、端末へ HTTP 502 / success false を返す。そのため元の 400 が UI の「入力を読み取れない」文言にはならない。本文にあるはずの error type / 原因メッセージは保存されていない。
- upstream 非 2xx は、AI 本文の抽出・JSON 検証・success 応答より前に終了する。今回の直接原因は、端末履歴保存、生成 JSON の不正、生成の `max_tokens` 到達、HTTP 200 の classifier refusal ではない。

## 公式仕様との照合（2026-11-07 読取）

| 照合項目 | 結果 / 根拠 |
| --- | --- |
| model ID | `claude-sonnet-5-5` は Claude API の正式 ID。最大出力 128K、adaptive thinking が既定オン。[Sonnet 5.5 overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) |
| effort | `output_config.effort: medium` は Sonnet 5.5 で有効。低遅延用途では medium / low を起点とする案内がある。[Effort](https://platform.claude.com/docs/en/build-with-claude/effort) |
| max_tokens | 8000 は最大値未満。thinking と本文の合算上限である点に注意が必要だが、今回の upstream 400 / 非 2xx の原因を token 到達とする証拠はない。[Thinking cost control](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost#cost-control) |
| fallback beta / parameter | `fallbacks: "default"` と `server-side-fallback-2026-07-01` は公式の組合せ。fallback は classifier refusal だけに適用し、rate limit / overload / server error を救済しない。400 の汎用再試行機構ではない。[Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#server-side-fallback) |
| sampling / version | Sonnet 5.5 は temperature 等を送ると 400。対象コードは送っていない。API version は最新ではないが 2023-06-01 は公式 version history に載り、これだけを今回の原因とする根拠はない。[Model overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)、[Versions](https://platform.claude.com/docs/en/api/versioning) |
| 自分で設定した spend limit | 組織 / workspace のユーザー設定 spend limit に達した場合は **400 / invalid_request_error**。今回と HTTP status が一致する。[Setting your own spend limit](https://platform.claude.com/docs/en/api/rate-limits#setting-your-own-spend-limit) |
| tier cap / billing | tier の月次 cap は 429。一般的 billing / payment 問題の公式分類は 402 / billing_error。400 だけから「残高不足」とは断定できない。[Rate limits](https://platform.claude.com/docs/en/api/rate-limits#reaching-your-spend-cap)、[API errors](https://platform.claude.com/docs/en/api/errors#http-errors) |

## 推測と残る切り分け

1. **Console の組織 / workspace spend limit を先に確認する。** 現在確認できた既定の model / effort / beta 組合せに明白な形式不適合は無く、ユーザー設定 spend limit は公式に 400 と記載される。残高・workspace の選択が正しいかも同時に確認する。これは有力な確認先であり、原因確定ではない。
2. **その他の provider request validation は残る。** 既存ログは upstream 本文を捨てているため、400 の error type / message が無く、仕様上正しい形でも組織固有の制約などを除外できない。
3. 監査版の bounded input / timeout / consent / 保存修正を deploy すれば、この 400 が解消すると現時点では言えない。送信する上記 model / effort / beta / token cap は監査版でも同じ。

## 診断ログの設計とローカル実装（本番未反映）

上流 error.message をログに戻すと、入力内容を provider がエラー本文へ含めた場合に記録してしまう。代わりに既存 `readBoundedJson` で非2xx本文を最大16 KiB・既存の全体deadline内で読み、既知条件に一致した時だけ固定 enum へ分類する。ログは route 固定値、upstream HTTP status、固定 reason のみに限定する。request ID も今回追加しない。本文・headers・API key・prompt・error.message・任意の error.type / details は出さない。

| 条件（例） | 固定 reason |
| --- | --- |
| invalid_request_error + 公式の組織 / workspace spend limit 接頭句に完全一致 | `provider_spend_limit` |
| rate_limit_error + details.error_code が厳密に enforced_spend_limit_reached | `provider_tier_spend_limit` |
| HTTP 402 | `provider_billing` |
| HTTP 401 | `provider_auth` |
| HTTP 403 | `provider_permission` |
| HTTP 404 | `provider_not_found` |
| HTTP 413 | `provider_request_too_large` |
| その他の HTTP 400 | `provider_request_invalid` |
| その他の HTTP 429 | `provider_rate_limit` |
| HTTP 529 | `provider_overloaded` |
| その他の HTTP 5xx | `provider_server_error` |
| 上記以外の status | `provider_unknown` |

公式 error message の接頭句は内部の分類比較だけに使い、出力には含めない。HTTP 400 / invalid_request_error と固定接頭句に加え、接頭句末の区切りまで照合し、似た文・任意の billing / credit 語からは推定しない。本文が未知 / 不正 JSON / 過大 / deadline でも、受信済みの HTTP status から分類する。deadline 時は読取中streamもキャンセルする。クライアントには従来の一般的な502を維持し、provider由来400を端末の入力不備と扱わない。

実装・確認結果: [provider-diagnostics.md](./provider-diagnostics.md)。82 targeted tests / 対象7 JSファイルのeslintがPASS。本番への反映も実AIによる解消確認も行っていないため、今回の400原因と成功経路は未解決のまま。
