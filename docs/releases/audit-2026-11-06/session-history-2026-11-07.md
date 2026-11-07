# 2026-11-07 同日中の経過（現在地ではない）

最新はHANDOVER.mdとrestart-2026-11-08.mdを優先。

## 2026-11-07 Anthropic組織・workspaceをライブ再確認

- **Kiri専用workspaceは存在する**。現在の「Hitomi’s Individual Org」でDefault/Kiriを確認。ID `wrkspc_012jzv8UJ1hKnEB5THWJzark`、作成日・月20USD上限/15USD通知も旧記録と一致。前の日本語名組織では見えなかっただけで、未作成と判定しない。
- `kiri-vercel-prod` はKiriスコープ・有効キー1本。組織は今月0.52/100USD、Kiriは0.00/20USD、残高表示19.99USD。変更・追加AIなし。
- **未確認はCloudflare本番secretと当該キーの対応**。400の原因は未確定、追加AI1/1使用済み・H-02公開阻害は維持。実機原本復元済み。詳細: [キーとworkspace現在確認](docs/releases/audit-2026-11-06/anthropic-key-workspace-current.md)。以下の「組織を本人へ質問中」はこの確認前の経過。

## 2026-11-07 実機再試験後の最新状態（22:00 JST以降）

- **本番反映済み・AIは未解決**: active version `cf45f762-b4d7-4269-a580-398ed865e095`。公開4ページ200・static12ファイルhash一致・API保護9項目とログ受信試験PASS。候補は51 files/824 tests・lint・CF build合格。
- **承認追加1回を使用済み**: build3の架空入力→v2同意→本番AIでupstream400 / `provider_request_invalid`。入力保持は確認、成功→保存→再起動は未合格。追加呼出し禁止、H-02 P1公開阻害を維持。分類だけでbody解析成功やspend/billing除外を決めない。
- **データ保全**: 最新container退避後に試験し、元profile/history3件/lockをUIで戻してraw値完全一致を照合。試験入力を消し、同意を取り消した。完全終了→再起動でロック画面を確認。live tail終了。
- **次は正しいAnthropic組織の確認**: 旧記録のKiri専用workspace IDは `wrkspc_012jzv8UJ1hKnEB5THWJzark`。現在の個人向けAPI組織では当該workspaceが見つからず、作成元アカウント/組織を本人へ質問中。先の残高/上限はKiriのものと扱わない。モデル/effort/認証形式の明白な不備は静的再点検で見つからず、workspace scopeは未特定。秘密値・上限・支払・キー・権限変更なし。
- [最新実施記録](docs/releases/audit-2026-11-06/approved-deployment-2026-11-07.md) / [API再点検](docs/releases/audit-2026-11-06/api-version-workspace-review.md)。以下は同日中の経過で、矛盾時はこの最新節を優先。

## 2026-11-07 承認後の本番反映

- ひちゃん承認後、監査候補を本番へ反映。active version `cf45f762-b4d7-4269-a580-398ed865e095`（旧 `eb128156-5748-4f31-82dc-925f52dd9ba4`）。秘密/上限変更、TestFlight配布、提出なし。
- 公開4ページ200・static12ファイルhash一致・API保護9項目PASS。実ブラウザで初期→架空profile→入力画面を確認。追加AIはまだ0/承認1回。ミラーが「iPhoneが見つかりません」となるため、Mac近くで本体Kiri解除→画面ロックの返事待ち。CLIログ受信は不正JSON1回（AI0）で確認、待機中のtailは終了済み。詳細: [本番反映記録](docs/releases/audit-2026-11-06/approved-deployment-2026-11-07.md)。

## 2026-11-07 修正後の実機QA（部分受入れ・AI成功経路が未合格）

