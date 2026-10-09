# 監査 A/B — `git diff 5330a55..HEAD`（agent/ios-shell-a = befd698）

読むだけの監査。ファイルの変更・コミット・デプロイはしていない。実 API も呼んでいない。

## 実行・確認したこと
- `npm test`: 23ファイル・234件すべて PASS。`npm run lint`: 指摘なし。
- **workerd 実測**（worktree を scratch に複製し `.env*`/`.dev.vars` なしで `npm run cf:build` → `opennextjs-cloudflare preview :8791`。Upstash も Claude も繋がない状態。複製は削除済み）:
  - Next のルート表に `ƒ /api/analyze`・`ƒ /api/chat` が残る。OpenNext のビルドも完了 → **`route.api.js`＋`pageExtensions` は OpenNext 1.20.7 / Next 16.4 で動く**。
  - `OPTIONS` に `Origin: capacitor://localhost` → 204＋`Allow-Origin` echo・`Allow-Methods: POST, OPTIONS`・`Allow-Headers: Content-Type`・`Max-Age: 86400`・`Vary: …,Origin`（analyze・chat とも）
  - `OPTIONS` に `Origin: https://evil.example` → 204・CORS ヘッダなし
  - `POST`（capacitor origin）→ 503 `Service unavailable`（readiness は維持）＋`Allow-Origin`・`Expose-Headers: Retry-After`・`Vary` に Origin
  - `POST`（同一オリジン）→ 503・CORS ヘッダなし（Web の挙動は変わらない）
- 既存の `out/`（`--dev` で作ったもの）: API ルートなし。`localhost:3000` が埋め込まれている。`.next/app-path-routes-manifest.json` に api なし。

## 結論
本番 Web（kiri.kugainc.com）の挙動を壊す変更（P0）は**見つからなかった**。Workers Builds に `KIRI_BUILD_TARGET` が無い場合は Web 既定に倒れるので安全（危ないのは逆に「置いた」場合で、これはコメントと設計書に明記済み）。本番では `KIRI_DEPLOY_ENV=production`（wrangler.jsonc の vars）があるため `KIRI_EXTRA_ALLOWED_ORIGINS` は無視される。`*`・`Allow-Credentials` は使っていない。

---

## P1

### P1-1 同意を断ると、危機の書き込みでも相談窓口カードが出ない（D-15 の後退）
- 場所: `src/components/SpiritualDiary.jsx:198-203`（`requestAnalyze`）、`src/components/ConsentModal.jsx`（`onDecline`）
- 状況: 危機の検出はサーバー側（`/api/analyze` の応答の `support`）で、窓口カードは結果画面（`:1208`）にしか出ない。同意ゲートはその前で止める。
- 失敗の筋道: 初めての利用者が「死にたい」系の出来事を書く → 「読み解く」→ 同意モーダル → 「今はやめる」（または背景タップ・×）→ 入力画面に戻るだけで、窓口カードは**どこにも出ない**。この変更の前は、必ずカードが出ていた。D-15 は「つらい気持ちで書いた人を突き放さない」を公開の前提にしている（D-07）。
- 直し方: `kiriSafety.js` の `detectCrisis` は外部依存のない純関数なので、クライアントで import できる。`requestAnalyze` で同意が無いとき `detectCrisis(entry.event, entry.intuition…)` を見て、当たればモーダル内（または入力画面）に `<SupportCard />` を出す。送信は一切しないので 5.1.2(i) とも矛盾しない。

### P1-2 `.env.local` に `NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1` があると、iOS 本番ビルド（と手元からの `npm run deploy`）にプレミアムカードとチャット入口が入る
- 場所: `scripts/build-ios.mjs:42-46`（`env: { ...process.env, … }`）、`scripts/lib/nextConfigFor.mjs:25`、`.env.example:10-11`
- 状況: `next build` は `next.config` を評価する前に `.env*` を読み込む。`nextConfigFor` はそれを見て `'1'` を埋め込む。`.env.example` は開発でチャットを試すとき `.env.local` に `NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1` を書くよう案内している（Ruling 8 の代償の欄もそう書いている）。
- 失敗の筋道: オーナーが案内どおり `.env.local` に書く → 後日 `npm run ios:build`（本番 API 向け）→ TestFlight／審査用の `out/` にプレミアムカードと「開発プレビューでKiriに聞く」が出る。押すとサーバーは 403（`KIRI_CHAT_PREVIEW` 未設定）で「準備中」。Q4 違反で、Ruling 8 が避けたかった「動かない機能」を審査に見せることになる。`build-ios.mjs` の検査（禁止マーカー・秘密の値）では `NEXT_PUBLIC_*` を対象外にしているので止まらない。Web も、手元から `npm run deploy` すれば同じことが起きる（Workers Builds は `.env.local` を持たないので通常の経路は安全）。
- 直し方: `build-ios.mjs` で `--dev` でないときは `NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0"` をプロセス環境として**強制**する（`.env.local` よりプロセス環境が優先されるため、これで効く）。`--dev` でもプレビューを使いたければ、`--chat-preview` のような明示フラグがあるときだけ `'1'` にする。あわせて、本番向けでも書き出しに「開発プレビューでKiriに聞く」が含まれていたら fail にする検査を足す（`FORBIDDEN_MARKERS` とは別の「本番ビルド専用」リストで）。

