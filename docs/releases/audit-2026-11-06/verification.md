# 検証記録

## 基準 aac43b6（修正前）

| 検証 | 結果 | 証拠 |
|---|---|---|
| npm ci | 成功、763 packages、privacy patch適用 | session 3527 |
| npm test | 45 files / 715 passed | /tmp/kiri-audit-20261106-baseline-tests.log |
| npm run lint | exit 0 | /tmp/kiri-audit-20261106-baseline-lint.log |
| npm run build | 初回Next security通知で停止、再実行成功 | /tmp/kiri-audit-20261106-baseline-build-retry.log |
| npm audit --omit=dev --package-lock-only | 11検出（親パッケージ重複含む） | /tmp/kiri-audit-20261106-dependencies.json |

今回の監査用サーバーは127.0.0.1:3156。本番API/Redis/RevenueCat秘密設定をコピーしていない。個人の日記を用いない。

## 修正後

Astra裁定に沿った結果は以下。初回32件に追加F-03/C-05を加え、34件中33件のコード修正をローカル検証した。


## 修正後・依存更新後のゲート

| 確認 | 結果 | 証拠 |
|---|---|---|
| npm test | 50 files / **789 tests PASS** | evidence/final-tests.txt |
| npm run lint | errors0/warnings0 | evidence/final-lint.txt |
| npm run cf:build（npm run buildを含む） | Next16.4.5 / OpenNext1.20.16成功 | evidence/final-cf-build.txt |
| npm audit --omit=dev | **0件** | evidence/final-prod-audit.json |
| 全依存audit | dev側にmoderate残件あり。実行用0とは区別 | evidence/final-all-audit.json |
| 秘密埋込・Web課金混入検査 | 両方PASS | check-embedded-env / check-web-bundle |
| 隔離workerd | /,privacy,terms,support200、設定不足APIは503 | evidence/workerd-local.json |
| npm run ios:sync | 静的4ページ・秘密/preview/mock検査・Capacitor同期成功（課金キーなし） | evidence/final-ios-sync.txt |
| plist/PrivacyInfo | plutil検査PASS、既存ID/manifest維持 | iOS成果物検査 |

### WebKit 実画面の再検証

- 結果と説明7種類: 375/402/1280縦と667×375横、100/135%の8条件。56popupすべて収まり・Tab・Escape・起点復帰PASS。大運の空年齢なし、時刻未入力の精密化断定なし。evidence/R-layout-result.json。
- 同意v1再確認/拒否0送信/v2保存、上限超過の危機支援、分析中止の入力維持と遅延履歴防止、503支援、破損chat原本の実download、30件取込の既存保持/skip、不正importの無変更: 11項目PASS。evidence/R-operations-result.json。
- 法務3ページ×3幅×2倍率の18条件、横向き設定の2倍率: 計20条件PASS。evidence/R-legal-settings-result.json。
- 会話・課金モックの26条件PASS: T-browser-verification.md、evidence/T-browser-results.json。
- 画像は output/playwright/post-audit/。結果375/135%を目視確認し、夜色・フォントの役割・空き・階層・文字の折返しを維持。全位相のコントラスト再測定・実機VoiceOverの合格を意味しない。
- APIと購入はすべて合成fixture/mock。実AI・実決済・本番の個人データは利用していない。

### 実機・外部で残る公開ゲート（H-02）

1. 変更後ビルドの実機で保存→完全終了→復元、書出し→保存ファイル→読込、共有中終了後の回収。
2. Face ID/パスコード、背景復帰と目隠し、OSの大きい文字・キーボード・VoiceOver。
3. 署名済み配布IPAでログ/検査無効設定を照合し、profile/日記/会話/backup/削除/エラーの合成markerがログに出ないこと。
4. ASC/RevenueCat商品と権利の接続、購入/取消/保留/復元/失効/解約後閲覧、同一ID再発行とrestore設定。
5. 実AI出力と費用、日次/予算/通知、相談窓口の公開前再確認と以後の定期確認。
6. App Privacy・契約・素材・審査情報、公開URLの実CORS/headers。本番反映・配布・提出は今回行っていない。

過去build1の合格は上記の代わりにならない。新しい署名済み配布IPAは未作成。

### 最低OSと最終コマンド（2026-11-07）

