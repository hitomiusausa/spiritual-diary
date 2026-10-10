# HANDOVER.md — Kiri 現在地

最終更新: 2026-10-09

新しいセッションでは、まず`CLAUDE.md` → `DECISIONS.md` → `HANDOVER.md`の順に読む。詳細な履歴は`docs/HANDOFF-2026-07-28.md`と`docs/PROJECT_STATUS.md`にある。

## 現在の場所

- 正規リポジトリ: `/Users/usausagi/Documents/AI_Playground/spiritual-diary`
- ブランチ: `agent/consolidate-spiritual-diary`
- GitHub: `https://github.com/hitomiusausa/spiritual-diary`
- 最新状態: 2026-07-28分まではGitHubへpush済み。2026-10-08のリリース準備 Phase 0（D-14〜D-16）もpush済み。

## 2026-10-09 仕上げ（ブランチ`agent/ios-polish`・`agent/ios-lock`の上・mainへ未マージ）

- L-6: `npm run ios:sync:dev`（＝`npm run ios:sync -- --dev`）で dev 向けの書き出し→`cap sync ios`が1コマンドに。`--dev`以外の引数は止まる
- L-7: Info.plistの`UIRequiredDeviceCapabilities`を`arm64`に
- Kiriのアバターを3x版`public/kiri-avatar-144.png`（20KB）に。原本`kiri.png`はアイコン用に残す
- Dynamic Type（D-26）: iOSアプリだけ「文字を大きく」に追従（100%〜135%）。検収はiPhone 17・16eで標準・XXL・アクセシビリティM（ロック・日記入力・設定・基本情報・同意・結果）。Webは変更前と一致
- シミュレータ: Dynamic Typeの確認は`xcrun simctl ui <udid> content_size <large|extra-extra-large|accessibility-medium>`。アプリは再起動しなくても追従する。16eはFace IDの画面が出るまで約3.5秒かかる（早く`pearl.match`を送ると失敗表示になる）

## 2026-10-09 余白の近接の原則を全画面へ（D-29・ブランチ`agent/ios-spacing`・mainへ未マージ）

- 基本情報・日記・結果・設定・文書ページの余白をD-29の比率にそろえた（中身はD-29「適用」）。色・文字・大きさは不変
- 確認: Playwright 375/1280 の変更前後、iPhone 17（アクセシビリティM・標準）で基本情報・日記・設定・同意・結果。日記のカード下端 826→824（≤832）。横はみ出し0
- 残り: 今日のヒントの「?」・折りたたみ見出しの「?」・履歴一覧の閉じるボタンがタップ範囲44px未満（余白とは別の便で）

## 2026-10-09 アプリのロック（D-25・ブランチ`agent/ios-lock`・mainへ未マージ）

できたこと: iOSアプリだけに「アプリのロック」（Face ID／Touch ID／端末パスコードのゲート）。見た目はA「静かな扉」。設定に「アプリのロック」トグル・自動ロック（すぐに／1分／5分／15分、既定5分）・「切り替え画面で記録を隠す」。書き出しとオフの前に再認証。Webには何も出ない（Playwright 375/1280で設定の画素が変更前と一致）。

ファイル: `src/lib/appLock.js`（状態遷移`reduceLock`・設定キー）、`src/lib/lockUi.js`（画面と再認証の純粋関数）、`src/lib/lockController.js`（認証・再認証・オン/オフの手順）、`src/lib/lockBoot.js`（起動順）、`src/lib/lockAuth.js`／`privacyScreen.js`／`appState.js`（OS窓口）、`src/components/LockScreen.jsx`、`SpiritualDiary.jsx`（結線・オーバーレイ・設定）。目隠しプラグインの差し替え: `scripts/patches/privacy-screen/`＋`scripts/patch-privacy-screen.mjs`（postinstallと`ios:build`で自動。想定外の版なら止まる）。

シミュレータでFace IDを試す（iPhone 17 `F9165023-EDA1-4EEA-B7D1-B4361E3BCB40`）:
- 登録: `xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1 && xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit.enrollmentChanged`（またはSimulatorのFeatures → Face ID → Enrolled）
- 一致／不一致: `xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit_Sim.pearl.match`／`.pearl.nomatch`（Touch IDは`fingerTouch.match`）。Face IDの画面が出てから（約2秒後）送る。早すぎると取りこぼす
- 登録するとシミュレータは`deviceIsSecure: true`になり、パスコードの設定は不要だった
- 初めての端末では「Face IDの使用を許可」の確認が先に出る（文言はInfo.plistの`NSFaceIDUsageDescription`）
- iOS 26のFace ID画面は不一致のあと「Face IDをやり直す／あとで」だけで、2回失敗してもパスコードの選択肢は出なかった。アプリの失敗表示（当時は「もう一度」＋「端末のパスコードでひらく」、今は「もう一度ためす」＋注記）は、`authenticationFailed`をWebKitインスペクタ経由で差し込んで確認した
- 検収の記録・スクリーンショット: scratchpad `QA-lock/`・監査反映後は`QA-lock2/`（セッション内のみ）
- ホームへ戻す: AXeの`axe button home --udid <udid>`。戻すのは`xcrun simctl launch <udid> com.kugainc.kiri`

