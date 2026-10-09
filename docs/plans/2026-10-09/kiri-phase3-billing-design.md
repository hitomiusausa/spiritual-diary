# Kiri Phase 3 課金設計（アプリ内課金でKiriチャットを開く）

作成: 2026-10-09 / 裁定: Fable 5.1（設計のみ。リポは無変更）
前提: CLAUDE.md・DECISIONS.md D-02/07/08/11/12/14/15/16/18/19/21/23/24/25・HANDOVER.md・`src/lib/entitlement.js`・`src/app/api/chat/route.api.js`・`src/lib/apiGuard.js`・`src/lib/kiriStore.js`・`src/lib/cors.js`・`src/components/KiriChatPanel.jsx`・`src/lib/chatHistory.js`・外部調査 `kiri-ios-external-research.md`

## 0. 事実確認（2026-10-09 に実測・取得したもの）

| 事実 | 値 | 確認方法 |
|---|---|---|
| `@revenuecat/purchases-capacitor` 最新 | 13.7.3（2026-10-08） | `npm view … time` |
| 2週間ルールを満たす最新 | **13.6.1（2026-09-24）** 。13.7.0 は 10/15 以降に候補 | 同上 |
| 13.6.1 の peer / 依存 | `@capacitor/core >=8.0.0`、`purchases-typescript-internal-esm 19.3.1` | `npm view` |
| SPM 対応 | `Package.swift` 同梱。`platforms: [.iOS(.v15)]`、`capacitor-swift-pm >=8.0.0`、`purchases-hybrid-common exact 19.3.1` | `npm pack` して tarball を展開 |
| プラグインの API | `configure / getOfferings / purchasePackage / restorePurchases / getCustomerInfo / getAppUserID / isAnonymous / syncPurchases / logIn / logOut / addCustomerInfoUpdateListener / presentCodeRedemptionSheet / setLogLevel / isConfigured` | `dist/esm/definitions.d.ts` |
| サブスク管理画面を出すネイティブ API | **無い**（`showManageSubscriptions` は未定義）。`CustomerInfo.managementURL: string \| null` を外部ブラウザで開く | 同上＋`customerInfo.d.ts` |
| `PurchasesEntitlementInfo` の判定フィールド | `isActive`・`willRenew`・`expirationDate`・`productIdentifier`・`isSandbox` | `customerInfo.d.ts` |
| Haiku 5.5 料金 | 入力 $0.10 / 出力 $0.50 per MTok（プロンプト10万トークン以下）。キャッシュ読み $0.01 | platform.claude.com/docs/en/about-claude/pricing（本日取得） |
| RevenueCat 料金 | **Pro は MTR $2,500/月まで無料**、超過分の1%。Webhook は Pro に含まれる（＝無料枠でも使える） | revenuecat.com/pricing（本日取得。外部調査の「Pro必須」は料金面では障害にならない） |
| RevenueCat 匿名ID | `$RCAnonymousID:` 接頭辞・端末キャッシュ・**再インストールで新ID**。カスタムIDは100文字以下・UUIDv4推奨・`/`禁止・`guest`等は拒否 | docs/customers/identifying-customers |
| REST v1 `GET /v1/subscribers/{id}` | secret key・Bearer。**存在しなければ作成する副作用**。`entitlements` は期限切れも含むので `expires_date` を見る | docs/api-v1（検索結果）。レート制限は**未確認** |
| Apple 購入画面の必須要素 | 名称と期間・提供内容・**更新時の全額価格を最も目立たせる**・月換算は従属・トライアルは期間と終了後の価格・復元/サインイン手段・**利用規約とプライバシーポリシーへのリンクをアプリ内とASCメタデータの両方に** | developer.apple.com/app-store/subscriptions |
| Apple Small Business Program | 手数料 **15%**（年間収益 $1M 以下・Account Holder が申請・Paid Apps 契約が前提）。2年目以降のサブスクは15%の通常制度あり | developer.apple.com/app-store/small-business-program |
| StoreKit Configuration File | シミュレータで動く・Apple ID 不要・Xcode の Transaction Manager で更新/期限切れ/返金を再現。**サーバー側検証は通らない**（RevenueCat に届かない） | Apple docs（本文取得不可のため一般知識。`要確認`） |
| 現在のコード | `checkChatEntitlement()` は env だけで判定・引数なし。`/api/chat` は 503→403(entitlement)→429(IP)→400(body)→危機→quota→AI の順。CORS 許可ヘッダは `Content-Type` のみ。`kiriStore` は `incr` しか持たない。iOS プロジェクトに `.entitlements` ファイル無し（IAP capability 未設定） | 読んだ |

