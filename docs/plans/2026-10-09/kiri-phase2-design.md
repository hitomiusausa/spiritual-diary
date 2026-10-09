# Kiri Phase 2 設計書 — iOSの器（Capacitor）・課金なし

作成: 2026-10-09 / 裁定者: Fable 5.1（設計のみ。コード・リポは未変更）
前提: `agent/consolidate-spiritual-diary` @ `5330a55`（origin/main `1bd3599` より docs 2コミット先行。local `main` は古い `635b0b3` で無視してよい）。Web本番 `kiri.kugainc.com` は Cloudflare Workers（D-19）で稼働中。

調査で実測した事実（設計の根拠）:
- リポのコピーで `output:'export'` を試し、`src/app/api` を外せば **5ページが静的書き出しできる**（`out/` 14MB、Google Fonts は `_next/static/media` に自己ホスト、クライアントバンドルに upstash/anthropic の痕跡なし）。
- `distDir` を指定すると Next 16.4 は書き出し先を `out/` ではなく `distDir` にした。**`distDir` は使わない**。
- `pageExtensions` でAPIルートを除外する方式（後述）は、Web build で `/api/*` が ƒ として残り、iOS build で消えることを両方確認。
- このMacに **iOSシミュレータのランタイムが1つも入っていない**（`xcrun simctl list runtimes` が空）。Xcode 26.3・CocoaPods 1.16.2 はある。
- Capacitor 8.5.2（2026-09-11）が2週間ルールを満たす最新。公式プラグイン8系はすべて `Package.swift` 同梱（SPM可）。

---

## 1. スコープと完了条件

### Phase 2 に入れるもの
1. iOS用の静的書き出し（Workers/OpenNext のビルドに影響しない切替）
2. APIの絶対URL化（`NEXT_PUBLIC_KIRI_API_BASE`）と、Workers API の CORS（`capacitor://localhost` のみ）
3. 端末保存のネイティブ化（Preferences。同期シム＋一度きりの移行。D-09 第二段階）
4. バックアップ書き出し/読み込みの iOS 対応（Filesystem＋Share）
5. 4.2対策のネイティブ統合: Preferences・Haptics・StatusBar・SplashScreen・Share・セーフエリア・オフライン起動
6. 5.1.2(i) 第三者AI送信の同意画面（初回の読み解き前・撤回可）
7. 課金前のチャット導線の整理（本番では使えない・開発プレビューボタンを本番から消す）
8. バンドルID/アプリ名の確定、`ios/` プロジェクトのコミット、テスト、シミュレータ＋実機の検収
9. ドキュメント: DECISIONS（D-20〜）、HANDOVER、プライバシーポリシー2節の文言

### 入れないもの（Phase 3以降）
- RevenueCat / StoreKit / `checkChatEntitlement()` の購読接続（Phase 3）
- Push通知・ユニバーサルリンク・Android
- App Store Connect のメタデータ・スクリーンショット・年齢レーティング・プライバシー栄養表示（Phase 4。ただし栄養表示に効く「Anthropic側の保持」は Phase 4 の冒頭で要確認）
- クラウド同期・認証（D-09 第三段階）
- Next の版変更（16.4.0 は本番稼働中。触らない）

### 完了条件（Definition of Done）
**共通**: `npm test`・`npm run lint`・`npm run build`・`npm audit --omit=dev`（0件）・`npm run cf:build` がすべて通る。Web本番の挙動は不変（Playwright 375/1280で入力→読み解き→結果→履歴→バックアップを再確認、コンソールエラー0）。

**シミュレータ（iPhone 17 系・iOS 26）**:
1. 起動: 夜色スプラッシュ → 基本情報画面。ステータスバーが本文と重ならない（セーフエリア）。
2. 基本情報を保存 → アプリを完全終了 → 再起動で日記入力から始まる（Preferences 永続）。
3. 初回「読み解く」で同意画面 → 同意 → ローカル dev API（`http://localhost:3000`、CORS 経由）で読み解き成功 → 結果・履歴1件・端末キャッシュ1件。
4. 同じ入力で再読み解き → API を呼ばず即表示（キャッシュ）。
5. 履歴一覧 → 詳細モーダル → 個別削除（確認ダイアログ）→ キャッシュも消える。
6. 設定 → バックアップ書き出し → シェアシートで「"ファイル"に保存」→ 読み込み → 「追加された記録 0件・全1件」（往復成功）。
7. /privacy /terms /support へ遷移して「ホームへ戻る」で戻れる。
8. 機内モードで起動 → 履歴が読める（オフライン起動）。読み解きは「声が届かない」系の表示で落ちない。
9. チャット: 本番向け設定では「開発プレビューでKiriに聞く」が出ない。
10. Xcode のコンソールに日記本文・IP・APIキーが出ない。

**実機（iPhone・Developer 署名）**:
1. 本番 API（`https://kiri.kugainc.com`）で読み解きが成功する（CORS 実証。クォータ1消費）。Workers のログに `incr fell back to memory` が出ない。
2. Haptics: 「読み解く」タップで軽い振動、結果表示で通知振動。
3. バックアップのシェアシートで AirDrop/ファイル保存、"ファイル"アプリから読み込み。
4. アプリをスワイプで終了→再起動、再インストールなしでデータ保持。
5. 相談窓口カードの `tel:` で発信確認ダイアログが出る。
6. スクリーンショット（Dynamic Island機種）で上下セーフエリアが正しい。

