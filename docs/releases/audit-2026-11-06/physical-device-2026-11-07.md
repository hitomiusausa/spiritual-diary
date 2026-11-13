# 修正後の実機受入れ（進行中）

2026-11-07、ひちゃんからUSB接続端末での検証依頼。検証済candidateと元releaseのコード/設定のハッシュ一致を確認して開始。

## 接続と保全

- 実機: iPhone 12 mini / iOS26.3.1、USB接続・ペア済・Developer Mode enabledをdevicectlで確認。
- Kiri旧IDと配布IDの2アプリが存在。対象はcom.kugainc.kiri.ios。開始時version1.0/build1。
- 対象アプリのcontainerをMacのGit外領域へ全コピー成功（23files /3,656,299bytes）。Preferencesの既存history3件。本文は報告へ出さず原本hashで保全。
- バックアップ・端末詳細・原本hashは `/Users/usausagi/Documents/AI_Playground/spiritual-diary-qa/physical-qa-20261107-1153/`。権限を制限し、Gitや外部サービスへ転送しない。
- 監査後ソースからRelease/build2の開発署名buildに成功。App ID/保存キーを維持。インストールや起動の成功前に合格とはしない。

## 実施台帳

| 項目 | 状態 |
|---|---|
| 既存データ退避 | PASS（copy成功・全hash記録） |
| 修正後Release署名/同梱設定確認 | PASS（KUGA法人・対象device含むprofile・codesign strict・ログ/検査無効） |
| 更新インストール/既存記録保持 | PASS（同じApp ID、history3件とprofile/chat/lock値が更新前後で一致） |
| 起動/同意再確認/拒否 | 起動PASS。既存ロック画面で本人認証待ち、同意は未実施 |
| 合成記録保存→完全終了→復元 | 未実施 |
| バックアップ保存→再読込/非破壊/重複 | PASS（本人保存報告＋書出成功UI＋追加0/全3＋Preferences原本一致） |
| ロック/認証/背景目隠し/自動ロック | 本体認証成功＋解除画面、短時間復帰、ホーム82秒後の自動ロックPASS。切替カードの見えた範囲は隠れていた |
| 大きい文字/キーボード/VoiceOver/主要画面 | 未実施 |
| Nativeログの合成marker非出力 | 未実施 |
| 購入/復元/失効 | 未接続・今回は通常機能と分離 |

実AIを使う場合は合成情報で最大2回。実際の日記・生年月日を検証目的で送信しない。既存3記録の削除・全削除や原本を押し出す操作を避ける。App Store/TestFlightへのアップロードや公開はこの検証依頼に含めない。

## 現時点の境界

- version1.0/build2はUSBで直接入れた開発署名Release。App Store/TestFlightへアップロードしたビルドではない。配布中のbuild1との区別を維持。
- ミラーリングでの認証失敗をFace ID/パスコード機能全体の不具合とは断定しない。本体の認証結果を別途確認する。
- 生データ・認証画面のprivate証拠は上記Git外ディレクトリだけに保存。リポジトリには端末シリアル/生年月日/日記本文を記録しない。

## 認証後の追加実測

- 本人が本体で認証成功と報告。その後ミラーリング再接続で入力画面をrootが確認。本人認証PASS（本人報告＋解除後画面）。
- UIで検証用profileへ一時変更し、Preferencesの永続値が合成値になったことを照合。元profileは保全済み。**現在は合成profileのため、検証終了前に元へ復元・照合が必要**。
- 同意v2の再確認画面が小さい画面に収まり、拒否後に入力が残ることを目視。v2同意は端末へ保存済み。
- 合成情報で実AIを2回試行し、両方generic失敗案内で入力へ戻った。入力保持PASS、成功結果/履歴保存は未合格。以後のAI送信を停止。既存history3件を維持。
- OPTIONSはcapacitor originで204/CORS一致。画面上の文言はnetwork/400/429と異なる汎用失敗。ただしHTTP正確値・上流原因は未確定。API監査修正は未deployで、既存本番APIに対する測定。
- Cloudflare公式Observability APIで対象worker/試行時刻だけの履歴照会を試したが403。権限を拡張していない。原因確認は未了。
- 追加G-05: loading外側flex-col欠落で中止ボタンが見出し横へ並ぶ実害。担当Tが1行修正、Astra P2 fix-now裁定、lint PASS。署名済みRelease build3を作成・codesign確認済み。まだ端末にinstallしていないため実機再確認は未了。
- 再開時点は本体使用によるミラーリング切断。接続待ち。追加AI呼出は行わず、先に元profile復元→build3更新→表示・backup・再起動確認。backupの再認証は本体での本人操作が必要になりうる。