シミュレータ検収の結果（iPhone 17・16e、iOS 26.3.1）: オンにするときFace ID／5分超の背景で再ロック（実測315秒）・短い背景ではロックしない／一致で解除／キャンセルでロックのまま／終了→起動でロック（スプラッシュ→ロック画面。連続スクリーンショットの間隔では本文は見えなかった）／書きかけが残る／書き出しとオフで再認証／ロック中に相談先（電話3件）が開ける／同意モーダルの上にロック画面／パスコード未設定のフェイルオープン帯（差し込みで確認）／16eで設定はスクロール・ロック画面も収まる。

**iPhone 17は最新ビルド（`2e6a6a3`以降）を入れ、ロックをオフにして起動中**。

監査の反映（2026-10-09、`733bf09`〜`2e6a6a3`。D-25に詳細）: Face IDの画面のまま背景へ回っても自動ロックが効く・書き出しは続けない（P1-1）／「すぐに」はpauseでロック＋pauseが遅れて届いたときは心拍の時刻を使う（P1-2）／認証プラグインが使えないときはフェイルオープン（P1-3）／目隠しプラグインをメインスレッド化して差し替え、認証中も目隠しを付けたままに（P2-2）／失敗時のボタンを「もう一度ためす」1つ＋パスコードの注記に（P2-3）／iOSの対象を15.5へ（`inert`。P2-4）／設定カードの中スクロールはiOSだけ（Webは変更前とPSNR 67/72dBで一致。P2-5）／起動順・controller・ページ文言のテスト（P2-6）／ボタン文言のちらつきと、閉じた帯が二度と出ない件（P2-7）。シミュレータ再検収（iPhone 17）: 再認証→共有シート×3・直後に目隠しを切り替えても落ちない（同じPID）／1分設定でFace IDの画面のままホーム→66秒後に戻るとロック・共有シートは出ない／10秒で戻るとロックせず書き出しも続けない／「すぐに」で復帰の最初のフレームからロック画面→自動でFace ID／再認証してオフ。記録はscratchpad `QA-lock2/`。

直したバグ（T-L5）: 目隠しプラグインが Face ID の後に見えない覆いを残し、共有シートが開けない・`disable()`でアプリが落ちる → 当初は認証の間だけ目隠しを外す回避策、監査反映でプラグインを差し替えて根治し回避策は撤去（D-25）。設定モーダルが画面からはみ出す → 中でスクロール。フェイルオープンの帯が透けていた。

未了・要判断:
1. **実機検収（T-L9）**: Face ID実動／アプリ切り替え画面のぼかし（差し替え後のプラグイン。シミュレータでは切り替え画面を出せず未確認）／復帰時に本文が一瞬見えないか（「すぐに」と、1・5・15分の境目をまたいだ復帰の両方）／5分超の背景でロックされるか（pauseが遅れて届く場合の心拍の判定）／コントロールセンター・通知を引いた後にロック・目隠しをオフにしても落ちないか／**共有シートを開いたままホーム→5分超で戻ると、ロック画面の上に共有シートが残って書き出せる**（D-25の残るリスク・監査P2-1。出るならネイティブでpause時にシートを閉じる手当てを判断）／iOS 15.5端末があればTabでロック画面の外へ出ないか
2. 失敗時の注記「Face ID がうまくいかないときは、iOS が端末のパスコードの入力をたずねます。」が実機の挙動どおりか（シミュレータでは不一致2回でもパスコードの選択肢は出なかった）。違えば文言をオーナーと相談
3. ロック画面の文言（「ロックされています」「つらいときの相談先」など）とFace IDの許可文のオーナー確認
4. 監査A/B（ロック中に本文が読める経路・認証なしで書き出し／オフできる経路）は2026-10-09の監査で実施・反映済み。残るのは次の1点。JSから`.click()`すると`inert`の下のボタンも押せる（DevToolsを開ける人＝ゲートの守備範囲外）
5. 同意モーダルの「プライバシーポリシーを読む」で移動して戻ると再ロックされる（設計どおり・1回余分にFace ID）

## 2026-10-09 Phase 2 iOSの器（Capacitor・課金なし）

ブランチ（**どれもmainへ未マージ・本番Webは不変**）:
- `agent/ios-shell` … Phase 2の統合ブランチ（D-20〜D-24）。`agent/ios-qa`はそこから派生したQA修正（7件、HEAD `ea056ab`）
- `agent/ios-lock` … アプリのロック（D-25）。T-L1〜T-L5・T-L8まで実装・シミュレータ検収済み（下の節）。残りは実機検収T-L9
- mainへ入れる前: `npm run cf:build && npm run preview`で workerd 上の`/api/analyze` 400・`/api/chat` 403を再確認（D-20）

コマンド:
- `npm run ios:build` … 静的書き出し（API先は`https://kiri.kugainc.com`）。`-- --dev`で`http://localhost:3000`向け。検査に落ちると`out/`を消して止まる
- `npm run ios:sync` … 書き出し→`cap sync ios`を1コマンドで（本番API）。**dev向けは`npm run ios:sync:dev`**（＝`npm run ios:sync -- --dev`。L-6解消: 引数は書き出し側へ渡し、`--dev`以外の引数は止める）
- `npm run ios:open` … Xcodeで開く
- シミュレータ用ビルド: `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath <dir> build`
- `.next`を共有するので`npm run dev`・`cf:build`と同時に走らせない。Workers Buildsに`KIRI_BUILD_TARGET`を置かない