---

## P2

### P2-1 プライバシーポリシーの「この送信は…同意をいただいた場合にだけ行います」がチャットには当てはまらない
- 場所: `src/app/privacy/page.js:50-53`（直前の段落は「占いの読み解きとチャットの応答を生成するとき…」）、`src/components/KiriChatPanel.jsx:34-50`
- 状況: チャットの送信は同意を確認していない。本番はサーバーの 403 と入口の非表示で二重に止まっているので、**本番の文面としては今は正しい**。ただし `NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1`＋`KIRI_CHAT_PREVIEW=1` の環境（P1-2 の事故を含む）では、同意なしで送れる。
- 直し方: `KiriChatPanel` の `send` の先頭で `hasConsent(getStorage())` を確認し、無ければ同じ `ConsentModal` を出す（設計書の「チャットは Phase 3 で同じ同意を再利用」を先取り、数行で済む）。最低でも台帳（§7）に「Phase 3 でチャットに同意ゲート」を明記する。ついでに「初めて『読み解く』を押すとき」は、撤回後にも出るので「同意がまだない状態で『読み解く』を押すと」の方が正確。

### P2-2 同意モーダルの「プライバシーポリシーを読む」で、書きかけの記録が消える
- 場所: `src/components/ConsentModal.jsx:37`
- 失敗の筋道: 出来事を長めに書く → 読み解く → モーダルでポリシーを読む → `/privacy` へ SPA 遷移して `SpiritualDiary` がアンマウント → 戻ると `entry` は空（下書き保存の仕組みはない）。初回利用者が一番丁寧に確かめようとした瞬間に入力が消える。
- 直し方: ポリシーはモーダル内で読める短い抜粋にするか、遷移前に `entry` を sessionStorage 等へ退避して戻ったら復元する。`target="_blank"` は Capacitor の WKWebView では外部ブラウザ扱いになり得るので、iOS を考えると前者が無難。

### P2-3 `ios:build` の検査に落ちても `out/` が残る
- 場所: `scripts/build-ios.mjs:48-55`
- 失敗の筋道: 検査で問題が出て「out/ を使わないでください」と表示されるが、`out/` はそのまま。後の T7 で `npx cap sync` を流すと、そのまま `ios/` に取り込まれる。
- 直し方: `fail()` の前（必須ページ欠落・禁止内容検出の両方）で `rmSync(outDir, { recursive: true, force: true })`。

### P2-4 `secretValuesFromDotenv` が行末コメント付きの値を拾えない
- 場所: `scripts/lib/iosBuild.mjs:66-73`
- 状況: `CLAUDE_API_KEY=sk-ant-... # 本番` のように書くと、値が「sk-ant-... # 本番」になり、書き出しの照合に当たらなくなる。マーカー検査（変数名）は残るので、穴は小さい。シェルで export した秘密も照合の対象外。
- 直し方: クォートなしの値は ` #` 以降を落とす（dotenv と同じ扱い）。必要なら `process.env` のうち既知の秘密名（`CLAUDE_API_KEY` 等）の値も照合に加える。

### P2-5 SSR で `getStorage()` を呼ぶと、メモリの保存先がモジュール単位でキャッシュされる（将来の地雷）
- 場所: `src/lib/storage.js:41-44`、テスト `src/lib/__tests__/storage.test.js` の「server render」
- 状況: 今は描画中に `getStorage()` を呼ぶ箇所がない（effect とハンドラだけ）ので実害はない。ただし、もし誰かが描画中に呼ぶと、サーバー（Worker の isolate）でリクエストをまたいで共有されるメモリの保存先が `resolved` に固定される。テストはこの挙動を「正しい」として固定している。T10 では「init 前の `getStorage()` で localStorage に書く → init 後は Preferences に切り替わり、その書き込みが見えない」という読み書きのずれも起き得る。
- 直し方: `typeof window === "undefined"` のときはキャッシュせず、毎回新しい空のメモリを返す（または例外にする）。T10 では init 前の `setItem` を禁止（開発時に警告）にする。

### P2-6 localStorage が使えない環境で、保存されないことを黙って続ける
- 場所: `src/lib/storage.js:21-28`
- 状況: 以前は例外で落ちていた（読み解きのキャッシュだけ try/catch）。今は黙ってメモリに保存し、リロードで履歴・プロフィールが消える。データ消失の新しい経路ではない（もともと保存できない環境）が、利用者は保存されたと思う。
- 直し方: メモリにフォールバックしたことを `isPersistent()` 等で返し、設定モーダルの「記録はこの端末内にのみ保存されます」の所に「この環境では保存できません」と出す。急ぎではない。