未確認（設計はこれに依存しないが、実装時に確かめる）: RC v1 のレート制限、匿名IDの正確な文字列形式（`$RCAnonymousID:` + 32 hex と推定）、Capacitor iOS で `window.open(url, '_blank')` が外部 Safari を開くか（開かなければ `@capacitor/browser` 8.0.4・2026-07-15 を追加）、RC の「Restore behavior」既定値（「新しい App User ID へ移す」と推定）、Apple サンドボックスの更新間隔（月額=5分×最大6回と推定）、日本の特商法表記が IAP（Apple が販売者）に要るか（法務確認）。

## 1. スコープと完了条件（DoD）

**やること（Phase 3）**
1. iOS アプリ内で自動更新サブスクリプションを購入・復元できる（RevenueCat SDK → StoreKit）。
2. サーバー（Cloudflare Workers）が RevenueCat で権利を確認し、**権利のある App User ID からの `/api/chat` だけ**を通す。
3. チャットの消費を購読者ごとに上限（1日 N 通）で抑え、月額予算に収める。
4. 審査要件（3.1.1 / 3.1.2 / 5.1.1 / 5.1.2(i)）を満たす購入画面・法務ページ・ASC メタデータ。
5. Web は D-14 どおり購入導線なし・チャットなし。Web の見た目・バンドルは不変（Playwright 375/1280 で画素比較）。
6. D-18 を守る: サーバー（Redis）に置くのは「ハッシュ化した App User ID をキーにした権利の有無（TTL付き）」と「購読者ごとの日次回数」だけ。日記・会話本文はこれまでどおり保存しない。

**完了条件（全部満たして Phase 3 完了）**
- [ ] シミュレータ（StoreKit Configuration File）で 購入 → チャット入口が開く → 期限切れ（Transaction Manager）→ 入口が閉じる → 復元 → 開く、が通る
- [ ] 実機サンドボックス（Sandbox Apple Account）で 購入 → **本番 Worker** 経由で `/api/chat` 200 → 解約（Settings）→ 期限後に 403 `not_entitled`、を通す（実 AI 呼び出しは2回まで）
- [ ] 権利の無い ID・ID 無し・偽の ID で `/api/chat` が 403。Web（Origin 無し／`kiri.kugainc.com`）からも 403
- [ ] 購読者ごとの日次上限で 429 `user_daily_limit`、全体の `DAILY_LIMIT_CHAT` で 429 `daily_limit`
- [ ] 危機表現は権利の有無にかかわらず固定文＋窓口カード（D-15）、AI もクォータも使わない
- [ ] 購入画面に: 商品名・期間・提供内容・**StoreKit から取った価格文字列**・自動更新の説明・「購入を復元」・利用規約/プライバシーへのリンク・「サブスクリプションを管理」。設定にも「購入を復元」「サブスクリプションを管理」
- [ ] `/terms` `/support` `/privacy` と `KiriChatPanel` 内の「開発プレビュー」文言が消えている（L-4 解消）。ビルド検査（`build-ios.mjs`）で「開発プレビュー」混入が引き続き失敗扱い
- [ ] `npm test`・`lint`・`build`・`audit --omit=dev` 0 件、`cf:build`＋workerd プレビューで `/api/chat` 403（ID 無し）
- [ ] DECISIONS.md に D-26（本設計）、HANDOVER.md 更新、Redis に入るキーの一覧をプライバシーポリシーへ反映

**やらないこと（明示）**
- Web 版の決済（Stripe 等）・Web でのチャット（D-14）
- アカウント／ログイン／機種間の会話ログ同期（D-06 次段階・D-09 第三段階）
- 消費型（メッセージパック）・年額以外の複数プラン・RevenueCat Paywalls（RC 製 UI）・A/B
- Webhook 受信（任意の後続タスク。TTL キャッシュで足りる）
- 「あなた専用のパターン分析」機能（現プレミアムカードに書いてあるが未実装。**約束から外す**、3.1.2(c)）
- App Attest / DeviceCheck による端末証明（Ruling 3 参照）
- Android

## 2. 裁定（Ruling）

書式: `Ruling N: 決定 — 理由 — 外れた時の代償`

**Ruling 1: 商品モデルは自動更新サブスクリプション1本（まず月額のみ。年額は 1.1 で追加）。オーナー決定事項**
— チャットは API 費用が毎日発生する継続サービスなので、継続課金と費用構造が一致する。消費型（例: 50通パック）は「残通数」をサーバーで持つ台帳が要り、匿名 ID では**消費型の復元ができない**（RC 公式: 消費型はカスタム ID でしか復元不可）ため再インストールで全損する。両方を並べると購入画面が複雑になり 3.1.2 の「更新価格を最も目立たせる」要件とも干渉する。年額は解約率を下げるが、審査・検証面が増えるので初回提出は月額だけにする。
— 代償: 後で消費型を足すなら、商品追加＋サーバー台帳（匿名 ID では復元不可の注意書き）が必要。月額だけだと年額派の取りこぼしがある（1.1 で追加可、既存購読者への影響なし）。