シミュレータQAの要点（iPhone 17 / 16e / 17 Pro Max・iOS 26.3.1で実施。チェックリストは本番CORS以外PASS。Dynamic TypeはD-26で対応）:
- Xcode 26.3は**iOS 26.2プラットフォーム必須**。今のランタイムは26.3
- `simctl`が固まることがある → タイムアウト付き（watchdog）で呼ぶ。復旧は`CoreSimulatorService`をkill
- 再インストール後に古い起動画像が残る → `splashboardd`をkill
- WebKitインスペクタ経由でJSを実行できる（UDIDを1台に固定して使う）。MobileBuildMCP 2.7.1をこのプロジェクトにlocal登録済み（次セッションから使用可）
- QAで直したバグ: 起動時のPreferencesプロキシ（thenable）ハング、スプラッシュが起動画像サイズ上限超過で黒画面、iOSの入力ズーム／出生時刻欄の幅／ステータスバー、失敗文言のKiri口調化、エラーバナー10秒で閉じる、キャッシュ再表示で履歴が重複

未了・要判断（優先順）:
1. **本番CORSの実確認**（デプロイ後。実APIは**2回まで**）
2. **一日の上限**（Q2未変更。`DAILY_LIMIT_ANALYZE=30`のまま。**一般配布前に必ず見直す**。実費未計測。D-24付記）
3. `src/lib/analyzeError.js`の失敗文言のオーナーレビュー
4. ~~Dynamic Type~~ → D-26で追従（iOSアプリのみ・100%〜135%。ブランチ`agent/ios-polish`）。オーナーの目視確認待ち。切るなら`DYNAMIC_TYPE_ENABLED = false`
5. L-4: `/terms`・`/support`のプレビュー文言とチャットパネル内文言はPhase 3で改稿
6. L-5: 開発依存の`uuid`（<11.1.1、@capacitor/cli→xcode）moderate。ビルド道具のみ
7. ~~L-6~~（解消・`ios:sync:dev`）／~~L-7~~（解消: `UIRequiredDeviceCapabilities`を`arm64`に。iOS 15.5以上は64ビット端末のみ・arm64だけのバイナリでarmv7のままだとITMS-90502の恐れ。シミュレータビルド・起動OK。アップロード時に書き出したIPAのInfo.plistも確認）／L-8: dev時の`capacitor://`→`http://localhost:3000`がATSで止まるか未確認
8. Workers Buildsの**mainより前のブランチ（非main）のビルドが無効か**確認
9. 実機の検収（T13の後半）、Phase 3（RevenueCat・購読接続）の前に`npm pack @revenuecat/purchases-capacitor --dry-run | grep Package.swift`でSPM対応を確認
10. アプリのロック（D-25）の実機検収（T-L9）。下の「アプリのロック」節を参照

文言の更新: プライバシーポリシー2・4節とサポートFAQを、Web（ブラウザ）とiOSアプリ（アプリ内保存・端末バックアップ対象・アプリ削除で消える）の両方に正確な書き方へ直した。

## 2026-10-08 Cloudflare Workers 移行（ブランチ`agent/cloudflare-workers`・ローカル検証済み・未デプロイ）

確定したこと（**D-19**）: OpenNext（`@opennextjs/cloudflare` 1.20.7）＋wrangler 4.143.1。本番判定は`KIRI_DEPLOY_ENV`（`wrangler.jsonc`の`vars`でproduction固定）＋`VERCEL_ENV`。IPは`cf-connecting-ip`優先。画像最適化は切った。Next.js 16.4用の一時パッチ`scripts/patch-opennext.mjs`（上流#1356がマージされたら外す）。

コマンド:
- `npm run preview` … OpenNext build → ローカルworkerd（秘密は`.dev.vars`。`.env.local`があると値がWorkerに埋め込まれるので注意）
- `npm run deploy` … build後、成果物（`.open-next/cloudflare/next-env.mjs`）に`.env*`の値が埋め込まれていれば止まる（`scripts/check-embedded-env.mjs`）
- Workers Builds: ビルドコマンド`npm run cf:build`、デプロイコマンド`npm run cf:deploy`。**`npx opennextjs-cloudflare deploy`や`wrangler deploy`を直接実行しない**（埋め込み検査を飛ばすため）
- Workers Builds は**本番ブランチ（main）以外のビルドを無効にする**のを推奨（作業ブランチのビルドも本番扱いのWorkerとして動き、本番のUpstash・Claudeキーを使うため）
- 注意: ローカルの workerd プレビューも`KIRI_DEPLOY_ENV=production`（wrangler.jsonc）で動く本番扱い。`.dev.vars`に本番のUpstashを入れていると、**本番と同じ日次クォータ・レート制限カウンタに加算される**（2026-10-08の検証で analyze の当日カウンタを2回分使った）
- ログ: wrangler.jsonc で呼び出しログ（invocation logs）とtracesを無効、consoleの運用ログだけ残す

