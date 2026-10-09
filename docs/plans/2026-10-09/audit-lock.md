# 監査: アプリのロック（agent/ios-lock, fc49461..HEAD = 309e487〜108f3a9）

読み取りのみ。`npm test` = 33 files / 419 tests PASS、`npm run lint` = エラー 0。

## P0
- なし。起動時は `initStorage` 後の同じ非同期継続の中で `dispatchLock(boot)` と `setStep` が一括で反映され（React 19 の自動バッチ）、それまでは `step==='boot'` の空の地だけ。スプラッシュは `profileHydrated` の後の effect で隠れる。モーダル（設定・履歴・詳細・削除確認・同意）、SupportCard、ErrorBanner、通知はすべて `renderScreen()` の中にあり、inert のラッパーの内側に入る（createPortal は無い）。

## P1

### P1-1 再認証中に背景へ回ると、自動ロックが効かず、目隠しも外れたまま撮られる
- 場所: `src/lib/appLock.js:133-145`（`hide`/`show` が `authenticating` の間は無視）、`src/components/SpiritualDiary.jsx:121-130`（`runLockAuth` が認証の前に `setPrivacyScreen(false)`）、テスト `src/lib/__tests__/appLock.test.js:261` がこの穴を仕様として固定している。
- 起き方: ロックはオン・解除済み → 設定 → 「書き出す」（またはロックをオフ）→ Face ID の画面が出た状態でホームへ。`pause` は authenticating=true なので無視され `hiddenAt` が記録されない。OS は `systemCancel` を返し、JS は復帰後にそれを処理する。`resume` も、authenticating のままか `hiddenAt===null` のどちらかで素通り。**何時間たって戻ってもロックされない。** しかも目隠しは認証のために `disable()` 済みなので、切り替え画面のスナップショットには設定モーダル（その下に日記）がそのまま写る。
- 直し方: `pause`/`resume` は Face ID・パスコードの画面では発火しない（`resignActive` しか起きない）ので、authenticating の間も `hide` で `hiddenAt` を記録し、`show` でも判定する。`locked` でないときの `hide` は authenticating に関係なく記録する、に変える。あわせて `runLockAuth` の中で `hide` を受けたら、`finally` を待たずに目隠しを戻す（または `hide` の時点で `setPrivacyScreen(true)`）。テスト 261 行目を「認証中の hide も記録し、閾値を超えた show でロックする」に書き換える。

### P1-2 復帰したときに本文が一瞬見える（特に「すぐに」）
- 場所: `src/lib/appLock.js:133-145`、`SpiritualDiary.jsx:329-335`。
- 起き方: ロックするかどうかは `resume`（willEnterForeground）の JS で初めて決まる。WKWebView は背景に回る前の最後のフレーム（日記）を持ったまま復帰し、目隠しはプラグインが `didBecomeActive` で外す。JS → React の再描画 → WebView の描画が `didBecomeActive` より遅れると、日記が数十〜数百 ms 見える。「切り替え画面で記録を隠す」をオフにしている人は、目隠しも無いので確実に見える。HANDOVER の T-L9 にも未確認として残っている。
- 直し方: `autoLockMinutes===0` なら `hide`（pause）の時点で `locked=true` にする（背景に回る前に描画が間に合えば、スナップショットもロック画面になる）。1・5・15 分は実機で確かめ、見えるならロック画面の層だけを先に描く案（`hide` のたびに「仮のロック」をかけ、`show` でしきい値未満なら外す）を検討する。
- 補足（P2）: `pause` の JS が背景で止められて復帰時にまとめて届くと、`hide`/`show` の時刻がほぼ同じになり、1・5・15 分の判定が「ロックしない」に倒れる。実機で 5 分超の背景（ロックされるか）を確かめる。

### P1-3 プラグインが使えないと、自分の記録に二度と入れない（D-09）
- 場所: `src/lib/lockAuth.js:74-83`（読み込み失敗も含めて `unknown`）、`src/lib/appLock.js` の `describeAuthFailure`（`unknown`・`invalidContext` は `stay`）。
- 起き方: `cap sync` 漏れ・プラグインの登録失敗・将来の OS 更新などで `authenticate` が毎回 `unknown`/`invalidContext` になると、ロック画面から抜ける手段が無い（再インストールは Preferences ごと消える。iCloud から戻すとロック設定も一緒に戻る）。
- 直し方: ロック中に `checkLockAvailability()` が `available:false`（プラグイン読み込み失敗・端末のパスコード無し）を返したらフェイルオープンにする。または `lockAuth.js` で読み込み失敗を `unknown` から分けて（例: `pluginUnavailable`）、`action: "open"` に割り当てる。いまの `UNAVAILABLE` の判定をそのまま使える。

## P2

### P2-1 共有シートが開いたまま再ロックされると、ロック画面の上から書き出せる
- 場所: `SpiritualDiary.jsx:193`。
- 起き方: 認証してから共有シートを開く → ホームへ → 5 分後に戻る。ロック画面は WebView の中（z-90）、共有シートはネイティブなのでその上に残り、AirDrop・"ファイルに保存" で平文のバックアップを出せる。
- 直し方: `exportBackupNative` が終わるまで `hide` を受けたら、戻ったときに書き出しの結果を捨てる…だけでは足りない（シートは JS から閉じられない）。せめて HANDOVER の T-L9 に確認項目として足し、残るリスクとして D-25 に書く。