**Ruling 2: `@revenuecat/purchases-capacitor` は 13.6.1 を固定版で入れる**
— 2026-09-24 公開で 2 週間ルールを満たす最新。SPM 対応（Package.swift・iOS 15）が実測で確認でき、既存の Capacitor 8.5.2 と整合。他の Capacitor プラグインと同じく `^` を付けない。
— 代償: 13.7.x の修正を取りこぼす。10/15 以降に 13.7.0 の changelog を見て上げるかを判断（HANDOVER に記載）。

**Ruling 3: App User ID は RevenueCat の匿名 ID をそのまま使う。端末トークンでの紐付けはしない。なりすましリスクは上限で金額を有界にして受け入れる**
— アカウントが無い以上、サーバーが発行する「端末トークン」も結局は同じ端末に置く別のベアラー秘密であり、匿名 ID と安全性は同じ（盗める条件が同じ）。本当に強くするには App Attest が要るが Phase 3 の範囲外。匿名 ID は推測不能なランダム値で、漏れる経路は「本人が共有する」「端末を解析される」に限られる。
— 定量: 漏れた ID 1 件あたりの損失上限 = 購読者ごとの日次上限 × 1 通あたり実費 ≒ 60 通 × 約 $0.001 = **$0.06/日・$1.8/月**。購読料（Ruling 8 の案 ¥480 → Apple 15% 控除後 ¥408）を下回るので、漏れた ID でさえ赤字にならない。全体の `DAILY_LIMIT_CHAT` と IP レート制限が二重の天井。
— 運用上の守り: 画面に ID の全体を出さない（サポート用に末尾 6 文字だけ「復元できないときにお問い合わせへ」）、サーバーのログとキーには **HMAC ハッシュ**（`kiriCrypto` に `hashAppUserId(secret, id)`、ドメイン分離 `kiri/v1/rcid`）だけを残す。ID 形式を検証（`^\$RCAnonymousID:[0-9a-f]{32}$`、実機で形式確認してから固定。最大 100 文字・`/` 無し）してから RC を呼び、でたらめな ID で RC に顧客を作らせない。
— 代償: 盗まれた ID の悪用は上限内で起こり得る。App Attest を足す日が来たら `/api/chat` の入口を増やす形になる（既存の経路は変えない）。

**Ruling 4: サーバー検証は「RC REST v1 を直接呼び、結果を Redis に短い TTL で置く」。Webhook は使わない**
— 流れ（`checkChatEntitlement({ appUserId, store, fetch })` に実装。D-08 の約束どおり関数内に接続）:
  1. 本番・プレビュー（`isGuardedDeployEnv`）では `KIRI_CHAT_PREVIEW` を**無視**する（D-21 の `KIRI_EXTRA_ALLOWED_ORIGINS` と同じ規律）。開発でだけ従来のバイパスが効く。
  2. `appUserId` が無い／形式不正 → `{ allowed:false, reason:"missing_id" }`（403 `not_entitled`。RC は呼ばない）。
  3. Redis `GET kiri:ent:{hash}` → `{"a":1,"e":<expires ms>}` か `{"a":0}`。あれば判定して終わり。
  4. 無ければ `GET https://api.revenuecat.com/v1/subscribers/{id}`（`Authorization: Bearer ${REVENUECAT_SECRET_KEY}`、タイムアウト 3 秒、再試行なし）。`subscriber.entitlements.kiri_chat.expires_date` が現在より後なら active。サンドボックス由来（`sandbox` フラグ）も **active として扱う**（App Review はサンドボックスで購入するため、ここで弾くと審査に落ちる）。
  5. `SET kiri:ent:{hash} … EX 600`（active は 10 分）、非 active は `EX 60`（1 分。購入直後の反映を速く）。
  6. RC が落ちている／タイムアウト → Redis に古い値があればそれ、無ければ 503 `chat_unavailable`（**フェイルクローズ**。費用側に倒す）。
— D-18 との整合: Redis に入るのは「秘密鍵なしでは元に戻せない ID 由来の値」「権利の有無と期限」「回数」だけ。日記・会話本文・ニックネームは入らない。プライバシーポリシーの表（D-18 で書いた Upstash の節）に 2 行足す。
— `kiriStore` に `get(key)` / `set(key, value, ttlSec)` を足す（メモリ実装も同じ契約。Redis 障害時はメモリへ降格＝インスタンスごとの短いキャッシュになるが、制限は効き続ける）。
— Webhook を使わない理由: TTL 10 分なら解約・返金の反映遅れは最大 10 分で、Apple の解約は期間末まで有効なので実害がない。受信口を増やすと署名検証・冪等化・Worker ルートが増える。RC Pro（無料枠）で Webhook 自体は使えるので、後で足せる（任意タスク T3-19）。
— 代償: RC v1 のレート制限が未確認（キャッシュで 1 利用者あたり 10 分に 1 回なので実用上は問題ないはず）。`GET` の「無ければ作る」副作用があるので ID 形式検証が必須。