Cloudflare（2026-10-08 ユーザーが Workers Paid 契約・Workers Builds で GitHub 連携済み。Worker名`kiri`、ビルド`npm run cf:build`、デプロイ`npm run cf:deploy`、Secrets 4つ設定済み）: 公開URLは`wrangler.jsonc`の`routes`（`kiri.kugainc.com`・custom_domain）で付ける。ダッシュボードの「ドメインを接続」は kugainc.com が同じアカウントにあるのに「一致するゾーンがありません」と出て使えなかった。`workers_dev`・`preview_urls`は false。
**本番切り替え完了（2026-10-08 21:43）**: `main`=`a6c2789`のWorkers Buildsで`kiri.kugainc.com`に公開（custom_domainは設定ファイルから自動作成された）。確認済み: トップ・/privacy・/terms・/support が200、空入力で`/api/analyze` 400・`/api/chat` 403、`workers.dev`は404、応答はNRT（東京）のCloudflare、Upstashにカウンタが加算される。Playwright 375pxで基本情報→日記→読み解き（実AI 1回）→結果、端末キャッシュ1件・履歴1件。1280pxで日記入力と設定モーダル、バックアップ書き出し（profile/history/chat のみ・端末キャッシュは含まない）、コンソールのエラー・警告0。プライバシーポリシーの基盤事業者の例示をVercel→Cloudflareに修正（`1bd3599`、本番反映確認済み）
- 注意: 切り替え直後、手元のMacのDNSキャッシュが`kiri.kugainc.com`を一時的に引けなくなった（権威DNS・1.1.1.1では正常）。確認は`curl --resolve kiri.kugainc.com:443:104.21.23.154 ...`で回避できる
- Vercelプロジェクト`spiritual-diary`はユーザーが削除済み（2026-10-08 22時台。`spiritual-diary-tau.vercel.app`はトップ・APIとも404を確認）。`vercel.json`は不要になったが、害はないので残している
Cloudflareに設定するもの: Secrets＝`CLAUDE_API_KEY`・`UPSTASH_REDIS_REST_URL`・`UPSTASH_REDIS_REST_TOKEN`・`KIRI_STORE_SECRET`。`KIRI_DEPLOY_ENV`と`DAILY_LIMIT_ANALYZE=30`はwrangler.jsoncの`vars`に固定済み（ダッシュボードの平文変数はデプロイで上書きされるため、平文の設定はwrangler.jsoncで変える）。`KIRI_CHAT_PREVIEW`は入れない。Workers Builds ならビルド時変数は不要（実行時のSecretsのみ）

ローカル検証（2026-10-08）: test 138件・lint・build・audit(--omit=dev 0件)・OpenNext build OK。workerdプレビューでトップ等200、空入力 analyze 400／chat 403、Upstash未設定で両方503、実入力の analyze 200（Claude 2回）、Upstashにレート制限キー（IPハッシュ）と日次クォータ加算、ログに日記本文・IPなし。Worker gzip 1.4MB。Playwright 375/1280でトップ表示・画像OK

残課題: 本番デプロイ・`kiri.kugainc.com`の割当（Workersのカスタムドメイン）・本番で`[kiri-store] incr fell back to memory`が出ないことの確認・1.20.7が2週間経つ10/13以降に版の再確認・~~`kiri.png`(512px/138KB)を48px表示~~ → 3x版`public/kiri-avatar-144.png`(20KB)に置き換え済み（原本はアイコン用に残す。Playwright 375@3x/1280@2xで原本とPSNR 44/46dB）

## 2026-10-08 Phase 1-1 API保護の共有ストア化（コード側完了・push済み）

確定したこと（**D-18**）:
- レート制限・日次クォータのカウンタだけをUpstash Redis（`src/lib/kiriStore.js`）に置く。未設定ならプロセス内メモリ。IPは運営者だけが持つ秘密鍵（`KIRI_STORE_SECRET`）でHMAC化し、平文で保存しない（`src/lib/kiriCrypto.js`）
- **サーバーには日記由来のデータを一切保存しない**。分析のサーバー内キャッシュは撤去
- 同日同入力の文章の安定（D-16）は**端末側キャッシュ**（`src/lib/analysisCache.js`、localStorage`kiri-analysis-cache-v1`、キーは入力のSHA-256、当日分・最大10件）が担う。記録の個別削除・すべて削除で丸ごと消去する。別端末では文章が変わり得る
- Redis障害・タイムアウト（1秒・再試行なし）時は、カウンタをメモリへ降格して制限を効かせ続ける
- **503方針**: `VERCEL_ENV`がproduction/previewで、Redis設定か`KIRI_STORE_SECRET`（32文字以上）が欠けていれば、`/api/analyze`と`/api/chat`は503
- プライバシーポリシー2〜4節を改訂（保存先Upstash東京・IP由来の値は最長2分・回数カウンタは2日・端末内の当日一時保存と削除時の消去）