## 16:38時点の再開

- ロックしたとの報告を受け再接続。長時間経過後でKiriは再ロック状態。resume-preferencesを退避し、既存history3件の保存値が開始時と完全一致、profileは検証用のままを確認。
- 署名・設定検証済みbuild3を同App IDへ更新install成功。更新後起動ロック画面を確認。本人に本体での認証→画面ロックを依頼中。profile復元はまだ未実施。
- 認証を迂回/無効化せず、復元前に完了扱いしない。AI追加送信なし。

## 16:46 元profile復元完了

- build3で認証後の入力画面に到達。UIから元profileの全項目を復元し、Preferencesを再取得。profileとhistoryの保存値が開始時と完全一致、history3件を確認。profile-restoration-verification.jsonが証拠。検証用profileは残していない。
- ミラーリングのtypeTextはIMEで重複が出たため、短いpressKey（durationMs10）と変換確定を分けて入力し、最終永続値で判定した。アプリの文字入力不具合と断定しない。
- 設定dialogのスクロール、ロック設定維持、バックアップボタンの表示と操作域を確認。本体での再認証を伴う書出し→「このiPhone内」へ別名保存を本人へ依頼中。クラウドへの保存や既存ファイル上書きは依頼しない。
- 次: 保存済みJSONを実機から読み込み→追加0件/全3件と原本一致を確認。実AI成功経路は引き続き未合格。追加送信なし。

## 16:51 バックアップ往復PASS

- 本人が保存成功と報告。再接続後にrootが書出成功noticeを確認し、読み込む→最近使った項目の16:49保存Kiri JSONを選択。UIは「追加0件・全3件」。
- after-import-containerのPreferencesを開始前と照合。profile/history/lock設定が完全一致、既存3件の保持PASS。検証用profileは復元済み。証拠: backup-roundtrip-verification.json、backup-import-zero-three.png（private領域のみ）。
- 共有後のapp Cacheに対象kiri-backup-/kiri-recovery-backup- JSONは0件。一時平文回収PASS（通常共有終了の今回測定）。共有途中強制終了の検証とは区別。
- 検証で有効にしたAI同意を設定UIから撤回し、Preferencesから同意が消え、再確認案内へ変わることを確認。次の実利用時に本人がv2説明を確認できる状態にした。
- 短い背景移行→Kiri復帰で設定内容の維持を確認。切替画面のKiriカードは見えた範囲で本文が隠れていたが、全カード/全フレームの保証とはしない。
- 1分自動ロックの実測を開始。追加AI送信なし。

## 16:56 自動ロック確認・現在地

- 短い背景移行後の設定復元はPASS。切替一覧に留まるだけではpauseを数えない実装なので、自動ロックは別にホームへ戻して計測した。ホームで82秒経過後に同アプリをactivateし、設定画面でなくロック画面へ復帰することをrootが確認。設定値1分の自動ロックPASS。追加の本人認証は不要な確認として、端末はロック画面で終了。
- profile/既存history3件/lock設定の原本一致、backup往復と通常終了後の一時JSON回収はPASS。同意は検証後に撤回済み。
- 残る公開阻害: 実AI2回失敗の原因と成功→結果→保存→再起動の経路。実購入/復元/失効、実機VoiceOver/OS大きい文字、共有途中終了、build3の待機画面再測定、Native全経路markerのログ検査は未合格のまま。
- 今回の実機部分受入れは上記の範囲。App Store/TestFlightの追加配布・本番deployはしていない。


## 追加調査: Anthropic upstream 400

既存ログイン済みCloudflare画面で12:06:34.386 / 12:07:49.662 JSTに `[kiri-analyze] upstream status 400` を確認。2試行はbuild2で、build3はG-05修正後のインストール。追加AI送信はしていない。本番は監査前のAPIで、上流の本文を捨てるため400の詳細理由は記録なし。

