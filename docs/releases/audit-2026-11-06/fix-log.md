# ローカル修正記録

監査基準 aac43b6から、Astraの初回32件と追加F-03/C-05の裁定に沿って計33件を修正。H-02は外部接続・実機・提出の確認ゲート。元作業ツリーの未コミット資料をGit外へ保全し、隔離candidateで実装した。コミット・push・デプロイ・提出はしていない。

| 指摘 | 変更 | 検証根拠 |
|---|---|---|
| B-01/B-05 | 保存失敗の状態通知・キー別flush・最新意図の再試行。Webでも未保存の新しい記録をbackupへ救出。初期化失敗は旧localStorageへ降格せず再試行画面。memory復旧で見えなかった既存値があれば衝突を知らせ上書きしない | S-fixes.md / S-integration-review.md /104 targeted tests |
| B-02/B-04 | 既存ID優先・空き枠だけ取込・スキップ数表示。型検証と破損原本保全、通常保存で空上書きせず専用原本出力。部分復元失敗後にUIを現在値へ同期 | S-fixes.md / root-review.md /バックアップ回帰 |
| B-03 | 会話削除・close/unmount後の遅い成功/失敗を世代とabortで無効化 | T-fixes.md / T-browser-verification.md |
| F-01/F-02 | 同期連打ガードと固有Cache path。起動/全削除の孤立回収、active path/他ファイル除外、修復用名も厳密に許可 | T-fixes.md / backupShare tests。実OS共有は別検収 |
| E-01/E-02/E-03 | 固定商品ID＋P1Mのみ。表示snapshotと購入tokenを照合。非購読cache方針を維持し、反映待ちの説明と明示再試行 | purchases tests / T-browser-verification.md。実StoreKitは未実施 |
| C-01/C-02/C-04 | 本文を含まない固定エラー、日付/時刻/値域をquota前検証、bounded body、会話送信は必要12件 | API-fixes.md / apiRoutes/apiRequest/chatRequest tests |
| C-03 | 同意キー維持・version2。送信内容と保持説明を整合し、撤回失敗もセッション送信停止。保存待ち/失敗後の拒否から遅れて送信しない | consent/consentFlow tests / root-review.md |
| D-01〜04 | ローカル支援を通信失敗時も維持。長文を黙って切らず拒否、拒否/空AI応答は失敗・入力維持。systemと利用者データを分離 | API-fixes.md / T-browser-verification.md。実AIの安全性保証とはしない |
| D-05/D-06 | 人格の正本とモード優先を整合、矛盾だけ除去。相談情報の確認日・料金注記・公式補足リンク | API-fixes.md / D-safety.mdの一次情報 |
| A-01/A-02/A-05 | JST暦日差、欄別上限と入力保持、中止/期限/古い応答無効化。通信完了と保存フェーズを分離 | biorhythm tests / API deadline tests /実画面QA |
| A-03/A-04/A-06 | 空の大運を説明へ。結果に出生時刻の有無と元分析時刻を保持し、旧柱を現在値と表現しない | API response tests / WebKit結果・説明 |
| G-01〜04 | Safe Area内でpopupスクロール、共通dialog・Tab循環/Escape/起点復帰/ロック時保留。開く部品のidentityを維持。長URLを短リンクへ、入力ラベル関連付け | WebKit実測 / T-browser-verification.md |
| H-01 | Next16.4.5/OpenNext1.20.16/wrangler4.158.0/eslint-config-next16.4.5。glob14.0.4をoverrideし最小API互換をビルド検証。上流で対応済みpreview manifestへ重複patchしない | prod audit0 / Web・OpenNext・iOS成果物の検証 |

## 統合レビューで追加修正したこと

root-review.mdのR-01〜07と、同意保存失敗後の拒否、取込失敗後の空プロフィール上書き、Web未保存intentの救出、復旧先衝突、native dialogのWebKit Tab・opener復帰も修正した。これらを未解消のまま、担当単体の合格で完了とはしていない。

## データと提供範囲

保存キー、通常backup schemaVersion=1、履歴30件/会話1000件、無料日記と有料会話、既存の色・フォント・余白の方針を維持。修復用原本は通常backupとは別形式。原子的な複数キー復元や実機での永続化を未検証のまま保証しない。

## 追加F-03・ビルド後検証の再現性

- package.jsonにSafari/iOS Safari 15.5以上のBrowserslistを明示。Nextの既定16.4向けclass static blockが15.5で構文停止する問題を解消。最低OS・SDK・private frameworkの配布フラグは変更しない。
- iOS15.5 Releaseを再ビルドし、初期画面・設定dialog・入力・同意拒否・UIでのプロフィール保存→完全終了→復元を確認。Preferencesの永続値も合成fixtureと一致。CSSはF03-css-compatibility.md。
- Xcodeのbuild/SourcePackages配下にあるSDK側のテスト8ファイルをVitestが拾うことと、Capacitorの生成public JSをlintすることを再現。vitest.config.mjsは通常除外を保ち生成ディレクトリを除外、eslintはios/App/App/publicを除外。プロジェクトの50テストファイルは引き続き全件実行。

### 追加C-05

Nativeログに保存値が出る実測を受け、CapacitorのログとWebView検査を明示的に無効化。同梱設定とRelease再buildを照合し、合成profileの保存/復元を保ったままstdoutにbridge結果・markerが出ないことを確認。C05-native-log-privacy.md / evidence/native-log-privacy.json。署名済み配布版と各実機経路の確認はH-02。
