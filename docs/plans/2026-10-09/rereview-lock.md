# 再監査: アプリのロック 直し便（agent/ios-lock, 108f3a9..HEAD = 733bf09〜bf2ec99）

読み取りのみ。`npm test` = 37 files / 484 tests PASS、`npm run lint` = エラー 0。worktree は無変更（git status クリーン）。

## 本番 Web デプロイ（postinstall）の模擬 — 結論: 今の状態では壊れない
scratchpad/reviewcopy に複製（node_modules・.next・out・ios/App/App/public・.env* を除外）して実行。終了後に削除済み。
- `npm ci` → postinstall が走り「差し替えました」→ exit 0。続けて `npm run cf:build` → exit 0。ルート表に `ƒ /api/analyze`・`ƒ /api/chat` あり、`.open-next/worker.js` 生成。
- `npm ci --omit=dev` → privacy-screen は dependencies なので存在し、postinstall 成功・exit 0。
- `npm ci --ignore-scripts` → exit 0、ファイルは上流のまま（sha 4d778c…）。Web には無関係。iOS は `ios:build` が当て直す。`npm test` の「carries the Kiri patch」が落ちるので未適用には気づける。
- 2 回目の実行 → 「差し替え済み」exit 0（冪等）。
- 中身を 1 行変える → exit 1。版を 2.0.2 にする → exit 1。**このとき npm ci が失敗し、Cloudflare のビルドが止まる**（公開中の版は残るので、サイトが落ちるわけではない）。

## 各指摘の確認
- P1-1 直った。認証中の hide も hiddenAt を記録し、interrupted で「背景をはさんだ成功」ではロックを外さない。show で判定。controller は割り込まれた再認証を続けない（0.7 秒待った後に interrupted/locked も再確認）。目隠しは認証中も付けたまま（回避策撤去）。
- P1-2 直った（「すぐに」は hide 時点で locked＋flushSync。補足の遅延 pause は 5 秒心拍で安全側に倒す）。描き終わりの保証は無い点は D-25・T-L9 に記載済み。
- P1-3 直った。読み込み失敗と UNIMPLEMENTED/UNAVAILABLE を pluginUnavailable に分けてフェイルオープン、ロック中に checkLockAvailability が available:false でもフェイルオープン。
- P2-1 文書化で対応（D-25 残るリスク・HANDOVER T-L9）。加えて、割り込まれた再認証からは共有シートを出さなくなった。
- P2-2 直った。差し替え Swift は UIKit・状態をすべて main、覆いはウィンドウ上の素のビュー（提示を使わない）。
- P2-3 直った。2 つ目のボタンを撤去し注記に。注記の正しさは実機確認待ち（T-L9 #2 に記載済み）。
- P2-4 直った。pbxproj 4 か所すべて 15.5、テストで固定。CapApp-SPM/Package.swift は `.iOS(.v15)` のまま（Capacitor CLI 管理・「DO NOT MODIFY」。パッケージの下限がアプリより低いのは問題ない）。Info.plist 等に他の指定なし。
- P2-5 直った（lockNative のときだけ max-h-full overflow-y-auto）。
- P2-6 直った（lockBoot / lockController / appState 心拍 / ページ文言 / appLock 261 行目の書き換え）。
- P2-7 直った（起動時に認証方法を先に調べる・未確認は「端末の認証でひらく」・failOpenSeq で帯が再表示）。

## 新しい指摘
### P2-A postinstall の失敗が本番 Web のビルドを止める（iOS 専用パッチと Web デプロイの結合）
- 場所: `package.json:17`（postinstall）、`scripts/patch-privacy-screen.mjs:24-31`（process.exit(1)）、`:16`（package.json が無いと readFileSync で例外→非 0）。
- 起き方: 誰かが（Dependabot 含む）@capacitor/privacy-screen を上げる、または依存から外す → Cloudflare Workers Builds の `npm ci` が postinstall で失敗 → kiri.kugainc.com のデプロイが止まる（Web は privacy-screen を一切使わないのに）。今は exact pin＋lockfile なので起きない。
- 直し方: 厳しさを分ける。`patch-privacy-screen.mjs --strict` のときだけ exit 1、postinstall（引数なし）は console.warn して exit 0（package.json/ファイルが無い例外も catch）。`build-ios.mjs` は `--strict` を渡す（既に status を見て fail しているのでそのまま効く）。`patchPrivacyScreen.test.js` の「carries the Kiri patch」がローカルの未適用を拾うので、警告にしても iOS 側の安全は保てる。

### P2-B 起動時の prepareLockBoot が try の外
- 場所: `src/components/SpiritualDiary.jsx:242-247`。
- 起き方: 今の実装では例外は出ない（loadLockSettings も race も catch 済み）が、将来 getStorage() 等が投げると async IIFE が reject → commitBoot も hideSplash も呼ばれず、3 秒の保険でスプラッシュだけ消えて step='boot' の空画面のまま。
- 直し方: 下の try の中へ入れる（catch 側で hideSplash 済み）か、`.catch(() => null)` を付ける。

### P2-C スプラッシュがロックオン時に最大 1.5 秒延びる
- 1.5 秒の上限＋initStorage が 3 秒（SPLASH_FALLBACK_MS）を超えると、保険で先に隠れて空の地が一瞬出る（記録は出ない。情報漏れなし）。checkBiometry は通常数 ms なので実害は小さい。実機で起動時間だけ見ておく。

### P2-D 心拍の小さな穴（安全側）
- `src/lib/appState.js:45-57`。遅延 pause が resume の後に処理される順序逆転があると、hiddenAt が次の show まで残り、次の短いアプリ切り替えでロックされる（早めのロック側なので害は小さい）。pause/resume の順序は通常守られるので記録のみ。

### 確認して問題なしとしたもの
- 心拍タイマー: ネイティブかつロックオンの間だけ、unsubscribe で clearInterval。effect の依存（lockController は useState で固定）で張り直しは起きない。
- lockController: watch のネスト（confirmWithLock→runLockAuth）で interrupted は外側の開始時にだけリセット。toggleLock のオン側はロックオフなので hide 購読が無く影響なし。
- lockBoot: boot と availability を同じ同期処理で dispatch、setStep より前。タイムアウト時は availability effect が後で調べ直す。Web は lockPlan=null で何もしない。
- 自動認証: visible で制御。背景に回ると effect の cleanup で 0.4 秒タイマーが消える。前景に戻るたびに 1 回だけ。
- 差し替え Swift: 非アクティブ中の enable は即座に覆う、didBecomeActive で外す。applicationState の更新と通知は同じ runloop 内なので enable の main ブロックと競合しない。
