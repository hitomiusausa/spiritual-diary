# T 修正後ブラウザ検証

担当: `/root/audit_b_data`。2026-11-06。隔離candidateの修正後コードを専用WebKitセッション`kiri-post-t`で確認した。

**結果: 最終の連続実行で26チェック全PASS。** `T-chat-regression.js`が検証した状態のまま、結果JSONと画面画像を保存した。初回に検出したフォーカスの残問題はrootが修正し、その後に全体を最初から再実行して合格を確認した。

## 条件

- ローカル開発サーバー `http://127.0.0.1:3157`。課金は開発モックのみ。
- WebKit、375×812。一般レイアウトの幅/文字サイズ試験はrootの別検証へ委ねる。
- 新しい専用CLIブラウザ内のlocalStorageだけに、合成プロフィール・同意version2・過去会話2件を設定。
- 分析は完全な合成fixtureへroute差替え。`analyzedAt`、`birth.hasBirthTime`、`taiun.available/current`を含めた。
- 会話6リクエストは全てPlaywright routeで応答。403/502/503、成功、保留してからの遅延成功/失敗を制御した。自社本番API、Anthropic、RevenueCat、実StoreKit購入へ接続していない。

## 結果

| 対象 | 操作と観測 | 結果 |
|---|---|---|
| E-03 購入情報の反映待ち | モック購入直後の最初の送信を403 not_entitledへ。「購入し直す必要はありません」を含む反映待ち説明。入力保持、通常履歴不変、会話内に再購入CTAなし | PASS / 4チェック |
| D-03 失敗案内と会話履歴 | 502 upstream_unusable。入力を維持し、別alertへ案内。永続化された会話は送信前の2件のまま | PASS / 3チェック |
| D-01 失敗時の支援 | 架空の危機表現に503。入力保持、端末内の相談カード表示、通常履歴は不変。その後一般文へ変えると不要なカードは消える | PASS / 4チェック |
| G-02 会話削除確認 | 会話のゴミ箱→確認。初期focusはCancel。Tab/Tab/Shift+Tabの全てで最上位確認内を循環。Escapeで確認だけ閉じ、ゴミ箱へ戻る | PASS / 6チェック |
| B-03 遅延応答と削除 | 送信を保留→確認して会話削除→永続化0件を確認→成功を返す。別ケースで同じ順番から503を返す。両方で旧会話/assistantがstateにも永続領域にも復活しない | PASS / 6チェック |
| G-04 会話入力の名前 | `kiri-chat-input`と「Kiriに聞きたいこと」のlabelを確認 | PASS / 1チェック |
| G-02/B-03 再開 | Escapeで会話を閉じ、結果の入口から開き直す。会話は0件を維持 | PASS / 2チェック |

## 今回の再検証で補修した点

最初の実行では、ネイティブ`showModal()`だけではmacOS WebKitでボタン間のTabがBODYへ出た。rootが最上位dialog内の可視フォーカス対象を明示循環させる処理を追加した。

続く実行ではEscape後のfocusが親chatのDIALOGに戻り、ゴミ箱へ戻らなかった。Safariのクリックでボタンがfocusされないことと、native close/ReactのDOM除去の順序に対応するため、rootが開く前の明示focusとDOM除去後のrAF復帰を実装。最終の全26チェックでは両方とも合格した。

WebKit snapshotで確認ダイアログの名前が空に見えるケースがあったが、DOMの`aria-labelledby`は見出しへ一意に解決し、名前付き`getByRole('alertdialog', {name: '会話を削除しますか？'})`も成功した。これだけで追加不具合とは判定していない。実VoiceOverは端末検収へ残す。

## 証拠

- `output/playwright/post-audit/T-setup-chat.js`: 合成データ・モック分析・モック購入で会話を開く手順。
- `output/playwright/post-audit/T-chat-regression.js`: 最終の全26チェック。
- `output/playwright/post-audit/T-browser-results.json`: 全チェックの真偽と、合成会話の送信body/応答モードの記録。
- `output/playwright/post-audit/T-chat-after-regression.png`: 遅延成功/503の削除試験後、会話が空の画面。
- `output/playwright/post-audit/T-browser-source-sha256.json`: この検証後の関連ソースのSHA-256。
- `T-chat-delete-regression.js`は途中の切り分け用。最終の合格根拠は全26チェックの連続実行を使う。

最終実行のconsole error3件は、テストが意図的に返した403/502/503に対するブラウザのresource error。JavaScript例外や秘密情報の出力は確認していない。

## 実施していないこと

実iOSのソフトウェアキーボード、VoiceOver、実購入/復元/失効、実API権限キャッシュ、実AI応答、バックアップの実機共有・読み戻しは未確認。このブラウザ合格をそれらの合格へ置き換えない。rootのiOS成果物・一般WebKit・本番相当workerd検証も別記録とする。

T担当のブラウザ操作は完了。ローカル3157はrootが停止してiOS成果物検証へ進める。