### P2-7 開発者向けの文言が本番のバンドルに残る（到達不能）
- 場所: `src/components/SpiritualDiary.jsx:1186` 付近の `InfoPopup`（「Kiriとの対話（プレミアム）」・StoreKit の文）、`KiriChatPanel`（「開発プレビュー：購入・購読状態の確認は…」）
- 状況: `out/_next/static/chunks/0g3ausvj-b5yf.js` に `開発プレビュー`・`StoreKit` が残っている。入口（カード）は消えたので画面には出ない。T6 の検証項目「`grep -rl '開発プレビュー' .next/static` が空」はこのままだと満たせない（`KiriChatPanel` と `InfoPopup` が `CHAT_PREVIEW_ENABLED` の外で描画されているため）。L-4 で Phase 3 に回す扱いなら、台帳の「L-1 解消」と T6 の完了条件の書き方を合わせる。
- 直し方: `{CHAT_PREVIEW_ENABLED && showChat && <KiriChatPanel …/>}`、`{CHAT_PREVIEW_ENABLED && <InfoPopup …/>}` のように描画側も定数で囲めば、両方バンドルから消える。

### P2-8 （報告のみ）「すべて削除」は同意を消さない
- 場所: `src/components/SpiritualDiary.jsx:682-690`
- 判断: 消さない今の挙動で良いと考える。同意は「記録」ではなく端末の設定で、取り消しは設定に専用ボタンがある（Ruling 10）。プライバシーポリシー4節も記録の削除しか約束していない。ただし4節の「ブラウザのサイトデータを削除すると…」は iOS アプリでは当てはまらない（アプリの削除が相当）ので、T12 のドキュメントで iOS 向けの一文を足す。

### P2-9 （軽微）プライバシーポリシー2節の iOS の記述は T10 前提
- 場所: `src/app/privacy/page.js:33`
- 状況: 「iOSアプリではアプリ内の保存領域…バックアップ（iCloudなど）の対象」は T10（Preferences）が入って初めて正確になる。今の iOS ビルドは WKWebView の localStorage。iOS 版の配布は T10 の後なので、公開順を守れば問題ない。T10 を外すことになったら、この文も戻す。

### P2-10 （軽微）テストの書き方
- `src/lib/__tests__/apiRoutes.test.js` の 429 テストは「11回」と固定値で、レート制限の既定値（10/分）に暗黙に依存している。定数を import するか `RATE_LIMIT_ANALYZE_PER_MIN` を stub して回数を決める。
- `consent.test.js` の「バックアップに含めない」は `buildBackup` の JSON に `"consent"` が無いことだけを見ている。`parseBackup`／`applyBackup` 側（同意キーを含む細工ファイルを取り込んでも同意が立たない）も1件あると、取り込み経路まで守れる（今の実装はホワイトリストなので安全）。
- L-3（同意テストを先に失敗させたか）はコミット履歴からは確かめられない。テスト自体は実装なしでは通らない中身で、形だけのテストではない。

---

## 確認して問題なしとしたもの
- **同意なしで analyze が送られる経路**: `analyze()` の呼び出しは `requestAnalyze` と `acceptConsent` の2箇所だけ。form の submit・Enter キー・再試行ボタンはない。端末キャッシュの経路も同意の後ろにある。同意の判定はクリックの瞬間に保存先を読むので、別タブでの撤回も反映される。
- **同意とバックアップ**: `buildBackup`／`parseBackup` は profile・history・chat のホワイトリストで、同意キーは書き出しにも取り込みにも乗らない。
- **文言**: モーダルの見出し・本文・3項目・ボタン3つは Ruling 10 の草案と一致（「経由して Anthropic社のAI（Claude） に」の前後に半角スペースが入るのは JSX の都合で、気になれば `{' '}` を外すだけ）。
- **復元前の上書き（profile を空で保存する過去の不具合）**: `profileHydrated` は `await initStorage()` の後、復元値の set と同じ非同期コールバックの中で立つ（React 18 の自動バッチ）。保存 effect は復元値で1回だけ走る。`KiriChatPanel` も `hydrated` を復元後に立てるので、空配列での上書きはない。
- **CORS**: 完全一致・echo・`Vary` の追記（既存の Vary を壊さない）・`null`/`*` を追加オリジンから除外・本番では追加オリジンを無視。OPTIONS はレート制限・クォータを消費しない（テストで `storeCalls` が空）。不許可の OPTIONS に `Vary: Origin` が付かないのは仕様どおり（Cloudflare は OPTIONS をキャッシュしない）。
- **T6**: `CHAT_PREVIEW_ENABLED` で囲んだのはプレミアムカード（とその中の2ボタン）だけ。他の要素は消えていない。未設定時は `'0'` が埋め込まれ、カードの文言（「プレミアム版」「開発プレビューでKiriに聞く」ボタン）はバンドルから消えている。
- **ios:build**: ビルド前に `out/` を消す。API ベースはオリジンだけを受け付ける（パス付き・末尾 `/`・ftp を拒否）。`.env.ios` は作らない（D-19）。