---

## 2. 裁定（Ruling）

書式: **決定 — 理由 — 外れた時の代償**

### Ruling 1: Capacitor 8.5.2 を SPM で導入する
- **決定**: `@capacitor/core`・`cli`・`ios` を **8.5.2（2026-09-11）に固定**（caret なし。opennext と同じ流儀）。`npx cap add ios`（既定の SPM）。プラグインも2週間ルールで固定: preferences 8.0.1 / haptics 8.0.2 / share 8.0.2 / filesystem 8.1.3 / status-bar 8.0.3 / splash-screen 8.0.2。`@capacitor/app`・`keyboard`・`browser` は Phase 2 では入れない（使う場面がない）。iOS 最小 15.0（Capacitor 8 既定）。
- **理由**: 8.5.3（10/07）は Cordova 向け修正のみで不要。SPM は Capacitor 8 の既定で、公式プラグイン8系は `Package.swift` 同梱を確認済み。CocoaPods を混ぜると `Podfile` と `pod install` の面倒が増える。
- **代償**: Phase 3 の RevenueCat プラグインが SPM 非対応だった場合、`npx cap add ios --packagemanager CocoaPods` で作り直す（`ios/` は生成物なので作り直しコストは小）。その判断は Phase 3 の冒頭で `npm pack @revenuecat/purchases-capacitor --dry-run | grep Package.swift` で確かめる。

### Ruling 2: 静的書き出しは `KIRI_BUILD_TARGET=ios` で切り替え、API ルートは `pageExtensions` で除外する
- **決定**:
  - `src/app/api/analyze/route.js` → `route.api.js`、`src/app/api/chat/route.js` → `route.api.js` に改名。
  - `next.config.mjs`: `const ios = process.env.KIRI_BUILD_TARGET === 'ios'`。`pageExtensions: ios ? ['js','jsx'] : ['api.js','js','jsx']`。ios のときだけ `output:'export'` と `trailingSlash:true` を足す。`images.unoptimized` と `agentRules` は不変。**`distDir` は使わない**（Next 16.4 は書き出し先が `distDir` になることを確認）。出力は `out/`（gitignore 済み）。
  - ビルドは `scripts/build-ios.mjs`（`npm run ios:build`）。この中で `KIRI_BUILD_TARGET=ios` と `NEXT_PUBLIC_KIRI_API_BASE` を **プロセス環境として** 渡して `next build` を起動する。`.env.ios` のようなファイルは作らない（D-19: OpenNext が `.env*` を Worker に埋め込むため）。`--dev` で `http://localhost:3000`、既定で `https://kiri.kugainc.com`。
  - `.next` を共有するので、`npm run dev` や `cf:build` と同時に走らせない。
  - Workers Builds の環境変数に `KIRI_BUILD_TARGET` を**置かない**（置くと本番が静的化して API が消える）。
- **理由**: 実測で両ビルドが正しく出た。ディレクトリを一時退避する方式はビルド途中で落ちると `src/app/api` が消えたままになる事故があり、`git status` も汚れる。`pageExtensions` は決定的で副作用がない。
- **代償**: 本番のビルド経路（ファイル名と `pageExtensions`）に触れるので、マージ前に `npm run cf:build && npm run preview` で workerd 上の `/api/analyze` 400・`/api/chat` 403 を必ず確認する。テストの import（`@/app/api/*/route` → `route.api`）も追従。もし OpenNext 側で不具合が出たら、代替は「`scripts/build-ios.mjs` が `src/app/api` を `.ios-build/` へ退避し `finally` で戻す」方式。

### Ruling 3: API ベースURLは `NEXT_PUBLIC_KIRI_API_BASE` を1ヘルパで解決する
- **決定**: `src/lib/apiUrl.js` に `apiUrl(path)`。`process.env.NEXT_PUBLIC_KIRI_API_BASE`（末尾 `/` を除去）＋ path。未設定なら相対（Web はこれ）。`SpiritualDiary.jsx:204` と `KiriChatPanel.jsx:32` の2箇所だけ置換。
- **理由**: fetch は2箇所・相対URLのみ（ブリーフ§2）。Web ビルドは未設定＝不変なので本番に影響しない。
- **代償**: ドメインを変える日は iOS を再ビルドして審査に出し直す。将来の `Authorization` 付与（Phase 3）はこのヘルパの隣に `apiHeaders()` を足せば済む。