ユーザー作業（デプロイ前）:
1. ~~Upstash Redisを作成~~ 済み（下記）。Vercelの環境変数に`UPSTASH_REDIS_REST_URL`・`UPSTASH_REDIS_REST_TOKEN`を貼る
2. Vercelの環境変数に`KIRI_STORE_SECRET`を設定（`openssl rand -base64 48`で生成、Sensitive指定）
3. ~~Anthropicコンソールで月の利用額上限を設定~~ 済み: 組織全体$100（通知$30）。組織はつぶやきうさぎ・日本語資金ウォッチと共有なので、**Kiri専用ワークスペース`wrkspc_012jzv8UJ1hKnEB5THWJzark`を作成し月$20上限・$15で通知**（2026-10-08）。本番の`CLAUDE_API_KEY`はこのワークスペースで発行したキーを使う（Kiriが上限に達しても他サービスは止まらない）
   - Kiriワークスペースでキーを発行し、ローカル`.env.local`の`CLAUDE_API_KEY`を差し替え済み。`claude-haiku-5-5`への最小リクエストでHTTP 200を確認（2026-10-08）。Vercelにも同じワークスペースのキーを入れる
4. 1回の読み解きの実費を公開後のログ・Consoleで測り、`DAILY_LIMIT_ANALYZE`（既定300/日）を$20/月に収まる値へ調整する

Upstash（2026-10-08 ユーザーが作成済み）:
- DB名`kiri-prod`、Regional・Primary Region Tokyo（ap-northeast-1）、Read Regionsなし、Eviction ON、Freeプラン。URL/TOKENはローカルの`.env.local`に設定済み（Vercelには未設定）
- 実サーバーで`MULTI`＋`INCR`＋`EXPIRE NX`を確認済み: 1回目は`[1,1]`でTTL 60、2秒後の2回目は`[2,0]`でTTL 58（延長されない）。テスト用キーは削除済み

デプロイ後に確認すること:
- 本番のログに`[kiri-store] incr fell back to memory`（降格の警告）が出ていないこと

残課題:
- チャットのAPI消費管理（購読と連動した上限など）は後日検討
- プライバシーポリシーは「Upstash（東京リージョン）」と書いてある。実際に作ったリージョンが違えば文言を合わせる

同日の追加（ユーザー承認）:
- **基本情報画面のスキップ**: 生年月日が保存済みなら起動時に日記入力画面から始める（`initialStepFor`、`src/lib/history.js`）。日記入力画面のヘッダーに「{生年月日}生まれ ・ 変更する」と設定の歯車を追加し、下部の「前の画面に戻る」は削除。結果画面の「今日の記録をクリアする」も日記入力へ戻る。復元が終わるまでは背景だけ表示
- **プロフィールが空で上書きされる不具合を修正**: 起動直後、復元前の空の値で保存処理が走り、端末の基本情報を消していた（開発モードでは毎回再現）。復元の反映をstateで待ってから保存するようにした
- Playwrightで375px・1280pxを確認（保存済みプロフィールで日記入力から始まる／「変更する」で値入りの基本情報画面へ／歯車で設定モーダル／コンソールエラー0）

## 2026-10-08 リリース準備を開始（Phase 0 完了・push済み）

リリースまでの道のり: **Phase 0 下準備（済）→ Phase 1 Web公開 → Phase 2 iOSの器 → Phase 3 課金 → Phase 4 審査準備・提出**。

確定したこと:
- **D-14**: 運営者はくうが株式会社（D-U-N-S 964317277 取得済み→Apple Developerは法人で加入）。Webは無料お試し版として公開し、Kiriとのチャットはアプリ限定の有料機能。公開URLは`kiri.kugainc.com`、問い合わせ窓口は`info@kugainc.com`で確定。法務3ページに記入済み
- **D-15**: 危機対応（方式A）。日記で拾ったら窓口カード＋寄り添いモードの読み解き、チャットで拾ったらAIを呼ばずに固定文＋窓口カード
- **D-16**: モデルをSonnet 5.5（分析）／Haiku 5.5（チャット）へ。`temperature`が使えなくなったので、文章の安定はキャッシュが担う

この日にやったこと:
- `src/lib/kiriSafety.js`（検出・窓口・安全指示）と`src/components/SupportCard.jsx`を新規作成し、結果画面・履歴詳細・チャット・/supportに組み込んだ
- `src/lib/claudeResponse.js`で、思考ブロックを飛ばして本文を取り出すようにした
- `npm audit fix`でNext.js 16.4.0／sharp 0.35.5へ更新（critical含む実行時の脆弱性を解消）。開発用依存に`braces`のhighが残るが、`--force`が必要なため保留
- `<img>`を`next/image`に置き換え、lintの警告を0にした
- 実APIで確認済み: 危機の日記→`support: true`＋寄り添い文、日常の日記（「死ぬほど笑った」）→通常、同一入力の2回目はキャッシュで同一、チャットの危機ワード→固定文。Playwrightで375px・1280pxの結果画面／チャット／サポートページを目視確認
- 寄り添いモードでは今日のヒントの文が日記本文を引用しないようにした（「ここに書いてくれた今日」）
- 法務3ページに運営者（くうが株式会社）と問い合わせ窓口（info@kugainc.com）を記入
- 気分の選択肢を11種類・アイコン重複なし・ラベル付きに整理（D-17、`src/lib/moods.js`）。記録欄の例文に出ていた「/n」も改行に修正

気づいたけど未対応:
- チャットパネルの背景が半透明で、後ろの結果画面が透けて読みにくい（以前からのデザイン）

