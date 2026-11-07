# 承認後の本番反映・試験（2026-11-07）

ひちゃんが「うん、お願い。しっかり試験して欲しいな」と承認した範囲: 監査修正を含む候補の本番反映と、架空入力による追加AI最大1回。実購入・TestFlight配布・提出・秘密/利用上限変更は含まない。

- 反映前version `eb128156-5748-4f31-82dc-925f52dd9ba4` を再確認。変更競合なし。
- 反映前設定情報・artifact/source hashes・端末containerをGit外private領域へ退避。秘密値は読出していない。
- candidateの `npm run cf:deploy` 成功。新version **`cf45f762-b4d7-4269-a580-398ed865e095`** を100% activeで確認。API/Redis等bindingの名前と型は反映前後一致。
- **公開URL https://kiri.kugainc.com/**。/, /privacy, /terms, /support は200。トップが参照するstatic12ファイルはcandidate成果物とSHA-256一致。evidence/approved-live-http.json。
- **API保護9項目PASS・AI呼出0**: analyze/chatの許可Origin preflight204/完全一致、不許可OriginはACAOなし（4項目）。空shape400、不正JSON400、32769bytes413、空chat400、appUserIdなしchat403/not_entitled（5項目）。rate限界の負荷試験や有効payloadの再送はしていない。evidence/approved-live-negative.json。
- 実ブラウザは新しいシークレット領域で本番を開き、初期画面→架空profile保存→入力画面を確認。個人のWeb既存storageを変更していない。AI同意/送信・結果・保存の合格ではない。
- 端末の追加AIは**まだ0/承認1回**。本体でのロック解除完了の返事待ち。端末profile/history/lockを元へ戻した上で検証を終える。

CLIのObservability履歴API403に対して権限は拡張していない。現行serverは安全な固定reasonログを含むが、分析成功・拒否原因確定とは扱わない。後退時の切戻し先は上記旧version。H-02公開ゲートは維持。


## 実機再接続待ち

ミラー再接続を1回試みたが「iPhoneが見つかりません」。Mac近くで本体を最近解除し、Wi-Fi/Bluetooth有効・画面ロックが必要とのOS表示。Kiri本体認証→画面ロックの返事を待ち、プロフィールを書き換えず停止。追加AIは0/承認1回のまま。

CLI `wrangler tail` は既存権限で接続成功。不正JSON1回だけで現行versionの固定 `invalid_json` ログ受信を確認（追加AI0）。evidence/approved-log-probe.json。ライブtailは終了し、実機再開時に再接続する。最初のsampling-rate1指定はCLIで拒否され、指定を外して接続。権限拡張はない。


## 実機再試験完了・追加AI上限到達（21:55–22:00 JST）

- 接続復旧後に最新containerをGit外退避。合成profile（q / 1980-01-10 / 時刻・性別空）と「さんぽした」のみを入力し、端末v2同意→承認された追加1回をbuild3から実行。
- 21:55:13.655 JST、新本番versionから `[kiri-analyze] upstream status 400 provider_request_invalid` をCLI tailで確認。失敗案内と入力保持を実画面で確認。**追加1/承認1回を使用、再送なし。AI成功→結果保存→再起動復元は未合格。**
- `provider_request_invalid` は400の既知条件を認識できなかった固定分類。非JSON/過大/本文deadlineも同分類となるため、本文解析成功・spend/billing除外・具体的なリクエスト不備確定を意味しない。生の上流本文は保存していない。
- 試験入力を空欄へ戻し、元profileをUIで復元、v2同意を取り消した。containerを再取得しprofile/history3件/lockのraw値が直前原本と完全一致、同意キー無しを確認。完全終了→再起動でKiriロック画面を確認。試験用profileは残っていない。
- サーバーのライブtailは終了。秘密値・利用上限・支払・キー・権限を変更していない。evidence/resumed-ai-result.json。

### API静的再点検と正しい組織の確認待ち

AstraとAPI担当が独立再点検。旧APIversionの公式schemaにもSonnet5.5/effort mediumが載り、x-api-keyは現在も有効。bodyの明白な構造不備は見つからない。fallbackの全組合せ互換の明示保証は未取得。workspace非限定キーはworkspace headerが必要だが、legacy workspaceキーは作成先に固定され省略可能。本番キーscope未特定のため条件付き候補に留める。api-version-workspace-review.md。

repo旧HANDOVERには、2026-10-08作成のKiri専用workspace `wrkspc_012jzv8UJ1hKnEB5THWJzark`（当時月20USD/通知15USD、同workspaceのキーで200確認）の記録がある。現在ログイン中の個人向けAPI組織から当該workspaceの設定URLを開くと「ワークスペースが見つかりません／権限不足か別組織の可能性」と表示。削除されたと断定しない。先の表示組織の残高・上限をKiriのものと扱わない。ひちゃんへ作成元アカウント／組織を質問済み、キー値は依頼していない。追加AIなしで正しい組織・workspace・spend・キーscopeを確認するのが次。


## workspaceの所在は解消

現在のHitomi’s Individual OrgでKiri専用workspaceとkiri-vercel-prodのKiriスコープをライブ確認。IDと上限/通知も旧記録に一致。組織/Kiriの支出上限は未到達。Cloudflare本番secretとの対応と400原因は未確認。anthropic-key-workspace-current.md を参照。管理画面確認だけで追加AI0、キー/上限/支払変更なし。