### Ruling 4: CORS は `capacitor://localhost` だけを許可し、Web の防御姿勢は変えない
- **決定**:
  - `src/lib/cors.js`: `ALLOWED_APP_ORIGINS = ['capacitor://localhost']`。開発用に `KIRI_EXTRA_ALLOWED_ORIGINS`（カンマ区切り）を**開発環境でのみ**追加可（`isGuardedDeployEnv()` が true なら無視）。
  - 両ルートに `export async function OPTIONS(request)`: Origin が許可リストに**完全一致**なら 204 ＋ `Access-Control-Allow-Origin: <echo>`・`Allow-Methods: POST, OPTIONS`・`Allow-Headers: Content-Type`・`Max-Age: 86400`・`Vary: Origin`。一致しなければ 204 を返すがヘッダを付けない（ブラウザが拒否）。
  - POST の全応答（400/403/429/503 を含む）に、Origin が一致するときだけ同じ `Allow-Origin`＋`Vary: Origin`＋`Access-Control-Expose-Headers: Retry-After` を付ける。`*` と `Allow-Credentials` は使わない。
  - `https://kiri.kugainc.com` は許可リストに**入れない**（Web は同一オリジンなので不要）。
  - `CapacitorHttp` は有効化しない。
- **理由**: `Content-Type: application/json` でプリフライトが走るため OPTIONS が必須。CORS はブラウザの読み取り制限を緩めるだけで、API の防御（IPレート制限・日次クォータ・Cookie なし・秘密なし）には関与しない。他サイトのオリジンは今も今後もプリフライトで落ちる。非ブラウザクライアントは元々 CORS の対象外。
- **代償**: 将来 Web でもチャットを開く等でオリジンを増やす場合は、リストに足すだけ。許可リストを `*` にした瞬間、他サイトが利用者のブラウザ経由で API を叩けるようになるので、絶対にやらない。

### Ruling 5: 端末保存は Preferences へ、呼び出し側は同期のまま（同期シム＋一度きり移行）
- **決定**:
  - `src/lib/storage.js`: `initStorage()`（非同期・起動時1回）と `getStorage()`（同期・`getItem/setItem/removeItem`）。Web は `window.localStorage` をそのまま返す。ネイティブ（`Capacitor.isNativePlatform()`、`@capacitor/core` は動的 import）では、起動時に対象4キー（`spiritual-diary.history.v1`・`profile.v1`・`chat.v1`・`kiri-analysis-cache-v1`）を Preferences からメモリへ読み込み、書き込みはメモリ更新（同期）＋Preferences へ write-through（キーごとに直列化・最後の値が勝つ）。
  - **一度きり移行**: ネイティブで `spiritual-diary.migrated.v1` が Preferences に無く、WKWebView の localStorage に上記キーがあれば Preferences へコピーしてから印を置く。**localStorage 側は消さない**（D-09: 既存データを消さない。印があれば以後は読まない）。
  - `SpiritualDiary.jsx`・`KiriChatPanel.jsx` の `window.localStorage`（計10箇所）を `getStorage()` に置換。マウント時の effect は `await initStorage()` の後に `loadProfile/loadHistory` を呼ぶ。既存の `profileHydrated` ガードで「復元前の空保存」は防げている。復元までは背景だけ表示（既存挙動）。
  - `history.js`・`backup.js`・`chatHistory.js`・`analysisCache.js` は **無変更**（`storage` 引数設計のまま）。
  - 容量: 履歴30件＋チャット40件＋キャッシュ10件で数百KB。UserDefaults で問題ない。
- **理由**: ライブラリは全部同期APIで `storage` を引数に取るので、シムなら呼び出し側の改修が最小（ブリーフ§3）。Preferences（UserDefaults）は iCloud/ iTunes バックアップ対象で、ITP の7日削除から逃れられる（D-09 第二段階の目的）。
- **代償**: write-through の直後にアプリが強制終了すると最後の1書き込みが落ちる可能性（数ms窓）。日記は「読み解く」直後に保存されるので実害は小さい。データが数MBに育ったら Filesystem（`Directory.Data`）への移設を D-09 第三段階と一緒に判断する。

### Ruling 6: バックアップ書き出しは Filesystem（Cache）＋Share、読み込みは `<input type=file>` のまま
- **決定**: ネイティブでは `Filesystem.writeFile({ path: backupFileName(), data: json, directory: Directory.Cache, encoding: UTF8 })` → 戻りの `uri` を `Share.share({ files: [uri], title })`。共有後に Cache のファイルを削除。Web は現行の `<a download>` のまま。読み込みは既存の file input（WKWebView で"ファイル"アプリが開く。実機で確認）。`applyBackup` の id マージは不変。
- **理由**: WKWebView では `download` 属性が効かない（ブリーフ§5）。Share なら"ファイル"保存・AirDrop・iCloud Drive を利用者が選べる。
- **代償**: 利用者がシェアシートをキャンセルしても「書き出しました」と出さないよう、`Share.share` の reject（cancel）を拾って通知を分ける。

### Ruling 7: 4.2 対策のネイティブ統合はこの6点に絞る
- **決定**: ①Preferences（Ruling 5）②Haptics（「読み解く」= `impact Light`、気分選択= `selectionChanged`、結果表示= `notification Success`、削除確定= `impact Medium`。Web では no-op）③StatusBar（`style: Dark`＝明るい文字。背景は夜色 `#171522`）④SplashScreen（`launchAutoHide:false`、復元完了後に `hide()`。背景 `#171522`）⑤Share（Ruling 6）⑥セーフエリア（`layout.js` に `export const viewport = { width:'device-width', initialScale:1, viewportFit:'cover' }`、`.kiri-shell` 等に `env(safe-area-inset-*)` の padding）。オフライン起動は静的同梱で自然に満たす。審査メモ用に「端末内保存・オフライン閲覧・ハプティクス・シェア・（Phase 3）IAP」を列挙できる状態にする。
- **理由**: D-12 の明記項目（ストレージ移行・ハプティクス）＋「薄いWebView」と見なされないための最小セット。通知・ウィジェットは価値に対し工数が大きい。
- **代償**: 4.2 は審査員の裁量。落ちた場合の追加候補は「ホーム画面ウィジェット（今日のヒント）」「ローカル通知（記録のリマインド）」。スプラッシュの見た目は人間の決定（Q5）。