- iPhone12mini/iOS26.3.1へ、監査後コードとG-05の縦配置修正を含むversion1.0/build3をUSBでinstall。KUGA法人の開発署名Release。App ID/保存キーは維持。TestFlight/ASCへの追加upload・本番deployなし。
- **データ保全PASS**: 更新前のcontainer全23ファイルをGit外退避。検証用profileはUIから元へ戻し、Preferencesのprofile/既存history3件/lock設定が開始時と完全一致することを照合済み。検証用profileは残っていない。
- **backup往復PASS**: 本人の本体認証→書出し→保存成功報告とUI表示を確認。rootが実ファイルを選んで読み込み、追加0/全3。原本一致と、通常共有終了後のapp Cache内一時backup JSON0件を確認。
- **ロックPASS**: 本人の本体認証成功＋解除後画面、短時間背景復帰、ホームへ戻し82秒後の自動ロックを確認。切替カードは見えた範囲で目隠しあり。端末は最後にKiriロック画面にしている。
- **同意**: v2再確認・拒否後入力保持・撤回のUI/保存を確認。検証用に受けた同意は取り消したので、次の実利用では本人にv2の説明が再表示される。
- **公開阻害が残る**: 合成データの実AI2回は失敗案内で入力へ戻り、成功結果/保存は未合格。以後の追加送信なし。OPTIONS/CORS204に加え、既存ログイン済みCloudflare画面で両試行のAnthropic upstream HTTP400を確認。CLI履歴照会403の権限は拡張していない。本番は監査修正前のversion `eb128156-5748-4f31-82dc-925f52dd9ba4`。生エラー本文を破棄しているため拒否理由は未確定。表示中Anthropic組織は残高あり・支出上限未到達だが、Kiri本番キーとの対応は未確認。安全な固定reason分類をローカル準備し、診断deploy/追加AI再試験は別途承認後。
- **診断修正の準備完了**: 固定reason分類・非2xx本文16KiB/deadline・status保持・任意stop_reasonログ廃止。51 files/824 tests・lint・CF build・秘密検査・deploy dry-run PASS。本番反映なし。候補は先行監査修正も含むため、[反映範囲と切戻し](docs/releases/audit-2026-11-06/diagnostic-deployment-review.md)を確認し、本番反映と合成AI最大1回を別途承認する。
- **未確認**: 実購入/復元/失効、実機VoiceOver/OS大きい文字、共有途中終了、build3待機画面の実機再測定、Native全経路のmarkerログ検査。モックや過去build1の合格で埋めない。
- 記録: [実機台帳](docs/releases/audit-2026-11-06/physical-device-2026-11-07.md)。private証拠/原本hash/バックアップは `/Users/usausagi/Documents/AI_Playground/spiritual-diary-qa/physical-qa-20261107-1153/`。個人情報をリポジトリへ入れない。build出力はcandidateの `build/physical-qa-20261107/`。

## 2026-11-07 リリース前監査・ローカル修正（未配布）

- ひちゃん承認の手順で8領域を担当分けして監査し、Astraが運用影響順を裁定。**初回32件＋追加F-03/C-05/G-05＝35件、34件をローカル修正対象として対応**。H-02は外部接続・実機・提出の公開ゲートとして残す。履歴のTestFlight build1は修正前の別成果物。
- 起点はrelease HEAD `aac43b6`。既存の未コミット/未追跡4資料とソースをGit外へ保全し、秘密設定のない隔離worktreeで実装・相互レビュー・検証した。監査後の変更はこのrelease作業フォルダへ差分反映。まだcommit/pushされていないため、現監査の再開時はこの節を優先し、mainの旧状態で上書きしない。
- **読む順**: [指摘一覧](docs/releases/audit-2026-11-06/findings.md) → [Astra裁定](docs/releases/audit-2026-11-06/astra-priorities.md) → [修正記録](docs/releases/audit-2026-11-06/fix-log.md) → [検証と残る公開条件](docs/releases/audit-2026-11-06/verification.md)。初期台帳はfile-manifest.md/01-coverage.md、個別報告A〜Hも同じフォルダ。
- 主な修正: 保存失敗の通知・再試行/破損原本保全/既存を押し出さないimport、削除後の遅い応答防止、同意v2と拒否/撤回の送信停止、API入力・本文サイズ・deadline・安全性、表示商品と購入の一致、共有Cache回収、JST日付/分析時刻の整合、共通dialog・大きい文字の収まり。保存キー/backup schema1・色/フォント/余白の役割は維持。
- 検証: **50 files /789 tests、lint0errors/0warnings、Next/OpenNext build、ios:sync、Release simulator build成功**。実行用依存audit0、開発依存moderate13残。秘密埋込/課金コードのWeb混入なし。WebKit113条件PASS（API/購入mock）。iOS15.5では初期・設定・入力・同意拒否・profile保存→完全終了→復元とPreferences実値を確認。実機VoiceOver・全コントラスト・実StoreKit合格の代用にはしない。
- 追加F-03: Next既定Safari16.4向け構文で最低OS15.5が空画面になったため、BrowserslistでSafari/iOS15.5を明示。Releaseで是正を確認。新SDKのDebugのみSwiftUICoreリンクで起動停止する留意はF03文書。private frameworkのweak flagや最低OS変更は採用していない。
- 追加C-05: Native診断ログのPreferences値出力を実測し、Capacitorのログ/検査を無効化。Release再buildと同梱設定を確認し、profile保存/復元を保ってbridge結果と合成markerがstdoutへ出ないことを確認。署名済み実機では別途受入れ。
- **次の順**: 変更差分レビュー → 修正後ビルドの実機保存/復元/backup共有/認証/大きい文字/VoiceOver → ASC/RevenueCat接続と購入/復元/失効 → 実AI費用/予算/通知 → 契約/App Privacy/素材/提出情報 → 配布・公開判断。各詳細はH-02。実購入・本番API/データ接続・新TestFlight・デプロイ・提出は未実施。
- **作業場所**: 検証済candidate `/Users/usausagi/Documents/AI_Playground/spiritual-diary-qa/release-audit-20261106-132743/candidate`（branch `agent/release-audit-20261106-132743`）。Git外バックアップは同親の`before/`。元releaseのnode_modules/生成物/秘密設定/既存IPAは反映対象外なので、元releaseで検証を再開するなら新package-lockに合わせ `npm ci`。検証ログ・画像はdocs内evidenceとoutput/playwright。