**Ruling 5: `/api/chat` の判定順を変える。危機検出を権利判定より前に置く**
— 新しい順: 503(readiness) → 429(IP レート制限) → 400(body) → **危機 → 固定文**（AI・クォータ・権利いずれも使わない）→ 403 `not_entitled` → 429 `user_daily_limit`（購読者ごと、`kiri:cu:{hash}:{JST日付}` TTL 2 日）→ 429 `daily_limit`（全体）→ AI。
— 理由: つらい言葉を書いた人に「権利がありません」を返さない（D-15 の優先順位）。固定文の返却はコストゼロで、無料で叩けても得るものが無い。IP レート制限を body 解析より前に置くのは現状維持（パース前に数える）。
— `appUserId` は **リクエスト body** に入れる（ヘッダにすると D-21 の `Allow-Headers: Content-Type` を広げてプリフライトが変わる）。
— クライアント文言（`KiriChatPanel`）: `not_entitled` →「……この対話は、購読が確認できたときに開くの。設定から『購入を復元』を試してみて。」、`user_daily_limit` →「……今日はここまでにしておこう。また明日、続きを聞かせて。」（既存 `daily_limit` と同文でよい）、`chat_unavailable` →「……いまは声が届きにくいみたい。少ししてから、もう一度聞かせて。」。「開発プレビュー：…」の脚注は削除。
— 代償: 既存テスト `apiRoutes.test.js` の chat 系は順序前提を更新する。

**Ruling 6: 費用管理は「購読者ごと 1 日 60 通」＋「全体 `DAILY_LIMIT_CHAT`」＋ Haiku 5.5 `effort: low` 据え置き。実測ログを 1 本足す**
— 単価の見積もり（Haiku 5.5、本日の公式価格）: 入力 ≒ 4,000 トークン（人格＋安全指示＋会話モード＋結果文脈 1,200 字＋直近 12 通。新トークナイザで日本語は字数×1.3 程度）＝ $0.0004、出力 ≒ 600 トークン（思考込み、上限 2,000）＝ $0.0003 → **約 $0.0007/通、余裕を見て $0.001/通**。
— 月の予算式: 購読者 N × 平均 10 通/日 × 30 日 × $0.001 ＝ **$0.3 × N/月**。N=50 で $15、上限張り付き（60 通）の人だけなら $1.8/人/月。Kiri ワークスペースの月 $20 上限（分析と共用）は N≈30 で窮屈になるので、**購読者が 20 人を超えたら上限を $50 へ**（HANDOVER の行動項目）。
— `DAILY_LIMIT_CHAT` は 600 → **500** に下げて初期値とする（500 × $0.001 ＝ $0.5/日 ＝ $15/月が最悪値）。`wrangler.jsonc` の `vars` に固定（`DAILY_LIMIT_ANALYZE` と同じ扱い）。
— 実測: `console.log("[kiri-usage] chat tokens", input, output)` を 1 行足す（本文は出さない）。公開後 1 週間の値で単価を確定し、上限を見直す。プロンプトキャッシュ（人格＋安全指示を `cache_control`）は入力を最大 1/10 にできるが、Haiku の最小キャッシュ長と効果を測ってから（任意 T3-20）。
— 代償: 上限 60 通は「無制限」ではないので、購入画面と規約に「1 日 60 回まで」と書く（約束の透明性。3.1.2(c)）。

**Ruling 7: 同意（D-23）はそのまま流用。購入は同意に依存させない**
— チャット送信は既に `hasConsent()` でゲートされている。購入画面は同意が無くても開ける（5.1.1(ii): 有料機能を同意の対価にしない）。ただし購入前に知らせる義務として、購入画面に 1 行「対話の言葉は Anthropic 社の AI（Claude）に送られます（同意はあとで取り消せます）」を置く。同意を取り消した購読者には既存の `CONSENT_REQUIRED_MESSAGE` が出る（変更なし）。
— 代償: なし（文言 1 行）。

**Ruling 8: 価格はオーナー決定。設計上の推奨は月額 ¥480（Apple の価格ポイントに合わせる）**
— 根拠: Apple 15%（Small Business Program 加入前提）控除後 ¥408 ≒ $2.7（為替は未確認・概算）。上限張り付きでも $1.8 の原価を下回らない。¥380 だと張り付き利用者で薄く、¥600 は「2 文の返事」の体験に対して高く感じやすい。価格文字列は **常に StoreKit の `priceString`** を表示し、コードや文言にハードコードしない（地域・価格改定で崩れる）。
— 代償: 価格は ASC で変えられるが、既存購読者の値上げは Apple の同意フローが要る。