Anthropic Consoleの表示中組織は残高あり・組織支出上限未到達、Defaultワークスペースのみ。キー一覧にKiri名は無く、本番キーとの対応は未確認。残高不足やspend limitを原因と断定しない。支払・上限・キー・権限は変更していない。Astra判定はH-02 P1公開阻害を維持。安全な固定reason分類のローカル検証→必要なら診断deployと最小追加AI再試験の個別承認→原因解消後に実機成功/保存/再起動復元を確認する。


## 実機再試験完了・追加AI上限到達（21:55–22:00 JST）

- 接続復旧後に最新containerをGit外退避。合成profile（q / 1980-01-10 / 時刻・性別空）と「さんぽした」のみを入力し、端末v2同意→承認された追加1回をbuild3から実行。
- 21:55:13.655 JST、新本番versionから `[kiri-analyze] upstream status 400 provider_request_invalid` をCLI tailで確認。失敗案内と入力保持を実画面で確認。**追加1/承認1回を使用、再送なし。AI成功→結果保存→再起動復元は未合格。**
- `provider_request_invalid` は400の既知条件を認識できなかった固定分類。非JSON/過大/本文deadlineも同分類となるため、本文解析成功・spend/billing除外・具体的なリクエスト不備確定を意味しない。生の上流本文は保存していない。
- 試験入力を空欄へ戻し、元profileをUIで復元、v2同意を取り消した。containerを再取得しprofile/history3件/lockのraw値が直前原本と完全一致、同意キー無しを確認。完全終了→再起動でKiriロック画面を確認。試験用profileは残っていない。
- サーバーのライブtailは終了。秘密値・利用上限・支払・キー・権限を変更していない。evidence/resumed-ai-result.json。

### API静的再点検と正しい組織の確認待ち

AstraとAPI担当が独立再点検。旧APIversionの公式schemaにもSonnet5.5/effort mediumが載り、x-api-keyは現在も有効。bodyの明白な構造不備は見つからない。fallbackの全組合せ互換の明示保証は未取得。workspace非限定キーはworkspace headerが必要だが、legacy workspaceキーは作成先に固定され省略可能。本番キーscope未特定のため条件付き候補に留める。api-version-workspace-review.md。

repo旧HANDOVERには、2026-10-08作成のKiri専用workspace `wrkspc_012jzv8UJ1hKnEB5THWJzark`（当時月20USD/通知15USD、同workspaceのキーで200確認）の記録がある。現在ログイン中の個人向けAPI組織から当該workspaceの設定URLを開くと「ワークスペースが見つかりません／権限不足か別組織の可能性」と表示。削除されたと断定しない。先の表示組織の残高・上限をKiriのものと扱わない。ひちゃんへ作成元アカウント／組織を質問済み、キー値は依頼していない。追加AIなしで正しい組織・workspace・spend・キーscopeを確認するのが次。

## 2026-11-13 secret入れ替え後の実機受け入れ（build3・本番 c414cbe9）

- 開始前にapp containerをGit外 `physical-qa-20261107-1153/pre-20261113-container` へ退避（history3件・profile・lock・migrated・analysis-cache）。照合はハッシュのみで中身は表示していない。
- 本人がiPhoneで合成profile（q / 1980-01-10）・v2同意・「散歩した」で読み解き1回（本人承認）→ **結果表示PASS**。containerで history 4件（新1件＋元3件が完全一致）を確認。
- 完全終了→再起動→Face ID後のcontainerで history 4件・直前と完全一致 → **AI成功→結果保存→再起動復元 PASS**。
- 片付け: 同日同入力の端末キャッシュで結果画面へ戻り（本人操作）テスト1件を削除、元profileへ復元、同意取り消し。containerで history/profile/lock/migrated が開始時と完全一致、consentキー無しを確認。analysis-cacheキーは消えている（開始時の分は前日以前の古いキャッシュ）。
- 新発見（未対応）: 「最近の記録」の入口が結果画面のみ（`SpiritualDiary.jsx` の setShowHistoryList(true) は1箇所）。オフラインや読み解き前には履歴へ行けず、審査メモ下書きの「offline history viewing」と食い違う。4.2対策として入口の追加を要検討（本人の見た目判断待ち）。
