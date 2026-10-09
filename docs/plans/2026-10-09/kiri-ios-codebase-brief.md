# Kiri iOS(Capacitor)化 コードベース調査ブリーフ
対象: /Users/usausagi/Documents/AI_Playground/spiritual-diary (相対パスは src/ 起点でなければリポ直下)

## 1. `output: 'export'` 可否
結論: **ほぼ可能。ブロッカーは API ルート2本のみ**(別建てが必要)。UIは実質クライアント+静的ページ。
- ブロッカー: `src/app/api/analyze/route.js:447` と `src/app/api/chat/route.js:63` の `POST` route handler。export 不可。iOS用ビルドでは除外(ビルド時に `src/app/api` を退避/ビルド専用スクリプトで除く、または別 config)。
- `next.config.mjs` は `images.unoptimized: true`、`agentRules:false` のみ(output 未指定)。export 用に `output:'export'` を環境変数で切替える形が安全(Cloudflare用ビルドを壊さない)。
- `next/image`: `components/SpiritualDiary.jsx:3,743` で `/kiri.png` 1枚のみ。`unoptimized:true` 済みなので export OK(`public/kiri.png`)。
- `next/font/google`: `app/layout.js:1-18`(Shippori_Mincho, Zen_Kaku_Gothic_New、`preload:false`)。ビルド時に Google Fonts を取得して自己ホスト化するので export でも動くが**ビルド時ネット接続が要る**。出力は `_next/static/media` に同梱され実行時はオフライン可。
- metadata: `app/layout.js:20-23` 静的 `metadata` のみ。export OK。
- 動的ルート/ミドルウェア/rewrites/headers(): なし(`middleware.*` `proxy.*` なし、next.config に headers/redirects なし)。ページは `app/page.js`(SpiritualDiary を描画のみ)、`app/{privacy,terms,support}/page.js`(静的な server component、動的API不使用)。
- `<Link href="/privacy">` 等: `SpiritualDiary.jsx:849-851`、`DocPage.jsx:8`(ホームへ戻る `/`)。export なら `/privacy.html` 相当になるため `trailingSlash:true` 推奨(Capacitorの静的配信でのルーティング対策)。
- `public/_headers`(Cloudflare Assets用)は export 出力にも含まれるが iOS では無害。
- 注意: `lunar-javascript`(`lib/saju.js`)、`lucide-react` は純クライアント可。`sharp`/`@upstash/redis` は API 側のみ(クライアントバンドルに入らない。要ビルド後確認)。
- 注意: ページ側 `'use client'` は `SpiritualDiary.jsx:1`、`KiriChatPanel.jsx:1` のみ。それ以外 server component だが動的APIなし。

## 2. /api/* 呼び出し箇所と API 側の挙動
クライアント fetch(**すべて相対URL**、他に fetch なし):
- `components/SpiritualDiary.jsx:204` `fetch('/api/analyze', {POST, Content-Type: application/json})`
- `components/KiriChatPanel.jsx:32` `fetch('/api/chat', {POST, Content-Type: application/json})`
- 絶対URL化: `NEXT_PUBLIC_API_BASE`(例 `https://kiri.kugainc.com`)を使う小さな `apiUrl(path)` ヘルパを `src/lib/` に新設し、上記2箇所だけ差し替えれば足りる。Web/Cloudflare ビルドでは空文字=相対のまま。
- 注意: `Content-Type: application/json` は CORS 的に **preflight(OPTIONS)が発生**する。