**Ruling 9: 購入画面（Paywall）は自前の 1 画面。必須要素を固定する**
— 構成（上から）: 見出し「Kiri プレミアム」／提供内容 2 点「Kiri との対話（1 日 60 回まで）」「会話ログの読み返し」／**価格行: `priceString` ＋「/ 月」を最も大きく**（年額追加時は年額の総額を主、月換算は小さく）／自動更新の説明（「購入確認後に Apple ID に課金。期間終了の 24 時間前までに解約しない限り自動更新。iOS の設定 > Apple ID > サブスクリプションから解約できます」）／AI 送信の 1 行（Ruling 7）／主ボタン「購読する」／「購入を復元」／「サブスクリプションを管理」（`managementURL` を外部ブラウザで。null なら Apple の購読ページ URL）／「利用規約」「プライバシーポリシー」（同梱ページ `/terms/` `/privacy/`）／閉じる。
— 見た目は D-13 のトークンだけ（gold 1 色・夜色）。**比較 HTML 2 案 → オーナー選択 → 実装**（CLAUDE.md の流儀）。
— 無料トライアルを付ける場合（オーナー Q2）: 「7 日間無料、その後 ¥480/月」をボタンの直上に明記（Apple 必須）。
— 代償: RevenueCat Paywalls（RC 製 UI）を使わないので A/B や遠隔変更はできない。審査指摘があれば文言はアプリ更新で直す。

**Ruling 10: Web は「何も出ない」。ビルド時定数 `NEXT_PUBLIC_KIRI_IAP` で iOS ビルドだけに課金コードを入れる**
— `nextConfigFor`: `KIRI_BUILD_TARGET=ios` のとき `NEXT_PUBLIC_KIRI_IAP:'1'`、Web は `'0'`。`SpiritualDiary.jsx` の `CHAT_PREVIEW_ENABLED` を `IAP_ENABLED = process.env.NEXT_PUBLIC_KIRI_IAP === '1'` に置き換え、プレミアムカード・購入画面・`KiriChatPanel`・設定の「購入を復元／管理」をこの定数で囲む（Web バンドルから消える＝D-24 の性質を維持）。さらに実行時 `isNativePlatform()` でも守る（二重）。
— 開発用の `NEXT_PUBLIC_KIRI_CHAT_PREVIEW` と `KIRI_CHAT_PREVIEW` は**開発ビルド（`--dev`／`next dev`）限定のバイパス**として残す。本番 Worker では Ruling 4-1 で無視されるので、設定ミスで開くことはない。
— サーバー側は何もしなくても D-14 を満たす: Web には RC ID が無いので `/api/chat` は 403。`/support` に「Kiri との対話は iOS アプリで購読できます」を書く。
— 代償: Web からアプリへの誘導（App Store リンク）は Phase 4 で公開 URL が出てから。

**Ruling 11: 法務ページの改稿（L-4）**
— `/terms` §3「有料機能」: 名称・月額（「価格はアプリ内の購入画面に表示」と書き、数字は書かない）・自動更新・解約方法（iOS の設定）・返金は Apple の規定・1 日の上限・提供内容・サービス変更時の告知。「開発プレビュー」を削除。
— `/support` FAQ「対話が使えません」→「購読の確認・復元の手順」「解約方法」「上限に達したとき」。
— `/privacy`: 第三者に **RevenueCat, Inc.**（購入・購読状態の管理。送るのは匿名の App User ID と App Store の取引情報。日記は送らない）を追加。D-18 の Upstash の表に「権利の有無（ハッシュ化 ID をキー、最長 10 分）」「購読者ごとの日次回数（最長 2 日）」を追加。ASC の App Privacy（栄養表示）は RC のガイドに従い「Purchases」「Identifiers（User ID）」を申告（RC 公式ガイドは未確認。オーナーが ASC で入力）。
— 文言規律（D-25）: 「暗号化」「パスワード」を使わない。既存テストの対象ページに含める。
— 代償: なし。