### P2-2 privacy-screen の `disable()` はメインスレッド外で UIKit を触る
- 場所: `node_modules/@capacitor/privacy-screen/ios/.../PrivacyScreenPlugin.swift` の `disable()` → `unobscureScreen()`（`DispatchQueue.main` に載っていない）。JS から呼ぶ箇所: `SpiritualDiary.jsx:124`（認証の前）、`:325`（設定変更の effect）。
- 起き方: 覆いの参照が残っている間（`willResignActive` から `didBecomeActive` まで、または D-25 に書いてある「見えない覆い」が残ったとき）に `disable()` が走ると落ちる。いまの回避策で通る経路は狭いが、0.4 秒の自動認証が、`didBecomeActive` より前に来る遅い復帰（コントロールセンター・着信バナーが重なるとき）では `disable()` に当たり得る。
- 直し方: patch-package で `disable` を `DispatchQueue.main.async` に載せ、`obscureScreen` に `isBeingPresented`/`presentedViewController` の確認を足す（これで「見えない覆い」も直る見込み）。そうすれば、認証の間だけ目隠しを外す回避策と P1-1 の後半はいらなくなる。
- 目隠しが外れたまま残るか: `runLockAuth` は `finally` で戻すので、通常の失敗では残らない。残るのは P1-1 の経路（背景で JS が止まっている間）だけ。

### P2-3 「端末のパスコードでひらく」はもう一度ボタンと同じ動き
- `SpiritualDiary.jsx:1846`（`onPasscode={() => unlockApp()}`）。`LAPolicy.deviceOwnerAuthentication` は必ず Face ID から始まる。HANDOVER と D-25 に書いてあるとおりで、実機で確認するまで文言は「もう一度ためす」系にしておく方が正直。

### P2-4 iOS 15.0〜15.4 では `inert` が効かない
- デプロイ対象は `IPHONEOS_DEPLOYMENT_TARGET = 15.0`。`aria-hidden` は VoiceOver からは隠すが、フォーカスは止めない。外付けキーボードの Tab で、ロック画面の下にある日記の入力欄へフォーカスが移り、入力できる（画面には見えない）。
- 直し方: デプロイ対象を 15.5 以上にする（Capacitor 8 の利用者層では実害は小さい）か、ロック画面に Tab の循環（フォーカストラップ）を入れる。

### P2-5 Web にも見た目の差分が 1 つ入っている
- `SpiritualDiary.jsx:841` 設定カードの `max-h-full overflow-y-auto` は Web にも効く。375/1280 の通常の高さでは同じ画素だが、背の低い画面（横向きのスマホなど）では、設定がはみ出す代わりにカードの中でスクロールするようになる。改善ではあるが「Web は不変」と D-25 に書いているので、`lockNative` のときだけ付けるか、D-25 に「Web にも効く」と書き足す。ラッパーの `<div>` は普通のブロック要素で、子の `min-h-screen` は崩れない。SSR は問題なし（React 19 は `inert={false}` を出力しない。プラグインはクライアントで動的 import するだけ）。

### P2-6 テストの抜け
- 設計 Ruling 8 で「必ず書く」とした起動 effect の順序テスト（ロックの判定が `setStep` より前／同じ描画）が無い。
- `runLockAuth` の目隠しの外し・戻し、`confirmWithLock` の 0.7 秒の待ち、`toggleLock` の分岐は、コンポーネントの中にあってテストされていない（純粋関数に出せばテストできる）。
- 文言のテスト（`lockUi.test.js:84,191`）は画面の文言だけで、`privacy/page.js`・`support/page.js` は対象外（いまの grep では「暗号化」「パスワード」はどちらにも無い）。
- `appLock.test.js:261` は P1-1 の穴を仕様として固定している。

### P2-7 細かいこと
- 起動直後は `lockAvailability===null` なので、ボタンが一瞬「パスコードでひらく」になり、そのあと「Face IDでひらく」に変わる。
- 一度閉じたフェイルオープンの帯（`failOpenDismissed`）は、そのあと何度フェイルオープンしても出ない（もう一度オンにするまで）。

## 問題なしと確かめたこと
- 設定キー `spiritual-diary.lock.v1` はバックアップに出ない（`backup.js` は 3 キーだけを書く）。紛れ込ませた `lock` を読み込んでも端末の設定は変わらない（テストあり）。
- 壊れた JSON・未知の version・読み取り例外 → 既定（オフ）＝フェイルオープン。
- パスコードを外した端末: 起動時は `passcodeNotSet` でフェイルオープン、設定項目は `enabled` の間は残る、オフにする再認証もフェイルオープンで通る。
- Face ID のロックアウト: `allowDeviceCredential:true` なので OS がパスコードを求める。
- Web: `lockNative` が false のままで、ロック画面・設定項目・購読・目隠し・再認証は動かない（`needsReauth` が false なので、書き出しは待たずにそのまま進む）。
- 画面・ポリシー・FAQ に「暗号化」「パスワード」は無い（コメントの中だけ）。ロック画面は `role=dialog`/`aria-modal`、最初のフォーカスはボタン、ボタンの高さは 52px、アイコンだけのボタンには `aria-label` あり。