サーバー側 CORS / Origin:
- **CORS・Origin処理は一切なし**。route に `OPTIONS` ハンドラも `Access-Control-*` ヘッダもなし(grep済)。Origin/Referer 検証もなし。→ Capacitor の WebView(`capacitor://localhost`、`ionic` 設定次第で `https://localhost`)からの fetch は**そのままでは CORS で失敗**。
  - 対策案: (a) 両 route に `OPTIONS` + `Access-Control-Allow-Origin` 許可リスト(capacitor://localhost, https://localhost, http://localhost)/`Allow-Headers: Content-Type`/(将来)Authorization を追加、レスポンスにも付与(429 の `Retry-After` は `Access-Control-Expose-Headers`)。(b) Capacitor の `CapacitorHttp` プラグイン(`plugins.CapacitorHttp.enabled`)でネイティブ経由にし CORS 回避。(a) が単純で堅い。
  - Cloudflare Workers の route は共有なので、CORS 追加は本番影響あり(許可リスト厳格に)。
- apiGuard (`lib/apiGuard.js`): IP別レート制限(`createRateLimiter` :14〜)と JST日次クォータ(`createDailyQuota` :34〜)、Redisキー `kiri:rl:*`/`kiri:q:*`。クライアントIP: `clientKeyFromHeaders` :64-75(非Vercelは `cf-connecting-ip` 優先)。**iOSアプリ経由でも IP は CF が付けるので同様に機能**。
  - DAILY_LIMIT_ANALYZE=30 は **全ユーザー合算のグローバル日次** (`wrangler.jsonc` vars)。アプリ配布でユーザー数が増えると枯渇しやすい(要見直し候補)。
- readiness (`lib/kiriStore.js:67-73`): `KIRI_DEPLOY_ENV` か `VERCEL_ENV` が production/preview のとき Redis設定+`KIRI_STORE_SECRET`(32文字以上)が欠ければ **503** (`analyze/route.js:449-452`, `chat/route.js:65-68`)。wrangler.jsonc で `KIRI_DEPLOY_ENV:"production"` 固定。ローカル/テストは未設定なら ready。
- 応答コード: 429(`code:rate_limited`, `Retry-After`)、503 `Service unavailable`、チャット403 `code:chat_disabled`。クライアントは `daily_limit` も処理(`KiriChatPanel.jsx:49-53`)。
- 秘密は `process.env.CLAUDE_API_KEY`(`analyze:481`, `chat:99`)のみサーバー側。クライアントに秘密なし(iOS同梱バンドルに入らない点OK)。

## 3. localStorage キー(D-09 第二段階用)
| キー | 所有モジュール | 定義行 |
|---|---|---|
| `spiritual-diary.history.v1` | `lib/history.js` | :1 (load :35, save :46/:52, clear :57) |
| `spiritual-diary.profile.v1` | `lib/history.js` | :2 (load :63, save :77) |
| `spiritual-diary.chat.v1` | `lib/chatHistory.js` | :1 (load :6, save :25, clear :30) |
| `kiri-analysis-cache-v1` | `lib/analysisCache.js` | :6 (read :54/:78, write :66, clear :105) |
- バックアップ対象は上3つ(`lib/backup.js:6-12,71`)。キャッシュは対象外(D-18)。スキーマ `BACKUP_APP_NAME="spiritual-diary"`、`BACKUP_SCHEMA_VERSION=1`(:14-15)。
- 設計: 全ライブラリ関数は `storage` を**引数で受け取る**(`storage?.getItem/setItem/removeItem`)ので差し替えやすいが、**全部同期API**。
- 同期読み前提の箇所(非同期 Preferences に替えるときの要改修):
  - `SpiritualDiary.jsx:121-132` マウント時 useEffect 内で `loadProfile`/`loadHistory` を同期呼び→`setStep(initialStepFor(...))`。`profileHydrated` ガード(:62-63, :134-138)があり、初期描画は空→復元の2段階なので **非同期化は比較的容易**(await に変えて hydrated を後で true)。ただし `initialStepFor` で画面遷移するため復元完了までスプラッシュ/ローディング表示が必要。
  - `SpiritualDiary.jsx:242` `setHistory(saveHistory(window.localStorage, record))`、:632/:634 `clearHistory`/`deleteHistoryItem` を `setHistory(...)` に同期戻り値で渡している → `await` 化が必要。:637 `clearCachedAnalyses`。
  - `SpiritualDiary.jsx:82-85` `applyBackup`/`loadHistory`/`loadProfile` が同期連続。
  - `SpiritualDiary.jsx:67` `buildBackup(window.localStorage)` 同期。
  - `SpiritualDiary.jsx:191-199` `loadCachedAnalysis(cacheStorage,...)`/`saveCachedAnalysis` 同期(try/catch で `window.localStorage` 取得失敗に備える)。
  - `KiriChatPanel.jsx:14-21` マウント時 `loadChatHistory`、messages 変更ごと `saveChatHistory`(毎回書き込み)、:67 `clearChatHistory`。
  - 描画中(render)に localStorage を直読みしている箇所は**なし**(すべて useEffect/イベントハンドラ内)。SSR対策済みで、これが移行の追い風。
- 推奨移行方針: 同期APIを保ったまま、起動時に Preferences→メモリ上のシム `Storage` に一括ロード、書き込みは write-through(非同期でPreferencesへ)する「同期シム」なら呼び出し側コード変更ほぼ不要(`window.localStorage` を `getStorage()` に置換するだけ)。初回起動時に旧 localStorage(WebView内)→Preferences の移行が必要。

## 4. チャットのゲート
- クライアント: `SpiritualDiary.jsx:1408-1432` プレミアムカード(Lock アイコン)。「詳細を見る」→`showPremiumInfo`(:59, :1132-1140「有料機能として準備中」)、**「開発プレビューでKiriに聞く」ボタン(:1426)が `setShowChat(true)` で直接 `KiriChatPanel` を開く**(:1008-1015)。クライアント側のゲート判定はなく、UIはボタン常時表示。サーバー403のときパネル内で「準備中」文言(`KiriChatPanel.jsx:44`)。
- サーバー: `chat/route.js:70-76` `checkChatEntitlement()` が allowed でなければ 403 `{code:"chat_disabled"}`。順序: storeReadiness(503)→entitlement(403)→rate limit(429)。
- スタブ `lib/entitlement.js:5-13`: 引数なし。`process.env.KIRI_CHAT_PREVIEW` が "1"/"true" なら `{allowed:true, mode:"preview", reason:"preview_enabled"}`、それ以外 `{allowed:false, reason:"preview_disabled"}`。**リクエスト(ヘッダ/ボディ)を一切受け取らない**ため、RevenueCat 連携には引数追加(`request` or 認証トークン/appUserID)と route 呼び出し(`chat/route.js:70`)の改修が必要。テスト `lib/__tests__/entitlement.test.js`。
- 現状 `wrangler.jsonc` vars に `KIRI_CHAT_PREVIEW` は無い=本番は常に403(D-14: Webは閉)。
- D-11: 会話ログ閲覧はチャットパネル内のみ=パネルをゲート内に置けば満たされる。

## 5. Web origin 前提・外部リンク
- 法務ページ: `/privacy`(`app/privacy/page.js`)、`/terms`、`/support`。フッターリンク `SpiritualDiary.jsx:849-851`。静的 server component。連絡先 `mailto:info@kugainc.com`(privacy:86, terms:75, support:64)。privacy:33 に「ブラウザのlocalStorageにのみ保存」の記述 → iOS版では「端末内(アプリ内ストレージ/iCloudバックアップ対象)」へ文言更新が要。App Store の Privacy Policy URL は `https://kiri.kugainc.com/privacy` を使える(Web側を残す前提)。
- `SupportCard.jsx:20` `tel:` リンク(相談窓口)。iOS WKWebView で `tel:` は動作(Capacitorはデフォルトで外部へ渡す)。ただし iPad/電話なし端末では無効。
- バックアップ書き出し: `SpiritualDiary.jsx:66-76` `Blob` + `URL.createObjectURL` + `<a download>` クリック。**WKWebView では `download` 属性が効かず無反応になる可能性大**。`@capacitor/filesystem`(cache書出)+`@capacitor/share` 等のシェアシート方式に置換が必要。
- インポート: `SpiritualDiary.jsx:531-536` `<input type="file" accept="application/json,.json" hidden>` + `file.text()`(:82)。WKWebView でも file input は「ファイル」アプリ選択が出るので概ね動く(要実機確認)。`applyBackup` は id ベースのマージ。
- `window.location` / `navigator.share` / `navigator.clipboard` / `document.cookie` 使用: **なし**(grep: window.* は localStorage のみ、document.* は :69 のみ)。
- 外部オリジン依存: Google Fonts(ビルド時に自己ホスト化済み)、画像は `/kiri.png`。外部CDN実行時依存なし。
- `analysisCache.js` は Web Crypto(`crypto.subtle`)でSHA-256。WKWebView では `capacitor://localhost` が secure context扱いなので動作する見込み(要実機確認、http origin だと subtle が undefined になる)。
- `new Date()` ローカル時刻で時間帯判定(`SpiritualDiary.jsx:226-227`)、キャッシュ/クォータは JST。端末TZ依存部の確認推奨。

## 6. テスト・scripts・触ってはいけない設定
- テスト: vitest 4(`vitest.config.mjs`、`environment:"node"`、alias `@`→`src`)。`npm test`=`vitest run`。テスト: `src/lib/__tests__/*.test.js`(15本、apiRoutes/apiGuard/entitlement/backup/history/chatHistory/analysisCache/kiriStore ほか)と `scripts/__tests__/{embeddedEnv,patchOpennext}.test.js`。UI(コンポーネント)テストなし。
- scripts: `dev`/`build`(next build)/`start`/`lint`/`test`、Cloudflare系 `cf:build`(`scripts/patch-opennext.mjs` → `opennextjs-cloudflare build`)、`cf:deploy`/`cf:upload`(`scripts/check-embedded-env.mjs` 検査必須)、`preview`/`deploy`/`upload`/`cf-typegen`。
- 触らない:
  - `wrangler.jsonc`: main=`.open-next/worker.js`、routes=`kiri.kugainc.com`(custom_domain)、`workers_dev:false`、vars(`KIRI_DEPLOY_ENV`/`DAILY_LIMIT_ANALYZE`)、`assets.directory=.open-next/assets`、observability(invocation_logs:false)、`WORKER_SELF_REFERENCE`。
  - `open-next.config.ts`(`defineCloudflareConfig({})`)。
  - D-19: `npx opennextjs-cloudflare deploy` / `wrangler deploy` を直接実行しない(秘密埋め込み検査をスキップするため)。OpenNext は build 時に `.env*` を Worker に埋め込む → **iOS用の `.env.production` 等に `NEXT_PUBLIC_API_BASE` 以外の秘密を置かない**、Capacitor 用 env は `.env.ios` 等の未読込名にするか、そもそも秘密を入れない。
  - `next.config.mjs` の `images.unoptimized`。`output:'export'` は環境変数ガード付きで追加し、既定(CF用)は無変更に。
  - `.next/` と `.open-next/` を iOS ビルドと混ぜない。export 出力は `out/`(Capacitor `webDir:"out"`)。`distDir` を分けるのが安全(例 `NEXT_DIST_DIR=.next-ios`)。
  - `scripts/patch-opennext.mjs` は Next 16.4 用の一時パッチ(上流修正で自然消滅)。
  - `vercel.json`(regions hnd1)は旧Vercel用で残存。
- 他: DECISIONS.md D-12「静的同梱かリモートURLかはiOS着手時に決める」→今回は静的同梱+絶対API。Apple 4.2(薄いWebView)対策として Preferences 移行・Haptics 等のネイティブ統合が D-12 に明記されている。