Vercel（2026-10-08）:
- 既存プロジェクト`spiritual-diary`（`spiritual-diary-tau.vercel.app`、GitHub連携・`main`が本番）を使う。`main`を作業ブランチまで早送りし、`vercel.json`で関数を東京（hnd1）に
- 環境変数: `CLAUDE_API_KEY`（Kiriワークスペースのキーに差し替え・Secret・All Environments）、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`（Secret）、`KIRI_STORE_SECRET`（Secret）、`DAILY_LIMIT_ANALYZE=30`。いずれもProduction and Preview。`KIRI_CHAT_PREVIEW`は入れない（Webはチャットを閉じる、D-14）
- 環境変数を入れる前の本番デプロイでは、`/api/analyze`・`/api/chat`が設計どおり503を返すことを確認済み
- 環境変数を入れた後の本番（`1fad5ef`）で確認済み: 空の入力で`/api/analyze`は400（readinessを通過）、`/api/chat`は403（チャット閉鎖）。Upstashにレート制限キー（IPはハッシュ・TTL約2分）と日次クォータキー（TTL 2日）が書かれ、メモリ降格なし。Playwright 375pxで基本情報→日記→読み解き→結果を通し、端末キャッシュ1件・履歴1件を確認。リロード後は日記入力から始まり、同じ内容の再読み解きは端末キャッシュで即表示・日次クォータは1のまま（API非呼び出し）
- 未確認: 1280px表示、バックアップ書き出し/読み込み、`kiri.kugainc.com`経由の表示
- 料金プラン: Hobbyは非商用のみなので、`kiri.kugainc.com`で一般公開する前にProへ上げるか判断する

次（Phase 1 Web公開）の順番:
1. API保護をUpstash Redisへ移す（コード側は完了・D-18）。Upstash作成・`KIRI_STORE_SECRET`設定・Anthropic側の利用額上限はユーザー作業
2. ~~Vercelへデプロイ~~ 済み（`spiritual-diary-tau.vercel.app`で動作確認済み）→ Vercelの料金プラン判断（Pro）→ Vercelの Domains に`kiri.kugainc.com`を追加 → Cloudflareで CNAME（プロキシはオフ＝DNS only推奨）→ 実環境でバックアップまで通し確認

## できていること

- 年・月・日の選択式を含む基本情報入力と、次回起動時の復元（2回目以降は日記入力から始まる）
- 気分・出来事・直感の日記入力
- 四柱、日/月/年/時運、大運、テーマ別スコアの算出
- キーワード＋Kiriの具体的な説明による今日のヒント
- Kiri人格を共有した分析文と、結果文を文脈にしたチャット開発プレビュー
- 占い履歴（最大30件）とチャット履歴（最大40メッセージ）の端末内保存
- 同日・同一条件での分析結果の安定化
- モバイル向けの静かな夜色UI、絵文字表示から線画アイコンへの変更
- APIの第一段階保護（D-08）: IP別レート制限、JST日次クォータ、チャットの`KIRI_CHAT_PREVIEW`ゲート＋entitlementスタブ。403/429時はチャットUIがKiriの言葉で案内
- 四柱推命の境界ケース独立照合（D-10）: 日柱連続性・立春前後・節入り前後・0時/夜子時・時柱境界がすべて古典ルール手計算と一致。流派方式3点を仕様承認済み
- 日記データのJSONバックアップ（D-09第一段階）: 設定の歯車（スタート画面・日記入力画面）から書き出し/読み込み。復元はidマージで既存データを消さない。実ブラウザでエクスポート/インポート往復を確認済み
- 閲覧の課金境界を確定（D-11）: 日記履歴は無料、Kiri会話ログの閲覧は有料側。実装は課金導入時にチャットパネルごとゲート
- プライバシーポリシー（/privacy）・利用規約（/terms）・サポート（/support）ページ。スタート画面下部からリンク。運営者名と問い合わせ窓口は2026-10-08に記入済み
- デザインシステム（D-13）: 夜色トークン（金アクセント1色・データ4色・五行5色）、しっぽり明朝×Zen角ゴ新、「霧の谷の光」アニメーション（トップ/読み解き中、reduced-motion対応）、履歴タップで過去の読み解きを読み返す詳細モーダル。実ブラウザで全画面QA済み
- 画面の情報設計を整理: バックアップはスタート画面右上の設定アイコン（歯車）→設定モーダルへ。最近の記録は結果画面「今日の記録」下のボタン→一覧モーダル（記入日付き）→タップで詳細。CollapsibleSectionのbutton入れ子（HTML違反・hydrationエラー）も修正
- 記録削除の安全化: 個別削除・すべて削除とも確認ダイアログを挟む（「削除した記録は元に戻せません。バックアップを取っていない場合、復元はできません」＋設定アイコンへの導線）。削除後は「記録を削除しました」を3秒表示（role=status）
- バックアップ文言の統一: 「バックアップは自動では行われないので、設定アイコンの「バックアップ」を選択して定期的に書き出す」を設定モーダル・削除確認・サポートFAQの3箇所に反映。昔の日記だけ読む導線は現状不要と判断（入口は結果画面のみ）

## 検証済み

```text
npm test                 15 files / 130 tests passed（2026-10-08）
npm run lint             errors 0 / warnings 0
npm run build            success
npm audit --omit=dev     vulnerabilities 0
```

APIの403（プレビュー無効）、429（レート制限・Retry-Afterヘッダ付き）、プレビュー有効時の通過は、`next start`をポート3999で立ててcurlで実挙動を確認済み（2026-07-28）。
2026-10-08: `VERCEL_ENV=production`かつRedis未設定で`/api/analyze`・`/api/chat`が503、開発時（`VERCEL_ENV`未設定）でレート制限の429（Retry-After付き）が従来どおり返ることをcurlで確認済み。

## 2026-07-28セッションのまとめ

同日中に次を完了した（コミット146d3f4〜e3c61cd、すべてpush済み）。

1. API第一段階保護（D-08）: レート制限・日次上限・チャットのプレビューゲート＋entitlementスタブ
2. 四柱推命の境界ケース独立照合と流派方式の仕様承認（D-10）
3. 日記データのJSONバックアップ第一段階（D-09）と閲覧課金境界の確定（D-11）
4. 法務3ページ（/privacy /terms /support、運営者表記は保留）とiOS方式確定（D-12: Capacitor）
5. デザインシステム（D-13）: 夜色トークン・しっぽり明朝×Zen角ゴ新・「霧の谷の光」アニメーション
6. UX仕上げ: 設定アイコン化・記録一覧と読み返しモーダル・削除確認＋完了通知・バックアップ文言統一

検証はテスト53件・lint 0エラー・build成功・audit脆弱性0。主要フローは実ブラウザで通し確認済み。
注意: 長時間起動のdevサーバーはTurbopackキャッシュでCSSが古くなることがある。表示が変なら再起動＋ハード再読み込み。

## ローカルで進められる作業はここまで完了（2026-07-28）

以降はすべてユーザーの決定・外部リソースが先行条件になる。

- **運営者表記・問い合わせ窓口**: 2026-10-08確定・記入済み（くうが株式会社／info@kugainc.com）
- **Webデプロイ**: 「まだデプロイしない」で保留中。/api があるためNodeホスティングが必要（Vercel推奨済み）
- **iOSの器**: Capacitor方式で確定（D-12）。着手はWebデプロイ後。課金はRevenueCat→`checkChatEntitlement()`接続
- **四柱推命の人による照合**: 独立演算照合はD-10で済。専門家または外部命式表での確認を公開前に推奨
- **API認証・永続的利用量監視**: レート制限・日次上限はD-08で第一段階済み。本格版は本番インフラ決定後
- **実機iPhone QA・App Store素材**: iOS着手後

## デプロイを決めたあとの順番

1. 運営者名・問い合わせ窓口を確定して法務3ページに記入する
2. Webを公開し、実環境で入力→分析→結果→履歴→バックアップを通し確認する
3. Capacitorの器と課金を実装する（entitlementはD-08のスタブに接続、閲覧境界はD-11、ネイティブ保存はD-09第二段階）
4. 実機QA後にApp Store提出準備へ進む

## 開発コマンド

```bash
cd /Users/usausagi/Documents/AI_Playground/spiritual-diary
npm install
cp .env.example .env.local
# .env.local に CLAUDE_API_KEY を設定
# チャットを使うなら KIRI_CHAT_PREVIEW=1 も設定（未設定なら /api/chat は403）
npm run dev
```

ブラウザは`http://localhost:3000`。分析APIは`POST /api/analyze`、チャットAPIは`POST /api/chat`。