### Ruling 8: 課金前のチャット導線 — 本番では入口を出さない
- **決定**: `SpiritualDiary.jsx:1424-1430` の「開発プレビューでKiriに聞く」ボタンは `process.env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW === '1'`（ビルド時定数）のときだけ描画する。Web 本番・iOS 本番ビルドでは未設定＝非表示。プレミアムカードは残し、文言を「Kiriとの対話は、アプリ内で近日提供予定です」系に（文言は Q4）。`InfoPopup` の「StoreKitまたはRevenueCat…」の開発者向け文は利用者向けに書き換える。サーバーの 403 ゲート（`KIRI_CHAT_PREVIEW` 未設定）はそのまま＝二重の壁。
- **理由**: D-14「Phase 2 の本番で無料チャットを使わせない」はサーバーで既に満たされているが、押すと「準備中」と返るボタンが本番に出ているのは UX の傷で、審査でも「動かない機能」と見られる。
- **代償**: 開発でチャットを試すときは `NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1` と `KIRI_CHAT_PREVIEW=1` の両方が要る（`.env.local` のみ。`.env.example` に追記）。

### Ruling 9: `DAILY_LIMIT_ANALYZE=30`（全体合算）はアプリ配布前に「予算から逆算した全体上限＋1端末あたりの日次上限」へ
- **決定（推奨・費用はオーナー判断 Q2）**:
  - 1読み解きの実費を本番コンソールで測る（HANDOVER 残課題。未計測）。
  - 全体上限 = floor(月予算 ÷ 30 ÷ 実費)。Kiri ワークスペース上限が $20/月のままなら、実費 $0.05 と仮定して **約13/日**（＝現在の30でも使い切れば上限超え）。配布するなら予算を上げる判断が先。
  - 新設 `DAILY_LIMIT_ANALYZE_PER_CLIENT`（既定 5/日、IPハッシュ単位、キー `kiri:qc:analyze:{ip}:{JST日}`、TTL 2日）。1端末が全体を食い潰すのを防ぐ。`apiGuard.js` の `createDailyQuota` に `clientKey` を受ける派生を足すだけ。
  - 上限到達時のクライアント文言は既存の `daily_limit` 系を流用。
- **理由**: 全体合算30は「自分と数人の試用」向けの値で、App Store 配布後は昼過ぎに全員が「今日はここまで」になる。費用の最終防波堤は Anthropic 側の上限（D-18）なので、上限値そのものは予算の問題＝オーナー決定。
- **代償**: 予算を上げなければ、アプリが良くても「使えない日」が生まれる。per-client を入れないと、1人の連打で全員が止まる。

### Ruling 10: 5.1.2(i) の同意画面は Phase 2 に入れる（初回の読み解き前・撤回可）
- **決定**:
  - `src/lib/consent.js`: `CONSENT_VERSION = 1`、キー `spiritual-diary.consent.v1`（`{version, acceptedAt}`）。`hasConsent(storage)` / `recordConsent(storage)` / `revokeConsent(storage)`。バックアップには**含めない**（端末ごとの同意）。
  - 表示場所: 「読み解く」を押した時、同意が無ければモーダルを出し、同意後に分析を続行（起動時にはブロックしない）。チャットは Phase 3 で同じ同意を再利用。
  - 撤回: 設定モーダルに「AI送信の同意を取り消す」（取り消すと次の読み解きで再表示）。
  - Web にも同じコンポーネントを出す（推奨。Q3）。Apple 規約の対象は iOS だけだが、同じ送信をしているので説明責任は同じ。
  - **文言草案（決定はオーナー）**:
    > **読み解きのための送信について**
    > 「読み解く」を押すと、基本情報（生年月日・出生時刻・性別・ニックネーム）と今日の記録（気分・出来事・直感）が、くうが株式会社のサーバーを経由して **Anthropic社のAI（Claude）** に送られ、Kiriの言葉を生成します。
    > ・送信は読み解きのときだけです。サーバーには日記の内容を保存しません。
    > ・Anthropic社での取り扱いは同社の方針に従います。
    > ・同意はいつでも設定から取り消せます（取り消すと読み解きは使えなくなります）。
    > [プライバシーポリシーを読む]　［同意して読み解く］［今はやめる］
- **理由**: 5.1.2(i) は「第三者AIへ共有する前の明示的な許可」を求める。読み解きが Phase 2 で動く以上、TestFlight 外部テストの段階から必要。D-18 の「サーバー保存ゼロ」は文言の強みになる。
- **代償**: 同意を Web にも出すと初回体験に1タップ増える。出さない選択をしても iOS 側の実装は変わらない（表示条件だけ）。

