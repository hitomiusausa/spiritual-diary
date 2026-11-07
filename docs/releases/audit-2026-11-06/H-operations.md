# H 運用・公開準備の監査

担当: うさこ `/root`。2026-11-06。基準 `aac43b6`、隔離candidate。コード変更・本番接続・デプロイなし。

## H-01 ロックされた依存に既知の脆弱性が残る

- 暫定: P1（公開前の依存更新と互換性検証）。ライブラリ単体のcriticalを、そのまま本サービスでRCE成立と判定しない。
- 根拠: `package.json:36-56`、`package-lock.json`。npm ciによる実インストールはNext **16.4.0**、wrangler 4.143.1、undici 7.29.1。package.jsonの範囲だけでは再インストール時に修正版にならない。
- 検証: `npm audit --omit=dev --package-lock-only --json` は11件（critical 1/high 2/moderate 8）。全依存では25件。rawは `/tmp/kiri-audit-20261106-dependencies.json`。重複する親パッケージ集計を11種類の独立した攻撃と扱わない。
- 公式アドバイザリ: Next GHSA-2464-fhr4-w9xw / GHSA-673q-mjm6-r5xr / GHSA-p3m5-59mp-jv5r。修正版は16.4.1以降。2026-11-06照合。
- 成立条件: 本アプリは画像最適化を無効化、`use cache`/Server Actionsはコード検索で見つからない。SVG画像処理はglibc環境・sharp版等の条件もあり、Cloudflare/iOS構成での実害を断定しない。新しい機能の追加や設定変更で成立条件が変わるため、公開前の更新は必要。
- OpenNext経由のglob/minimatch、build用Express/body-parser/qs、wrangler/miniflare経由undiciにも検出。依存一覧にprodとして入っていても、それがWorkerのHTTP処理経路に残るかは成果物で別途確認する。
- 影響: 再現ビルドで既知の脆弱版を使用し続ける。Next build自体が脆弱性通知で一度停止した。既存の715 testsは合格しても、この検査の代わりにならない。
- 最小修正: Nextの同一系列修正版、必要なlockと関連ツール更新。`npm audit fix --force`やOpenNextの旧版への自動降格は行わず、個別に互換性を確認。残るビルド時のみの検出は到達性と適用可能な修正を記録する。
- 合格条件: Web/iOS/OpenNextのビルド、既存ゲート、静的バンドル検査とUI確認。実行時の重大な検出を解消し、未解消分には理由と適用範囲を記す。

一次情報: [Next公式Security Advisory: SVG](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)、[use cache](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)、[Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)。npm auditが指す情報と対応させて確認する。

## H-02 有料公開に必要な接続・費用検証・提出情報が未完了

- 種類: 既存の公開ゲート。新しいコード不具合とは区別。暫定P1（課金を含む公開の前提）。
- 根拠: `docs/releases/app-store-2026-10-16.md:80-90`、`HANDOVER.md:302,326,346`、`wrangler.jsonc` vars。
- 観測: 手元の提出資料では、RevenueCat/ASC商品の接続と実機購入/復元/期限切れ、実費に基づく上限、App Privacy、スクリーンショット、Appleの契約等が未完了。実行環境に接続していないので、今も未設定と断定せず、今回の確認未実施として残す。
- 設計: 分析全体30/日、チャット全体500/日・購読者60/日。既存の上限を根拠なく引き上げない。公開規模と実費に対して不足しないか、審査用の操作が可能かを確認する必要がある。
- 合格条件: 該当する公開ビルドで接続と購入一巡、外部障害、失効を確認。予算根拠と運用の見直し条件を記録。説明/スクリーンショット/App Privacyを実装と一致させる。契約は本人が確認する。

## 確認範囲と問題を確認しなかった点

| 対象 | 調べた結果・確認方法 |
|---|---|
| Workers設定 | custom domainのみ、workers_dev/preview_urls false、invocation logs/traces false。production vars固定。ライブ適用は未確認 |
| 起動時のAPI保護 | 本番でRedis/秘密設定不足は503。IPハッシュ・TTL・クォータ分離。Redis障害時のメモリ降格はD-18/D-31の既存の受入制約 |
| ビルド/デプロイ入口 | cf:deploy/uploadにembedded-env・web-bundle検査あり。直接wrangler deployは検査を迂回するため運用手順で防止。今回は実行しない |
| OpenNextパッチ | 想定した行のみに適用し不一致で停止。更新後はパッチ要否と成果物を再確認 |
| iOS静的成果物 | API除外、必須4ページ、サーバーマーカー/秘密値照合、プレビュー/モック混入検査。公開キーの形式検証、--require-iapゲートあり |
| Web/iOS分離 | Web本番はIAPコード無効。iOSは公開キー有無で購入を切替。モックはdevのみ。Webチャットpreviewフラグは成果物検査が最後の防壁 |
| 一時バックアップ | Git管理外・権限制限した構造と差分を保存。個人の日記/秘密をQA画像・ログへ含めない |
| 説明文・審査資料 | 現行10/16資料を参照。旧ID・課金なし提出文をそのまま流用しない。C/E/Gと照合 |
| 障害診断 | 利用量/トークン/失敗種類のログあり。本文漏えい経路はC-01へ統合。予算・アラートの実設定は未確認 |
| 切戻し | 既存配布物とGit基準を保持。今回の保存方式変更は互換性・失敗時の回復を修正記録へ追加する必要あり |

## 基準検証

- `npm ci`: 成功、763 packages。プライバシーパッチ適用成功。
- `npm test`: 45 files / 715 passed。
- `npm run lint`: 完了結果はverificationへ集約。
- `npm run build`: Nextのセキュリティ通知で初回停止。通知後の再実行と修正版での結果をverificationへ集約。
- `npm audit`: H-01参照。過去の「0件」は今回の現在値ではない。
- WebKit/シミュレータ/実機/本番/ストア接続はこの報告の合格範囲外。各検証結果を後段で記録する。