### 2026-10-09 最終（ロック再監査の後）
- 再監査（scratchpad rereview-lock.md）: P0/P1なし。P2-A（postinstall失敗でWeb本番ビルド停止）→ postinstallは警告のみ・`ios:build`は`--strict`で停止に変更。P2-B（prepareLockBootの例外で起動停止）→ ロックなしで続行。P2-C（ロックON時スプラッシュ最大+1.5秒）・P2-D（心拍の小さな穴、早めロック側）は記録のみ。
- 次: 実機T-L9（ひとみうさのiPhone。Xcodeで Team=くうが株式会社 を選んで実機ビルド）→ 監査チェック項目（共有シートがロックの上に残る件・切り替え画面のぼかし・「すぐに」で中身が一瞬見えないか・注記どおりパスコードが出るか・コントロールセンター後のクラッシュ）→ main へのマージ判断（ユーザーが `git push origin agent/ios-lock:main`）→ 本番CORSを実呼び出し1〜2回で確認。

### 2026-10-09 午後（ひとみうさ外出中に進めた分）
- 改善: `ios:sync:dev`（L-6）・Info.plist arm64（L-7）・アバター144px化（138KB→20KB）・**Dynamic Type（D-26、iOSアプリのみ100〜135%・Webは不変・`src/lib/dynamicType.js`の`DYNAMIC_TYPE_ENABLED`で切れる）**。ロック画面は自動でFace IDを始めずボタンから（D-25更新）。設定を開くたびに認証可否を再確認。
- 設計資料は `docs/plans/2026-10-09/`（README参照）。Phase 3課金設計・Phase 4申請素材の下書きもここ。