### Ruling 11: バンドルID・アプリ名
- **決定（推奨・Q1）**: Bundle ID `com.kugainc.kiri`（運営者ドメインの逆順。D-14）。Xcode の表示名（`CFBundleDisplayName`）は「Kiri」。App Store 上の名前は Phase 4 で決める（候補: 「Kiri」「Kiri — 心と運気のノート」「Mind & Energy Note | Kiri」）。`capacitor.config.ts` の `appId` もこれ。
- **理由**: Bundle ID は後から変えられない（App Store Connect に登録した時点で固定）。会社ドメインに紐づけるのが法人名義の加入と整合する。
- **代償**: 変えたくなったら別アプリとして出し直し。

### Ruling 12: テストと実ブラウザ／シミュレータ検証
- **決定**:
  - 単体（vitest、node 環境のまま。UIテストは導入しない）: `apiUrl`／`cors`（OPTIONS 許可・不許可、POST の echo、`Vary`、`Expose-Headers`、本番で `KIRI_EXTRA_ALLOWED_ORIGINS` を無視）／`storage`（メモリシムの getItem/setItem/removeItem、write-through の直列化、移行の一度きり・localStorage 非削除、Preferences が空で localStorage も空のとき空で始まる）／`consent`（バージョン違いで再同意）／`backupShare`（ネイティブ分岐で Filesystem→Share の順、キャンセル時の通知）／`apiGuard` の per-client 日次（Q2 で採用なら）／`next.config` の切替（`KIRI_BUILD_TARGET` で `pageExtensions`・`output` が変わる純粋関数を `scripts/lib/nextConfigFor.mjs` に切り出してテスト）。TDD: 各タスクはテストを先に書き、赤→緑→リファクタ。
  - 実ブラウザ（Playwright、375/1280）: Web 本番相当（`next start`）で既存フローが不変、開発プレビューボタンが消えている、同意モーダル、セーフエリア padding が 0 で崩れない。
  - シミュレータ／実機: §1 の完了条件。スクリーンショットは `xcrun simctl io booted screenshot`。
- **理由**: 既存テスト138件は全部 `src/lib` と `scripts` の純粋関数。同じ流儀で増やすのが最も安い。
- **代償**: UI の結線ミスはテストで拾えない。だからシミュレータ検収を完了条件に固定する。

### Ruling 13: ブランチとコミット
- **決定**: `agent/ios-shell` を `agent/consolidate-spiritual-diary`（`5330a55`）から切る。タスクごとに1コミット（接頭辞は既存どおり `feat:`/`fix:`/`chore:`/`docs:`、末尾に Co-Authored-By）。`main` と `origin/main` は触らない。origin への push は **Workers Builds の非 main ブランチビルドが無効であることを確認してから**（HANDOVER の推奨。未確認なら T0 で確認）。マージは Phase 2 完了後にオーナーが `agent/consolidate-spiritual-diary` へ取り込み、`main` を早送りして push。
- **理由**: Ruling 2 は本番のビルド経路に触れるので、本番は「オーナーが push した時」だけ変わる状態を保つ。
- **代償**: ブランチが長生きする。途中で Web 側に緊急修正が入ったら `agent/ios-shell` を rebase。

### Ruling 14: `ios/` の扱い
- **決定**: `ios/App`（Xcode プロジェクト・`CapApp-SPM`）はコミットする。`ios/App/App/public`（`out/` のコピー）・`ios/App/Pods`・`ios/App/build`・`DerivedData`・`*.xcuserstate`・`capacitor.config.json`（cap sync 生成）は `.gitignore`（`cap add` が生成する既定を踏襲）。`Info.plist` の `NSAllowsLocalNetworking` 等の開発用 ATS 例外は**入れない**（シミュレータは `localhost` 到達が ATS で落ちる場合、Debug 構成に限る条件付きで検討。まずは無しで試す）。
- **理由**: 署名設定・Capability（Phase 3 の In-App Purchase）・Privacy Manifest を再現可能にするため。
- **代償**: Xcode が触る pbxproj の差分が読みにくい。コミット前に `git diff --stat ios/` を見る。

---

## 3. タスク分割（T0〜T13）

凡例: [Opus]=本番・統合・データ損失に関わる / [Sonnet]=仕様が閉じている / ∥=並行可（触るファイルが重ならない） / →=逐次。

**レーン構成**: A=UI（`SpiritualDiary.jsx` を触る。必ず逐次） / B=API・ビルド / C=ネイティブ。
順序: T0 → (T1 ∥ T2 ∥ T4) → T3 → (T5 ∥ T6は逐次で T5の後) → (T7 ∥ T8) → T9 → T10 → T11 → T12 → T13

### T0 [オーナー・手作業] 前提の整備
- Xcode → Settings → Components で **iOS 26 シミュレータランタイム**を入れる（現在ゼロ）。Xcode に Apple ID でサインインし、Team=くうが株式会社 を確認。
- Cloudflare Workers Builds で非 main ブランチのビルドが無効か確認（有効なら無効化）。
- §4 の Q1〜Q5 を決める。
- 検証: `xcrun simctl list runtimes | grep iOS` に1行以上。