**Ruling 12: App Store Connect の手順（オーナー作業・順番固定）**
1. Apple Developer Program（法人・D-U-N-S 済み）→ ASC の **Agreements, Tax, and Banking**: Paid Apps 契約を Account Holder が承諾、銀行口座（くうが株式会社名義）、税務フォーム（米国 W-8BEN-E ＋ 日本の税情報）。**ここが終わらないと IAP がサンドボックスでも「商品なし」になる**。
2. Small Business Program に申請（Account Holder。承認まで時間がかかるので最初に）。
3. アプリレコード作成（Bundle ID `com.kugainc.kiri`、名前「Kiri」）。
4. **サブスクリプショングループ**「Kiri プレミアム」→ 商品 ID `com.kugainc.kiri.premium.monthly`（表示名「Kiri プレミアム（月額）」、説明、JPY の価格ポイント、ランク 1）。審査用スクリーンショット（購入画面の画像）とローカライズ（ja）を埋める。年額は後日 `…premium.annual`。
5. Users and Access → **Integrations → In-App Purchase**: キーを 1 本生成（.p8 は一度しかダウンロードできない。Issuer ID も控える）→ RevenueCat に登録。
6. Users and Access → **Sandbox → Testers**: サンドボックス Apple アカウントを 1〜2 つ（実機の 設定 > App Store > サンドボックスアカウント で使う）。
7. App Information → App Privacy（栄養表示）、年齢レーティング質問（AI 生成コンテンツ）、**利用規約 URL と プライバシーポリシー URL**（`https://kiri.kugainc.com/terms` `/privacy`）をメタデータに。
8. App Review 情報: 「チャットはサブスクリプション購入後に開きます。購入前に AI 送信の同意画面が出ます。サンドボックスでご確認ください」をメモに。
— 代償: 1〜2 は数日〜数週間かかることがある。Phase 3 の最初の週に着手。

**Ruling 13: RevenueCat の設定（オーナー作業）**
1. プロジェクト「Kiri」→ App Store アプリ追加（Bundle ID）→ **In-app purchase key configuration** に .p8 と Issuer ID。
2. **Entitlement** `kiri_chat`、**Products** を ASC から取り込み、**Offering** `default` に `$rc_monthly` パッケージとして紐付け。
3. 設定の Restore behavior は既定（新しい App User ID へ移す）を維持（再インストール後の復元で新 ID に権利が移る。匿名運用の前提）。
4. API Keys: **iOS 公開 SDK キー**（`appl_…`。アプリに埋める。公開前提）と **v1 secret key**（`sk_…`。サーバーだけ）。Webhook は作らない。
5. Collaborators に実装担当を Viewer で（任意）。

**Ruling 14: 秘密の置き場**
— `REVENUECAT_SECRET_KEY`: Cloudflare Secrets（本番）と `.dev.vars`（ローカル workerd）。`.env.local` には入れない（D-19: OpenNext が `.env*` を Worker に埋め込む）。`check-embedded-env.mjs` の検査対象に名前を足す。
— `NEXT_PUBLIC_REVENUECAT_IOS_KEY`: 公開キーなので埋め込んでよい。`npm run ios:build` の**プロセス環境**で渡す（`NEXT_PUBLIC_KIRI_API_BASE` と同じ経路。`.env.ios` は作らない）。未設定なら `ios:build` を失敗にする（`--dev` では省略可＝購入機能はモック）。
— `REVENUECAT_ENTITLEMENT_ID = "kiri_chat"`・`KIRI_CHAT_USER_DAILY_LIMIT = 60` はコードの定数（先頭にまとめる）。後者は env で上書き可。
— 代償: 公開キーは誰でも読めるが、RC 公開キーは設計上公開前提（購入は Apple が検証）。

**Ruling 15: テスト戦略は 3 層**
1. **単体（vitest）**: `entitlement.js`（fetch をモック: active／期限切れ／ID 不正／RC 500／タイムアウト／キャッシュ命中／本番での `KIRI_CHAT_PREVIEW` 無視）、`kiriStore` の `get/set`（メモリ・Upstash 偽クライアント）、`apiRoutes.test.js` の順序（危機→403→user cap→global cap）、`purchases.js`（プラグインをモック。`capacitorProxy.js` の作法）、`nextConfigFor`（`NEXT_PUBLIC_KIRI_IAP`）、文言テスト（「開発プレビュー」が本番向けに残っていない）。
2. **シミュレータ**: `ios/App/Kiri.storekit`（商品 1 つ、更新間隔は既定）をスキームの Run › Options に付ける。購入 → 入口 → Transaction Manager で期限切れ → 入口が閉じる → 復元。**この層ではサーバー検証は通らない**ので、`--dev` ビルド＋ `KIRI_CHAT_PREVIEW=1` の `next dev` に向けて UI 経路だけ確かめる。
3. **実機サンドボックス**: 本番向け `ios:build`（API 先 `kiri.kugainc.com`）＋ 実機 ＋ サンドボックス Apple アカウント。購入 → 本番 Worker で `/api/chat` 200（実 AI 1 回）→ Redis に `kiri:ent:*`・`kiri:cu:*` が**ハッシュキーで**入る → 解約 → 期限後 403（実 AI 0 回）。合計の実 AI 呼び出しは 2 回まで。
— Web 不変の証明: 変更前後の Playwright スクリーンショット（375/1280、トップ・結果・設定）を PSNR で比較（D-25 と同じ手順）。
— 代償: 実機サンドボックスにはオーナーの iPhone と Xcode 署名（Team＝くうが株式会社）が要る。

