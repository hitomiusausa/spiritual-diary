# API・安全・同意の修正記録

担当: `/root/fix_api_safety`。2026-11-06。Astra最終裁定に基づくローカル修正。本番API・実AI・RevenueCat・実決済へ接続していない。

## 変更と指摘の対応

| 指摘 | 修正と検証 |
|---|---|
| C-01 | 不正JSONを400/固定codeへ。上流JSON/通信/未知例外も本文やmessageをログへ出さない。合成markerがログ/エラー返答へ出ないAPI試験 |
| C-02 | `parseBirthInput`と厳格な数値型/値域/任意文字列型を全体quota前に検証。計算もquota前へ。存在しない日付・99:99・文字列bioで400、AI/全体quota未使用 |
| C-03 | 保存キーは維持し同意version2。v1/不正同意は再確認。ModalFrameを使用し有効な機能に合わせた送信内容/契機・撤回を説明。撤回は保存削除が失敗しても先にセッション全体を不許可にする。明示再同意でのみ再許可 |
| C-04 | 両APIをストリームでバイト制限。Content-Lengthの欠落/虚偽にも実読取量で制限。分析32KiB、会話192KiB。超過は413、権利照会・AI・全体quota前。UI送信削減はT担当 |
| D-02 | 会話の最終発言はuser/文字列/非空/1200以下を必須とし、最新文を切り詰めない。超過文末の危機表現を落として通常AIへ送る経路を停止。規定内の危機文は従来どおり固定応答 |
| D-03 | 拒否・max_tokens・空・thinkingのみは502 `upstream_unusable`。省略記号の成功応答を撤去。失敗回数返却は追加していない。入力維持/履歴との分離はT担当 |
| D-04 | 会話のsystemは管理された人格・mode・安全だけ。nickname/entry/resultは構造化したuserメッセージへ。元の会話role順を保持。分析の危機指示もuserからsystemへ移し安全を優先 |
| D-05 | 人格は兎の妖精の正本を維持。分析側の別人格と同語尾の推奨/禁止の重複を削除。安全>modeの形式・文量>通常会話短さ。AI本文は絵文字なし、警告も同条件へ |
| D-06 | 既存3番号を公式と再照合し、確認日を11/06へ。有料窓口の注記と地域/IP電話等の公式補足リンクを追加。番号は追加していない |
| G-03 | サポートの長い平文URLを短い説明リンクに変更。共通の文書表示/実画面検証はroot担当 |
| A-02 | `inputContract.js`でUI/APIのUTF-16文字数上限を共有。nickname40、event1200、intuition600 |
| A-04/A-06 | 分析結果へ任意metadata `analyzedAt`（ISO）と`saju.birth.hasBirthTime`を追加。古い履歴を書換えない。表示はroot担当 |
| A-05 | 分析60秒/会話30秒の上流期限。fetchとJSON本文完了の両方が期限内。Abortを無視する代役でも有限時間に戻る。client90秒/45秒・中止はroot/T担当 |

## 共有インターフェース

- `inputContract.js`: `NICKNAME_MAX_CHARS`、`ENTRY_EVENT_MAX_CHARS`、`ENTRY_INTUITION_MAX_CHARS`、`CHAT_CONTEXT_MESSAGES`、`CHAT_USER_MAX_CHARS`、`CHAT_REPLY_MAX_CHARS`、2種timeout、2種body上限。JS `string.length`で既存APIとUIを統一。
- `apiRequest.js`: `ApiRequestError`、`readBoundedJson`、`fetchUpstreamJson`。本文や例外の生messageを外部へ返さない。
- `revokeConsent`は永続化操作より前にセッションを不許可へ。`recordConsent`の同期set成功後だけ再許可する。ネイティブ永続化確認はrootのflush結線で行う。
- `ConsentModal`はrootの`ModalFrame`（onClose/role/aria/className）を使用する。機能フラグで会話説明を切替え、無料Webに購入機能の文言を追加しない。

## 検証

- 7 files / **129 tests PASS**（18:26 JST）: apiRequest、apiRoutes、consent、kiriSafety、claudeResponse、fortuneResponse、legalPages。
- 新しい回帰試験: 実UTF-8サイズ・虚偽Content-Length・不正JSONの非漏えい・fetch待ち/body stallの期限・上流例外の固定分類・無効日付/時刻/bioとquota・拒否/空応答・systemへのmarker不混入/role順・metadata・v1再同意・撤回のremove失敗。
- 対象ESLint: エラー/警告なし。対象diff whitespace検査合格。
- 証拠ログ: `/tmp/kiri-api-regression-tests.log`、`/tmp/kiri-api-lint.log`。最終統合時はrootが全体ゲートへ集約する。
- この報告はleafの検証。ModalFrame実画面、設定文言、client中止、支援カードの失敗状態、iOS/本番ビルドは統合担当へ引き継ぐ。

## 外部情報と残る限界

- [厚生労働省の電話相談案内](https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/)を2026-11-06に確認。公開前と以後の定期確認が必要。実際の電話接続は試していない。
- [Anthropic商用APIの保持](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)を同日確認。標準30日以内と例外を区別し、自社保存ゼロとは別に記載。Kiri固有の契約条件は未確認。
- system/user分離と安全指示は防御改善であり、実AIの有害応答や注入を完全に防ぐと保証しない。今回の実AI評価は未実施。