### T1 [Sonnet] API ベースURL ヘルパ（レーン B）
- 触る: `src/lib/apiUrl.js`（新）、`src/lib/__tests__/apiUrl.test.js`（新）、`src/components/SpiritualDiary.jsx:204`、`src/components/KiriChatPanel.jsx:32`。
- テスト: 未設定→相対 / `https://x/`→末尾スラッシュ除去 / path 連結。
- 検証: `npm test && npm run lint && npm run build`。
- ∥ T2, T4 と並行可（SpiritualDiary.jsx を触るので T3 とは逐次）。

### T2 [Opus] CORS（レーン B）
- 触る: `src/lib/cors.js`（新）、`src/lib/__tests__/cors.test.js`（新）、`src/app/api/analyze/route.js`・`src/app/api/chat/route.js`（OPTIONS 追加・全応答にヘッダ付与。※T4 の改名前に着手したら T4 側で追従）、`src/lib/__tests__/apiRoutes.test.js`（CORS ケース追加）。
- テスト: Ruling 4 の全項目。400/403/429/503 の応答にもヘッダが乗ること。
- 検証: `npm test`；`npm run build && PORT=3999 npm start` で `curl -i -X OPTIONS -H 'Origin: capacitor://localhost' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' localhost:3999/api/analyze`（204＋ヘッダ）と `-H 'Origin: https://evil.example'`（ヘッダ無し）；最後に `npm run cf:build && npm run preview` で workerd でも同じ（`.dev.vars` が本番 Upstash なら空入力の 400 だけで済ませる）。

### T3 [Sonnet] 保存アクセスの抽象化（Web 動作は不変）（レーン A）
- 触る: `src/lib/storage.js`（新。まずは Web 実装＋メモリシムの骨組み。ネイティブ分岐は T10）、`src/lib/__tests__/storage.test.js`（新）、`SpiritualDiary.jsx`（`window.localStorage` 7箇所→`getStorage()`、マウント effect を `await initStorage()` 後に）、`KiriChatPanel.jsx`（3箇所）。
- テスト: メモリシム semantics、`initStorage` が Web で即解決、`getStorage` を init 前に呼んだら localStorage にフォールバック。
- 検証: `npm test && npm run lint && npm run build`；Playwright 375px で入力→読み解き→結果→リロードで日記入力から。
- → T1 の後（同一ファイル）。

### T4 [Opus] iOS 静的書き出しビルド（レーン B）
- 触る: `src/app/api/analyze/route.js`→`route.api.js`、`src/app/api/chat/route.js`→`route.api.js`（`git mv`）、`next.config.mjs`、`scripts/lib/nextConfigFor.mjs`（新・純粋関数）、`scripts/build-ios.mjs`（新）、`scripts/__tests__/nextConfigFor.test.js`（新）、`package.json`（`ios:build`）、`src/lib/__tests__/apiRoutes.test.js` の import パス、`.gitignore`（`/out/` 済みを確認）。
- テスト: `nextConfigFor({KIRI_BUILD_TARGET:'ios'})` が `output:'export'`・`trailingSlash:true`・`pageExtensions:['js','jsx']`、未設定なら `['api.js','js','jsx']` と `output` 無し。
- 検証: `npm run build`（ルート表に `/api/analyze` `/api/chat` が ƒ で残る）；`npm run ios:build -- --dev` で `out/index.html`・`out/privacy/index.html`、`grep -rl upstash out/_next` が空、`grep -o 'localhost:3000' out/_next/static/chunks/*.js | head -1` で API ベースが埋まっている；`npm run cf:build && npm run preview` で 400/403 不変；`npm test`。
- ∥ T1, T2 と並行可。

### T5 [Sonnet] 同意画面（レーン A）
- 触る: `src/lib/consent.js`（新）、`src/lib/__tests__/consent.test.js`（新）、`src/components/ConsentModal.jsx`（新。既存 `InfoPopup` の見た目に合わせる・Lucide のみ）、`SpiritualDiary.jsx`（「読み解く」ハンドラの先頭でゲート、設定モーダルに撤回ボタン）、`src/app/privacy/page.js`（3節に「同意は設定から取り消せる」1文。文言は Q3）。
- テスト: 未同意→false、記録→true、`CONSENT_VERSION` 繰り上げで false、撤回で false。
- 検証: `npm test && npm run lint && npm run build`；Playwright で初回に出る・同意後は出ない・撤回後に再び出る。
- → T3 の後。

### T6 [Sonnet] チャット入口の整理（レーン A）
- 触る: `SpiritualDiary.jsx:1406-1431`（プレビューボタンを `NEXT_PUBLIC_KIRI_CHAT_PREVIEW` 条件に、カード文言 Q4）、`:1132-1143`（InfoPopup 文言）、`.env.example`。
- テスト: なし（描画条件のみ）。`npm run build` で未設定時にバンドルへ「開発プレビューでKiriに聞く」が含まれないことを `grep -rl '開発プレビュー' .next/static` で確認。
- 検証: Playwright 375px で結果画面にボタンが無い（未設定）／ある（設定時）。
- → T5 の後。