### ひとみうさの判断待ち（次回まとめて）
1. ~~文言の確認~~ 済み（2026-10-09: 失敗時の声は5番目を「言葉を紡げない」に修正、ほかとロック画面はOK）
2. ~~Dynamic Type をこのまま採用するか~~ **採用で確定（D-26）**。（シミュレータで「設定→アクセシビリティ→画面表示とテキストサイズ→さらに大きな文字」で確認）
3. ~~App Store 4.3(b)~~ **決定（2026-10-09）: 「日記と内省」として見せる**（占い語を名前・説明・スクショに出さない、カテゴリはライフスタイル）。元の論点: Appleは「占い（fortune telling）」を新規受付しない例に名指し（原文確認済み）。日記＋内省＋AIとして見せる方針（名前・説明・スクショで占い語を避け、カテゴリはライフスタイル）でよいか。結果画面の見出し調整の要否
4. Phase 3 課金: **決定（D-27・D-28・D-30）＝月額480円・1週間トライアル・1日60通・解約後もログは読める・商品名「Kiriと話す」・購入画面は案A（下から出るシート）**。2026-10-10 で質問はすべて解決。元の質問（`docs/plans/2026-10-09/kiri-phase3-billing-design.md` §4）: 月額価格（推奨¥480）・無料トライアル（推奨なし）・1日の上限（推奨60通）・解約後のログ閲覧（推奨: 消さずに閲覧可）・商品名と約束内容
5. 公開前の日次上限（全体30回では審査員が429で弾かれうる）・Anthropic側の保持（最長30日）をプライバシーポリシーに追記するか
6. ~~Cloudflare 非mainビルド~~ 済み（2026-10-09: 「プレビューブランチのビルド」をオフ。プロダクション=main・cf:build/cf:deploy を確認）→ `agent/ios-lock`・`agent/ios-shell` を GitHub へ push済み（バックアップ）
7. 実機T-L9 → main マージ（`git push origin agent/ios-lock:main`）→ 本番CORS確認

### Apple Developer Program（法人）の状況（2026-10-10 確認）
- くうが株式会社の登録は**処理中**（登録ID 6HD9YZT8ZL。Appleが署名権限を確認中→完了メール待ち。確認の電話が来ることがある）。Xcodeのアカウント（hitomisisa@yahoo.co.jp）に見えるのは「TEPPEI TSUZUKI（Finance・署名不可・Kiriには使わない）」と「Personal Team」だけ
- それまでの実機テストは **Personal Team**（無料・プロファイル7日・課金などは不可）。署名チームの設定は project.pbxproj に入るが**コミットしない**
- TestFlight・課金（Phase 3）・App Store提出は法人登録の完了が前提

### 実機テスト T-L9（2026-10-10 ひとみうさの iPhone 12 mini・Personal Team 署名・本番API向けビルド）
- PASS: 初回は基本情報から→入力後に完全終了して再起動すると日記画面から（Preferences 保存）／ロックをオンにすると Face ID 確認／Appスイッチャーで画面がぼける／Face ID に2回失敗すると iOS が「パスコードを入力」を出す（ロック画面の注記は事実どおり）・「あとで」でロック画面に戻り文言なし（設計どおり）／コントロールセンターの出し入れで落ちない
- 想定どおりの失敗: 読み解きは「通信がつながっていない」系のエラー（本番にまだ CORS が無いため。AI は呼ばれていない）→ main マージ後に確認
- 未確認: 共有シートを開いたまま背景→戻るとロックの上に残る件（D-25 で受容済みの残リスク）・「すぐに」で戻る瞬間に中身が一瞬見えないか（目視では気づかず）
- 再インストール: Personal Team は7日で失効。`xcodebuild ... -destination 'id=00008101-000A19540E69003A' -allowProvisioningUpdates DEVELOPMENT_TEAM=QJ8WUGJF25 CODE_SIGN_STYLE=Automatic build` → `xcrun devicectl device install app --device 925C3C81-1356-517C-BD44-2A1682B50974 <App.app>`（プロジェクトファイルは書き換えない）

### 本番反映（2026-10-10）
- ひとみうさが `git push origin agent/ios-lock:main`（1bd3599→cb88893・早送り）→ Workers Builds で約2分で反映
- 本番確認: トップ・/privacy・/terms・/support 200／OPTIONS（capacitor://localhost）で ACAO 付き・他オリジンは付かない／空POSTの analyze 400（ACAO付き）・chat 403
- **実機（iPhone 12 mini）から本番で読み解き1回成功**（同意画面→結果画面）。D-21 の本番CORS確認は完了
- この追記コミットは main 未反映（docs のみ。次に main へ push するときに一緒に入る）

### 2026-10-10 購入画面の型と商品名（D-30）
- 比較HTML `docs/plans/2026-10-10/compare/paywall-compare.html`（案A シート／案B 扉＋商品名3候補）→ **案A＋「Kiriと話す」で確定**。比較HTML内のモックは旧推奨名「Kiriとの対話」のまま（記録として残す。実装は D-30 の文言に従う）
- Phase 3 で決めることは残っていない。次の実装（設計書 T3-1〜T3-10、ASC・RevenueCat の作業 T3-12〜14）は Apple の法人登録の完了待ち。ただし T3-1〜T3-5・T3-6b・T3-9 は登録なしでも先に進められる（StoreKit Configuration File でシミュレータ確認まで）
