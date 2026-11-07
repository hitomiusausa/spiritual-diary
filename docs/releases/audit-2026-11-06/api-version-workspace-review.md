# API version / workspace 追加調査（2026-11-07）

読み取り調査。公開公式資料と原本release/candidateソースのみ確認。追加AI・本番API呼出し・秘密値読出し・コード変更・deployは行っていない。この新規調査文書だけを追加した。

## 今回の観測と診断の限界

- 親担当の報告では、承認された1回をnative build3の合成入力で実施し、新本番版からupstream 400 / `provider_request_invalid`。以前の2回はbuild2であり区別する。
- このreasonは、400で既知spend条件を認識できなかった分類。正常なJSONを解析して接頭句が不一致だったという保証ではない。不正JSON・16 KiB超過・本文deadlineも元400を保って同reasonへ落ちる。spend / billing自体を除外したことにはならない。

## API versionとモデル設定

1. **確認できた直接根拠**: [Create a Message（API version 2023-06-01指定）](https://platform.claude.com/docs/en/api/messages/create?version=2023-06-01) はページ上に旧versionを表示し、`claude-sonnet-5-5`、`output_config.effort`（medium含む）、top-level `system`、user文字列のmessageを掲載する。versionが履歴にあるという根拠より強い。
2. [Sonnet 5.5 migration guide](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide) の通常例はSonnet 5.5＋medium。今回のbodyは、列挙される400要因（sampling指定・thinking budget / disabled・assistant prefill・forced tool choice・旧computer tool等）を送っていない。thinkingは省略してよい。
3. [2026-10-21 API migration](https://platform.claude.com/docs/en/api/migration-2026-10-21) はMessagesの変更としてassistant document、user citations、samplingパラメータ削除を挙げる。Sonnet 5.5 / effort / fallbackのために新versionが必須という記載は確認できなかった。**記載が無いことは全組合せの互換保証ではない。**
4. fallbackには限定が残る。[現行ガイド](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#server-side-fallback) は`default`＋`server-side-fallback-2026-07-01`を案内するが、旧versionとの全組合せを明示した箇所は取得できていない。[公式Cookbook](https://platform.claude.com/cookbook/fable-5-fallback-billing-guide) には旧versionと6月betaの併用例があるが、7月beta＋Sonnet 5.5を証明する例としては使わない。旧version指定のbeta API referenceは今回の資料取得手段では読めなかった。

結論: **旧versionとSonnet 5.5 / mediumが不適合という証拠は無く、旧versionの公式API schemaには両方載る。一方、fallbackを含む全組合せの実稼働を確認できたとは言わない。version更新だけで今回400が直るとは断定できない。**

## workspace headerの条件

- [Authentication / Select a workspace](https://platform.claude.com/docs/en/manage-claude/authentication#select-a-workspace) は、workspace非限定keyで`anthropic-workspace-id`を省略すると**400 / invalid_request_error**、単一workspace keyなら省略可能と明記する。[API overview](https://platform.claude.com/docs/en/api/overview#authentication) も同条件。
- 旧version指定の[Create a Message](https://platform.claude.com/docs/en/api/messages/create?version=2023-06-01) にも当該headerとscope条件が載る。新versionで必須化したとの記載は見つからず、version差よりkey scopeに依存する条件と読む根拠が強い。ただし実production keyのscopeは未確認。
- [Workspaces / API keys and resource scoping](https://platform.claude.com/docs/en/manage-claude/workspaces#api-keys-and-resource-scoping) はlegacy workspace keyは作成先workspaceへ固定、personal / service account keyには単一workspace型と非限定型があると区別する。**legacyという名前だけから非限定keyと推定しない。**
- 親が閲覧した組織はDefaultのみ・legacy key 5本・Kiri名無し。本番keyとの対応は不明。もし本番がそのlegacy workspace keyならheader省略は仕様上許容され、この候補は弱まる。Defaultしか無いこと自体は非限定keyのheader必須条件を免除する根拠ではない。
- API migrationのAdmin API欄では、旧versionの`workspace_id:null`がDefault固定keyと全workspace型の両方で使われ、新versionの`scope`では区別できると説明する。旧metadataのnullだけでscopeを決めない。今回はAdmin API・key照合を実行していない。

## 原本の送信body静的確認

原本releaseとcandidateの`src/app/api/analyze/route.api.js`はSHA-256一致: `4c1f9b9cb932cdd49af7c9f3358ac09ed0277a67c13499422dc7b3179c7eb46d`。

- 送信top-level keyは`model / max_tokens / output_config / fallbacks / system / messages`の6個。`max_tokens:8000`、effort既定medium、model既定Sonnet 5.5。
- `system`は管理された文字列定数の連結。`messages`は単一の`{role:"user", content:prompt}`。末尾assistant・role:system message・thinking blockの再送・tools・schema指定・fallback_credit_tokenとの衝突はない。
- 入力profile / entry / biorhythmはprompt文字列へ入り、outer body全体を`JSON.stringify`する。prompt中の出力JSON見本にある日本語注記は、APIに渡すJSONの構文ではなく文字列内容である。生成品質への影響と、API JSON構文不正の400を混同しない。
- `timestamp`、consent、profile等を未定義top-level fieldとしてAnthropicへ転送していない。受信元request headersも転送せず、定義したContent-Type / x-api-key / anthropic-version / anthropic-betaのみ。**anthropic-workspace-idは送っていない。**
- OpenNext patchはmanifest同梱の処理であり、この送信bodyを変更するコードは確認されなかった。これはローカルソースの静的照合で、秘密値を含む実送信payloadを取得・表示した確認ではない。

## Authorizationとx-api-keyの互換

[Authentication / Create and use a key](https://platform.claude.com/docs/en/manage-claude/authentication#create-and-use-a-key) は、Authorizationの代わりにlegacyのx-api-keyを使用できると明記する。[API migration / API keys are sent as Authorization: Bearer](https://platform.claude.com/docs/en/api/migration-2026-10-21#api-keys-are-sent-as-authorization-bearer) も、SDK/CLIは送信headerを変更するがClaude APIは両方を受け入れると明記する。旧version指定referenceのcURL例もx-api-keyを使う。

したがってBearerへの変更は、この資料から今回の必須修正とは判断しない。legacy workspace keyだけBearer必須という例外は確認できなかった。headerの認証方式と、別途のworkspace選択条件を混同しない。

現時点ではversion / payload形式 / workspace scopeのどれも原因確定に至らない。追加送信は禁止のまま。親からはprofile / history3件 / lockの原本完全一致、同意削除、再起動後ロック画面への復帰が報告された。公開・成功→保存→再起動の合格判定は保留する。