### T7 [Opus] Capacitor 導入（レーン C）
- 触る: `package.json`（Ruling 1 の固定版）、`capacitor.config.ts`（新: `appId: com.kugainc.kiri`、`appName: Kiri`、`webDir: 'out'`、`ios: { contentInset: 'never' }`、`plugins.SplashScreen`/`StatusBar` の値は Ruling 7・Q5）、`ios/`（`npx cap add ios`）、`.gitignore`。
- 事前: `npm run ios:build` 済みの `out/` が要る（T4 の後）。
- 検証: `npx cap sync ios` が成功；`npx cap open ios` → シミュレータで起動し基本情報画面が出る（この時点ではまだ localStorage 保存）；`git status` で `ios/App/App/public` が無視されている；`npm audit --omit=dev` 0件。
- ∥ T8 と並行可（T8 はネイティブ接続の JS 側のみ）。

### T8 [Opus] バックアップの iOS 対応（レーン A/C）
- 触る: `src/lib/backupShare.js`（新: `exportBackupNative({ json, fileName, deps })`、deps 注入でテスト可能に）、`src/lib/__tests__/backupShare.test.js`（新）、`SpiritualDiary.jsx:66-76`（ネイティブなら `backupShare`、Web は現行）。
- テスト: 書き込み→共有の順、共有後に削除、キャンセル時は `{shared:false}`。
- 検証: `npm test`；シミュレータで書き出し→"ファイル"に保存→読み込みの往復（§1-6）。
- → T6 の後（SpiritualDiary.jsx）。T7 と並行可。

### T9 [Sonnet] ネイティブ統合（Haptics・StatusBar・Splash・セーフエリア）（レーン A/C）
- 触る: `src/lib/native.js`（新: `haptic(kind)`・`hideSplash()`・`applyStatusBar()`。Web は no-op、ネイティブは動的 import）、`src/app/layout.js`（`export const viewport`）、`src/app/globals.css`（`env(safe-area-inset-*)`）、`SpiritualDiary.jsx`（復元完了後 `hideSplash()`、各操作に `haptic`）。
- テスト: `native.js` の分岐（非ネイティブで何も import しない）をモックで。
- 検証: `npm run build`（Web 不変）；Playwright 1280/375 でレイアウト不変；シミュレータでステータスバー非重なり・スプラッシュが復元後に消える。
- → T8 の後。

### T10 [Opus] Preferences 実装と一度きり移行（レーン C）
- 触る: `src/lib/storage.js`（ネイティブ分岐: 起動時読み込み・write-through・移行）、`src/lib/__tests__/storage.test.js`（Preferences モックで Ruling 5 の全ケース）。
- 検証: `npm test`；シミュレータで §1-2（終了→再起動で保持）；移行テスト: T7 時点のビルド（localStorage 保存）で記録を作ってから T10 ビルドを上書きインストールし、記録が残り `migrated` 印が付くこと。
- → T9 の後（SpiritualDiary 側の `getStorage` 置換が済んでいること）。

### T11 [Sonnet] 1端末あたりの日次上限（Q2 で採用時）（レーン B）
- 触る: `src/lib/apiGuard.js`（`createClientDailyQuota`）、`src/app/api/analyze/route.api.js`、`src/lib/__tests__/apiGuard.test.js`、`.env.example`、`wrangler.jsonc` の `vars`（`DAILY_LIMIT_ANALYZE` 新値・`DAILY_LIMIT_ANALYZE_PER_CLIENT`）。
- テスト: 同一IPで N+1 回目が `daily_limit`、別IPは通る、全体上限より先に効く順序。
- 検証: `npm test`；`npm run cf:build`。
- → T2 の後。他レーンと並行可。

### T12 [Sonnet] ドキュメント
- 触る: `DECISIONS.md`（D-20 iOS 書き出し方式、D-21 CORS、D-22 ネイティブ保存と移行、D-23 同意画面、D-24 上限方針）、`HANDOVER.md`（Phase 2 の現在地・コマンド `ios:build`/`cap sync`/`cap open`・シミュレータ/実機の手順と落とし穴）、`docs/PROJECT_STATUS.md`、`src/app/privacy/page.js` 2節（「ブラウザのlocalStorage」→「端末内（iOSアプリではアプリ内の保存領域で、iCloudバックアップの対象）」。文言は Q3）、`README.md`。
- 検証: `npm run build`、`npm run lint`。
- → T11 の後（内容確定後）。

### T13 [Opus] 検収（シミュレータ→実機）
- §1 の完了条件を順に。Playwright/simctl のスクリーンショットを scratchpad に保存し、結果を HANDOVER へ。実機の読み解きは本番クォータを使うので 1〜2回に留める。
- 落とし穴: シミュレータの `capacitor://` からの fetch が失敗する報告（iOS 18.4）→ 実機で再確認；Next の RSC ナビ（`/privacy/index.txt`）が静的配信で落ちたら `Link` を `<a href>` に。

---

## 4. オーナーにしか決められないこと（最大5）