**Ruling 16: D-11（会話ログの閲覧）は維持。期限切れで入口を閉じるが、ログは消さない**
— `KiriChatPanel` ごと権利ゲートの内側に置く（D-11 の「現状との整合」どおり）。期限切れ → パネルが開けない → ログは `spiritual-diary.chat.v1` に残る → 再購読で読める。購入画面に「以前の会話ログは残っています」を 1 行。バックアップの書き出しは無料・有料を問わず会話ログを含む（D-11 注意）。「すべて削除」は従来どおりチャット履歴も消す。
— クライアントの権利判定は `customerInfo.entitlements.active.kiri_chat`（起動時と `addCustomerInfoUpdateListener`）。オフラインでは RC の端末キャッシュが使われるので、入口は開くがサーバーは別途判定する（サーバーが正）。
— 代償: 期限切れ直後にオフラインで開いた場合、送信で 403 が返る（文言で案内）。

## 3. タスク分解（T3-1〜T3-20）

モデル配分の方針: Fable は裁定と台帳のみ。サーバー・テスト・文言は Sonnet、1,800 行の `SpiritualDiary.jsx` への結線と購入画面・監査は Opus。レーン A/B/C は別ファイル群なので並列（worktree 分離）。D はオーナー。統合（E）は逐次。

| ID | 内容 | モデル | 触るファイル | テスト | レーン |
|---|---|---|---|---|---|
| T3-1 | `kiriStore` に `get`/`set(ttl)` を追加（メモリ・Upstash 両方、障害時降格） | Sonnet | `src/lib/kiriStore.js` | `kiriStore.test.js` 追加分 | A |
| T3-2 | `kiriCrypto.hashAppUserId`、`entitlement.js` を RC v1 検証＋TTL キャッシュ＋ID 形式検証＋本番で preview 無視に書き換え（Ruling 3・4） | Sonnet | `src/lib/kiriCrypto.js` `src/lib/entitlement.js` | `entitlement.test.js` 全面改稿（fetch モック 7 ケース） | A |
| T3-3 | `/api/chat` の判定順変更・`appUserId` を body から・購読者別日次上限・新エラーコード・token 実測ログ（Ruling 5・6）。`DAILY_LIMIT_CHAT=500` を `wrangler.jsonc` に | Sonnet | `src/app/api/chat/route.api.js` `src/lib/apiGuard.js`(定数) `wrangler.jsonc` | `apiRoutes.test.js` 順序・コード | A |
| T3-4 | `check-embedded-env.mjs` の検査名に `REVENUECAT_SECRET_KEY`、`.env.example`・`.dev.vars.example` 更新 | Sonnet | `scripts/check-embedded-env.mjs` `.env.example` | 既存スクリプトテスト | A |
| T3-5 | `src/lib/purchases.js`: プラグイン薄ラッパ（configure / offerings / purchase / restore / customerInfo / isEntitled / appUserId / managementUrl）。Web・非ネイティブではモック（常に未購読） | Sonnet | `src/lib/purchases.js` `package.json`（13.6.1 固定） | `purchases.test.js`（プロキシ作法） | B |
| T3-6a | 購入画面の**比較 HTML 2 案**（A: カード 1 枚縦積み、B: 価格を中央に置く扉風）。D-13 トークンのみ | Opus | scratchpad（リポ外） | オーナー目視 | B |
| T3-6b | `src/components/PaywallSheet.jsx` 実装（Ruling 9 の必須要素。価格は `priceString`） | Opus | `src/components/PaywallSheet.jsx` | 文言テスト（必須要素の存在） | B（6a 承認後） |
| T3-7 | `SpiritualDiary.jsx` 結線: `IAP_ENABLED`、プレミアムカード改稿（「無制限」「パターン分析」削除）、購読済みなら「Kiri に聞く」、未購読なら購入画面、設定に「購入を復元」「サブスクリプションを管理」、起動時 `configure`＋listener | Opus | `src/components/SpiritualDiary.jsx` `scripts/lib/nextConfigFor.mjs` | `nextConfigFor` テスト、Playwright 画素比較（Web 不変） | B |
| T3-8 | `KiriChatPanel`: 脚注削除、新コードの Kiri 文言、送信 body に `appUserId` | Sonnet | `src/components/KiriChatPanel.jsx` | 文言テスト | B |
| T3-9 | 法務・サポート文言（Ruling 11）。D-25 の禁止語テストに準拠 | Sonnet | `src/app/terms/page.js` `support/page.js` `privacy/page.js` | 既存ページ文言テスト拡張 | C |
| T3-10 | `build-ios.mjs`: `NEXT_PUBLIC_REVENUECAT_IOS_KEY` 必須化（`--dev` は任意）、「開発プレビュー」検査の維持、`NEXT_PUBLIC_KIRI_IAP=1` 付与 | Sonnet | `scripts/build-ios.mjs` | スクリプトテスト | C |
| T3-11 | Xcode: In-App Purchase capability（`App.entitlements` 生成）、`ios/App/Kiri.storekit` 作成・スキームに添付、`cap sync`（SPM で RC が解決されるか） | Opus（MobileBuildMCP）＋オーナー署名 | `ios/App/**` | ビルドが通る | C |
| T3-12 | ASC 設定（Ruling 12 の 1〜8） | オーナー | — | 商品がサンドボックスで取得できる | D |
| T3-13 | RevenueCat 設定（Ruling 13） | オーナー | — | Offering が SDK から取れる | D |
| T3-14 | Cloudflare Secrets に `REVENUECAT_SECRET_KEY`、`.dev.vars` に同名 | オーナー | — | workerd で 403→（ID あり）RC 呼び出し | D |
| T3-15 | 統合: A/B/C を `agent/ios-billing` へマージ、`npm test/lint/build/audit`、`cf:build`＋workerd で `/api/chat` 403（ID 無し） | Sonnet | — | 全テスト | E |
| T3-16 | シミュレータ QA（Ruling 15-2）記録を scratchpad `QA-billing/` | Opus | — | チェックリスト | E |
| T3-17 | 実機サンドボックス QA（Ruling 15-3。実 AI 2 回まで）＋ Redis キー確認（ハッシュのみ） | オーナー＋Opus | — | DoD 項目 | E |
| T3-18 | 監査 A/B: なりすまし経路・Web 不変・D-18 違反（Redis に ID 平文／本文）・危機→権利の順序・審査必須要素の漏れ | Opus（コードを渡し結論は渡さない） | — | 指摘ゼロ or 直し便 | E |
| T3-19 | DECISIONS に D-26、HANDOVER、プライバシーポリシー同期、13.7.0 再評価メモ | Sonnet | `DECISIONS.md` `HANDOVER.md` | — | E |
| T3-20（任意） | Webhook 受信（署名検証・冪等・キャッシュ無効化）／人格プロンプトのキャッシュ化／年額追加 | 後日 | — | — | — |

