# 統合指摘一覧

全8領域の監査報告と重要項目の独立確認が完了。各指摘の証拠・再現・確度は担当別報告を参照する。既存制約・外部接続待ち・実機未確認は確定コード不具合と区別。Astra最終裁定はastra-priorities.md。初回31件と追加F-03/C-05/G-05の計34件をローカル修正、H-02は外部確認ゲート。修正と再検証の詳細はfix-log.mdとverification.md。

| ID | 内容 | 担当報告 | 状態 |
|---|---|---|---|
| A-01 | 日本時間ではなくUTC日付でバイオリズムが切り替わる | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| A-02 | UI入力制約とAPI上限が一致しない | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| A-03 | 大運が計算できない通常状態でも空のカードを出す | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| A-04 | 出生時刻未入力時も「精密化」と説明する | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| A-05 | 分析通信が終わらないと入力へ戻れない | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| A-06 | キャッシュした過去の時柱を新しい時刻の「現在」として表示する | [A-core.md](A-core.md) | ローカル修正・検証済（範囲はverification） |
| B-01 | ネイティブの永続化失敗を利用者へ知らせず成功扱いする | [B-data.md](B-data.md) | ローカル修正・検証済（範囲はverification） |
| B-02 | 非破壊と説明するバックアップ読込が既存記録を押し出す | [B-data.md](B-data.md) | ローカル修正・検証済（範囲はverification） |
| B-03 | 送信中の会話削除が遅い応答によって取り消される | [B-data.md](B-data.md) | ローカル修正・検証済（範囲はverification） |
| B-04 | 保存データとバックアップのレコード検証が不足している | [B-data.md](B-data.md) | ローカル修正・検証済（範囲はverification） |
| B-05 | Preferencesの一部読込失敗で古い移行元へ全面降格する | [B-data.md](B-data.md) | ローカル修正・検証済（範囲はverification） |
| C-01 | 不正JSONや上流JSON解析の例外本文が運用ログに出る | [C-security.md](C-security.md) | ローカル修正・検証済（範囲はverification） |
| C-02 | 無効な生年月日・出生時刻でも全体分析クォータを消費する | [C-security.md](C-security.md) | ローカル修正・検証済（範囲はverification） |
| C-03 | 同意画面が会話送信を説明せず、読み解き専用と明言する | [C-security.md](C-security.md) | ローカル修正・検証済（範囲はverification） |
| C-04 | 会話送信時に最大1,000件の履歴を丸ごと自社APIへ送る | [C-security.md](C-security.md) | ローカル修正・検証済（範囲はverification） |
| D-01 | 危機の日記で分析が失敗すると相談カードが出ない | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| D-02 | チャットの危機判定より前に文字を切り詰める | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| D-03 | チャットで拒否・途中打ち切り・空応答を200成功として返す | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| D-04 | 利用者由来の会話文脈をsystem命令へ連結する | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| D-05 | 分析の人格と文体指示が推奨・禁止の両方を含む | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| D-06 | 相談カードに通話料金と接続条件の補足先がない | [D-safety.md](D-safety.md) | ローカル修正・検証済（範囲はverification） |
| E-01 | 固定商品IDと更新周期を検証しないまま購入する | [E-billing.md](E-billing.md) | ローカル修正・検証済（範囲はverification） |
| E-02 | offering取得の競合で最後に表示した価格と購入packageが一致しない | [E-billing.md](E-billing.md) | ローカル修正・検証済（範囲はverification） |
| E-03 | 購入/復元成功後にも非購読cacheが残り、最大60秒拒否される | [E-billing.md](E-billing.md) | ローカル修正・検証済（範囲はverification） |
| F-01 | 並行した書き出しが別の書き出し用ファイルを消す | [F-ios.md](F-ios.md) | ローカル修正・検証済（範囲はverification） |
| F-02 | 共有中に終了した場合の一時バックアップが削除対象に含まれない | [F-ios.md](F-ios.md) | ローカル修正・検証済（範囲はverification） |
| G-01 | 説明ポップアップの高さが制限されず、見出し/閉じるが消える | [G-ux.md](G-ux.md) | ローカル修正・検証済（範囲はverification） |
| G-02 | モーダルごとにフォーカスとキーボードの振る舞いが揃っていない | [G-ux.md](G-ux.md) | ローカル修正・検証済（範囲はverification） |
| G-03 | サポートの相談先URLが大きい文字で横にはみ出す | [G-ux.md](G-ux.md) | ローカル修正・検証済（範囲はverification） |
| G-04 | 直感欄の表示ラベルが入力へ関連付けられていない | [G-ux.md](G-ux.md) | ローカル修正・検証済（範囲はverification） |
| H-01 | ロックされた依存に既知の脆弱性が残る | [H-operations.md](H-operations.md) | ローカル修正・検証済（範囲はverification） |
| H-02 | 有料公開に必要な接続・費用検証・提出情報が未完了 | [H-operations.md](H-operations.md) | 外部確認待ち（公開阻害） |
| F-03 | 最低OS15.5に対し生成JSがSafari16.4構文を含み、Release初期画面が空になる | [F03-minimum-os-linkage.md](F03-minimum-os-linkage.md) | ローカル修正・最低OS起動/保存/復元確認済 |
| C-05 | Native Releaseの診断ログにPreferencesの保存値が出る | [C05-native-log-privacy.md](C05-native-log-privacy.md) | ローカル修正・同梱設定/保存/ログ抑止確認済 |
| G-05 | 実機の待機画面で中止ボタンが見出し横へ並び崩れる | [G05-loading-device-layout.md](G05-loading-device-layout.md) | 1行修正・lint/署名build3成功。修正後待機画面の実機再確認は未了 |

初回32件＋追加F-03/C-05/G-05＝35件。34件はローカル対処、H-02は外部の公開ゲート。Debug限定のSwiftUICoreリンク差はF-03補足に残し、配布用フラグや最低OSを変更していない。