1. **Bundle ID とアプリ表示名** — 推奨: `com.kugainc.kiri` ／ 表示名「Kiri」。（後から変えられないのは Bundle ID だけ。App Store 名は Phase 4 でよい）
2. **読み解きの予算と上限** — 推奨: まず実費を1週間計測してから、Kiri ワークスペース上限を $20→$50/月に上げ、`DAILY_LIMIT_ANALYZE` を予算逆算値（実費 $0.05 なら約33/日）、`DAILY_LIMIT_ANALYZE_PER_CLIENT=5` を同時導入。予算を上げないなら per-client だけ入れて全体は 30 のまま（配布後に枯れる前提で TestFlight 段階に限る）。
3. **同意画面の文言と、Web にも出すか** — 推奨: Ruling 10 の草案で、Web にも出す（同じ送信をしている以上、説明は同じであるべき。プライバシーポリシー2・3節の文言変更も同時承認）。
4. **本番のプレミアムカードの文言（チャット未提供期間）** — 推奨: 見出し「Kiriとの対話（準備中）」、本文「今日の読み解きは無料です。Kiriとの続きの対話は、アプリ内の有料オプションとして準備しています。」、詳細ポップアップから開発者向け文（StoreKit/RevenueCat）を削除。
5. **スプラッシュとステータスバーの見た目** — 選択肢: (a) 夜色 `#171522` の無地（最短・静か）(b) 夜色＋中央に `kiri.png`（ブランド感。512px 画像を 2x/3x に用意）(c) 「霧の谷の光」風のグラデーション画像（世界観は最も近いが素材制作が要る）。推奨は (a) で出し、Phase 4 の素材作りで (b)/(c) を再検討。ステータスバーは明るい文字（`Dark` style）一択。

---

## 5. オーナー決定（2026-10-09 ひとみうさ回答）

- Q1: Bundle ID `com.kugainc.kiri`／ホーム画面の表示名「Kiri」／App Store は名前「Kiri」＋サブタイトル欄「Mind & Energy Note」（登録は Phase 4）。
- Q2: **今回は上限・予算に触らない** → T11 はやらない。`DAILY_LIMIT_ANALYZE=30` のまま（配布前に再検討。HANDOVER に残す）。
- Q3: 同意画面は Ruling 10 の草案どおり、**Web にも出す**。プライバシーポリシー2・3節の文言変更も承認。
- Q4: **プレミアムカードごと隠す**（課金開始まで、チャットのことは画面に出さない。Web・アプリとも）。`NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1` のビルドでだけ現行カード＋プレビューボタンを出す。
- Q5: スプラッシュは **「霧の谷の光」風のグラデーション**。CLAUDE.md の流儀どおり、T9 の前に比較HTML（2〜3案）を出して合意してから素材化する。ステータスバーは明るい文字。

## 6. 実装レーン（司令官の修正）

- T1 は `SpiritualDiary.jsx`／`KiriChatPanel.jsx` の fetch を触るのでレーン A（T1→T3→T5→T6）。
- レーン B は T2（CORS）→T4（書き出しビルド・route.api.js への改名）を同じエージェントで逐次。
- A と B は別 worktree で並行し、司令官が `agent/ios-shell` に統合する。
- Q5 確定（2026-10-09）: スプラッシュは **A 静かな霧**（scratchpad/splash/splash_A.svg を 2732×2732 PNG 化して使う）。

## 7. 持ち越し台帳（統合時に処理）
- L-1: 未設定の NEXT_PUBLIC_KIRI_CHAT_PREVIEW が静的置換されず、プレビュー文言がバンドルに残る → next.config の env で '0' 既定にする（統合後）。
- L-2: T10 で Preferences 永続対象に `spiritual-diary.consent.v1` を必ず含める（無いとiOS起動毎に同意が再表示）。
- L-3: consent テストは先に失敗させていない（TDD逸脱）→ 監査で確認。
- L-1 解消（next.config env で '0' 埋め込み）。L-4: /terms・/support の「開発プレビュー」文言とチャットパネル内文言は Phase 3 で改稿。
- 監査A/B（audit-AB.md）: P0なし・P1×2・P2×10。直し便に P1-1,P1-2,P2-1,2,3,4,7,10。持ち越し: P2-5（SSRメモリshimのキャッシュ→T10で注意）、P2-6、P2-8（iOS向け削除文言→T12）、P2-9（ポリシー2節はT10前提）。
- workerd実測（監査者・本番資格情報なし）でroute.api.js＋pageExtensionsがOpenNextで動くことを確認 → Ruling 2 の「merge前workerd確認」は済。
- T7 `6210c58`（ios-shell-c）: 足場OK・シミュ起動は未（Xcode 26.3 は iOS 26.2 プラットフォーム必須、入っているのは 26.1 ランタイムのみ）。追加: typescript 5.9.3（cap config.ts 読込に必要）。
- L-5: dev全体の audit で uuid<11.1.1（@capacitor/cli→xcode）moderate。ビルド道具のみ・CLI据え置き。
- L-6: `ios:sync -- --dev` は効かない→ `npm run ios:build -- --dev && npx cap sync ios`（T12で記載、またはスクリプト修正）。
- L-7: Info.plist の UIRequiredDeviceCapabilities=armv7 → Phase 4 アップロード時に arm64 へ。
- L-8: dev で capacitor:// → http://localhost:3000 が ATS で止まるか未確認。