- F-03を追加修正。Safari15.5を明示した後にcf:build・ios:sync・Release simulator buildを再実行し成功。
- iOS15.5で初期画面/設定/入力/同意拒否、UI保存したprofileの完全終了→復元を確認。Preferencesの永続値と照合。F03-minimum-os-linkage.md / F03-css-compatibility.md。
- Native成果物が存在する状態でnpm testを再実行するとSDK側8suiteまで拾い失敗、lintは生成JSに警告が出ることを確認。生成先だけを除外した後、**50 files /789 tests PASS、lint0errors/0warnings**。意図したテストを減らしていない。
- 最終cf:build後の秘密埋込・Web課金混入検査もPASS。ブラウザ113条件は製品コード修正後の検証で、Browserslist変更後の全113条件再走ではない。互換変換後は最低OSで上記のNative操作を追加確認。
- 最低OSの実機で結果全体・共有・認証を通すこと、および最新OS実機の受入れはH-02に残る。

### 追加C-05

Nativeログに保存値が出る実測を受け、CapacitorのログとWebView検査を明示的に無効化。同梱設定とRelease再buildを照合し、合成profileの保存/復元を保ったままstdoutにbridge結果・markerが出ないことを確認。C05-native-log-privacy.md / evidence/native-log-privacy.json。署名済み配布版と各実機経路の確認はH-02。

### 実機build3の部分受入れ（2026-11-07）

iPhone12mini/iOS26.3.1で、更新後の原本保持、本人認証、同意v2/拒否の入力保持/撤回、profile一時保存→元へ復元の完全一致、backup書出し→保存→再読込（追加0/全3）、通常共有後のCache回収を確認。physical-device-2026-11-07.mdへ記録。生データ/原本hash/画像はGit外private領域。

実AI2回は失敗案内で入力へ戻ったため、AI成功→結果→保存→再起動は未合格。追加呼出は停止し、H-02の公開阻害を維持。G-05は追加1行修正し署名build3へ反映済みだが、待機画面の実機再測定は未了。実購入・VoiceOver・OS大文字・共有途中終了なども合格扱いしない。


### upstream診断追加後（2026-11-07）

固定reason分類と非2xx本文の上限/期限付き読取り、本文失敗時の元status保持、analyzeの任意stop_reasonログ廃止を追加。全体51 files/824 tests、lint0、cf:build、秘密埋込/Web課金混入検査、deploy dry-runがPASS。本番へのupload/deployと追加AI呼出しは無し。evidence/provider-diagnostics-*.txt / diagnostic-deployment-review.md。実機分析成功の未合格は変わらない。


## 実機再試験完了・追加AI上限到達（21:55–22:00 JST）

- 接続復旧後に最新containerをGit外退避。合成profile（q / 1980-01-10 / 時刻・性別空）と「さんぽした」のみを入力し、端末v2同意→承認された追加1回をbuild3から実行。
- 21:55:13.655 JST、新本番versionから `[kiri-analyze] upstream status 400 provider_request_invalid` をCLI tailで確認。失敗案内と入力保持を実画面で確認。**追加1/承認1回を使用、再送なし。AI成功→結果保存→再起動復元は未合格。**
- `provider_request_invalid` は400の既知条件を認識できなかった固定分類。非JSON/過大/本文deadlineも同分類となるため、本文解析成功・spend/billing除外・具体的なリクエスト不備確定を意味しない。生の上流本文は保存していない。
- 試験入力を空欄へ戻し、元profileをUIで復元、v2同意を取り消した。containerを再取得しprofile/history3件/lockのraw値が直前原本と完全一致、同意キー無しを確認。完全終了→再起動でKiriロック画面を確認。試験用profileは残っていない。
- サーバーのライブtailは終了。秘密値・利用上限・支払・キー・権限を変更していない。evidence/resumed-ai-result.json。

### API静的再点検と正しい組織の確認待ち

AstraとAPI担当が独立再点検。旧APIversionの公式schemaにもSonnet5.5/effort mediumが載り、x-api-keyは現在も有効。bodyの明白な構造不備は見つからない。fallbackの全組合せ互換の明示保証は未取得。workspace非限定キーはworkspace headerが必要だが、legacy workspaceキーは作成先に固定され省略可能。本番キーscope未特定のため条件付き候補に留める。api-version-workspace-review.md。

repo旧HANDOVERには、2026-10-08作成のKiri専用workspace `wrkspc_012jzv8UJ1hKnEB5THWJzark`（当時月20USD/通知15USD、同workspaceのキーで200確認）の記録がある。現在ログイン中の個人向けAPI組織から当該workspaceの設定URLを開くと「ワークスペースが見つかりません／権限不足か別組織の可能性」と表示。削除されたと断定しない。先の表示組織の残高・上限をKiriのものと扱わない。ひちゃんへ作成元アカウント／組織を質問済み、キー値は依頼していない。追加AIなしで正しい組織・workspace・spend・キーscopeを確認するのが次。