依存: T3-6b は T3-6a の承認後。T3-7 は T3-5 の API 名が決まってから（先に `purchases.js` の型・関数名を決めて共有）。T3-17 は T3-12〜14 完了が前提。T3-11 は Xcode が要るので Mac の作業枠を確保。

## 4. オーナーへの質問（最大 5。非エンジニア向け）

**Q1. 月額はいくらにしますか？（推奨: ¥480）**
¥380 / **¥480** / ¥600 から。Apple の取り分（15%）を引くと手元は ¥323 / ¥408 / ¥510。1 人が毎日上限まで話しても AI の原価は月 ¥270 ほど（$1.8）なので、¥480 なら赤字になりません。年額は今回は作らず、様子を見て後から足すのを勧めます（作るなら ¥3,800＝約 34% 引き）。

**Q2. 無料トライアルを付けますか？（推奨: 付けない）**
無料の「読み解き」がすでにお試しの役目を果たしています。トライアルを付けると AI 費用だけ出て解約される流れが起きやすく、購入画面にも「7 日間無料、その後 ¥480/月」の表示義務が増えます。反応を見て 1.1 で付けることはできます。

**Q3. 1 日に話せる回数の上限は？（推奨: 60 回）**
Kiri の返事は 2 文なので 60 回で十分に会話できます。上限がある以上「無制限」とは書けないので、購入画面には「1 日 60 回まで」と書きます。30 回でも 100 回でも設定で変えられます（100 回だと原価は月 ¥450 ほどになり、¥480 だとほぼ利益が出ません）。

**Q4. 購読をやめた人は、過去の会話ログを読めなくしてよいですか？（推奨: はい、ただし消さない）**
以前の決定（D-11）どおり「会話ログの読み返しは有料」のままにします。やめると読めなくなりますが、ログは端末に残り、再購読すれば戻ります。バックアップにはいつでも含まれます。「やめた後も読めるようにしたい」なら、入口だけを変えるので今言ってください。

**Q5. 商品名と約束する内容はこれでよいですか？（推奨: 下記）**
商品名「**Kiri プレミアム（月額）**」。約束する内容は 2 つだけ: 「Kiri との対話（1 日 60 回まで）」「会話ログの読み返し」。いまの画面にある「あなた専用のパターン分析」はまだ無い機能なので外します（Apple は「買う前に何が得られるかを正確に」を求めます。未実装の約束は審査落ちの理由になります）。
