# 本番key対応を確認する読取手段の調査（2026-11-07）

公開一次資料と、ローカルのWrangler 4.158.0のhelp / インストール済CLIソースを確認。認証付きCloudflare / Anthropic APIの実行、AI生成、secret値読出し、設定・権限・コード変更、deployは行っていない。この調査文書だけを新規追加した。

## Cloudflareの管理APIから分かる範囲

- [Get a secret binding](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/get/) は説明に **value omitted** と明記する。200例は`name / type`のみ。
- [List secrets](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/) は名前一覧の取得と明記し、200例も`name / type`のみ。共通型schemaに`text`の説明があることを、GETで値を回収できる根拠にしない。
- [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/#compare-secrets-and-environment-variables) も、定義後の値はWrangler / dashboardで見えないと説明する。
- 確認した公式管理API・CLIには、secret_text値のhash / fingerprintを返す標準の読取手段は無かった。Worker名・secret名・type・versionが同じでも、格納値が特定のAnthropic keyと同じとは証明できない。
- Worker runtime内ではsecretを利用できるが、今回の無変更・secret非読出しの条件では、その値を使う新しい診断コードを追加する手段は範囲外。名前の確認を値の一致確認へ言い換えず、再設定も実施・提案していない。

ローカル確認は`wrangler secret list --help`、`wrangler versions secret --help`、`wrangler versions secret list --help`。helpにはlistがあり、get / export / hashコマンドは無い。インストール済CLIの`fetchSecrets`は上記list endpointを呼び、pretty出力は名前だけ。versions secret listもversionのsecret_text bindingsの名前を出す。認証付きlist自体は実行していない。

## Anthropicの非生成GETから分かる範囲

| 公式endpoint / 資料 | 確認できる情報 | 制約 |
| --- | --- | --- |
| [GET /v1/organizations/me](https://platform.claude.com/docs/en/api/http/organization/retrieve) | 認証に使ったAPI keyに対応する組織の`type / id / name` | bodyにkey ID / workspaceはない。実際に認証したkeyの組織であり、別のローカルkeyを使ってもCloudflare本番keyの証明にはならない |
| [GET /v1/models](https://platform.claude.com/docs/en/api/http/models/list) | 利用可能モデルのmetadata | 生成はしないが認証が必要。workspace非限定keyではworkspace指定条件もある |
| [API共通response headers](https://platform.claude.com/docs/en/api/overview#response-headers) | `anthropic-organization-id / anthropic-workspace-id` | workspaceを解決しないAdmin requestや認証前失敗ではworkspace headerが無い場合がある。GETを本番と同じkeyで実行する必要がある |
| [GET /v1/organizations/api_keys/{api_key_id}](https://platform.claude.com/docs/en/api/http/organization/api_keys/retrieve) | key ID、name、status、期限、scope、partial_key_hint等。秘密値は返さないと明記 | **Admin API keyと既知のkey IDが必要**。通常の本番keyだけで自分のIDを返すself-introspectionとは異なる。新Admin権限を取得していない |

確認した公開endpoint一覧では、通常の認証key自身のkey IDを直接返す専用GETは発見できなかった。組織 / workspaceが一致しても、同じscopeの複数keyを区別する完全一致証明にはならない。partial_key_hintはhashではなく部分表示であり、Cloudflareのsecret名とは比較できない。

親担当は正しい組織内でKiriに単一scopeされた有効なpersonal keyを確認したと報告している。本番Cloudflare secretとそのkeyの対応は引き続き未確認。このscope付きkeyならworkspace headerを省略できるが、本番がそのkeyであるという前提をまだ確定していない。

## 現時点の結論

Cloudflareの読取管理APIだけでsecret値 / fingerprintを取得し、Consoleの特定keyと一致を証明する公式手段は確認できなかった。Anthropicの非生成GETは組織 / workspaceの確認には使えるが、本番keyで認証する既存の安全な実行経路が必要。今回、その経路を追加・実行せず、400の原因やkey不一致を断定していない。
