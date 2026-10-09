# Kiri iOS化 外部調査（2026-10-09 時点）

注意: 取得はWebFetch/npm registry/Context7。未確認は「未確認」と明記。npmの日付はregistryのtime値（UTC）。

## 1. Capacitor 本体
- 最新stable: **8.5.3**（2026-10-07、3日前）。2週間ルールなら **8.5.2（2026-09-11）** が確実。8.5.3はSPM下のCordova AppDelegate.hインポート修正のみ（Cordovaプラグインを使わなければ無関係）。
- マイナー系譜: 8.0.0=2025-12-08 / 8.1.0=2026-02-11 / 8.2.0=2026-03-06 / 8.3.0=2026-03-25 / 8.4.0=2026-06-02 / 8.5.0=2026-07-31。
- 9.0.0は alpha（alpha.8=2026-10-07）。stableではない。使わない。
- iOS最小デプロイターゲット: **iOS 15.0**（Capacitor 8 アップグレードガイド）。
- 新規プロジェクトは **Swift Package Manager が既定**（Capacitor 8から）。CocoaPodsは `npx cap add ios --packagemanager CocoaPods` で選択。公式環境構築ページはSPMを推奨。→ CocoaPodsが入っていても、プラグイン側がSPM対応か要確認（公式プラグイン8.xは対応と思われるが**未確認**。RevenueCatプラグインのSPM対応も**未確認**）。
- 要件: **Xcode 26.0以上、Node 22以上**（Node 24はOK）。
- Apple側: 2026-04-28以降、App Store Connectへのアップロードは Xcode 26+ / iOS 26 SDK 必須。2026-09-09以降はiOS 13以上をターゲットにすること（Capacitorは15なので問題なし）。Xcode 26.3は条件を満たす。
- Sources: https://capacitorjs.com/docs/getting-started/environment-setup / https://capacitorjs.com/docs/updating/8-0 / https://api.github.com/repos/ionic-team/capacitor/releases / https://developer.apple.com/news/upcoming-requirements/

## 2. Next.js 16.4 + Capacitor
- Next 16.4.0 は 2026-10-06 公開（3日前。npm latest）。2週間ルールを厳密にするなら16.3系の可能性（**16.3の最終版は未確認**）。
- 静的書き出し: `output: 'export'` → `out/` 生成。capacitor.config の `webDir: 'out'`。`next build && npx cap sync ios`。
- 静的書き出しで使えない機能（公式）: dynamic routes（generateStaticParamsなし／dynamicParams:true）、リクエスト依存のRoute Handler、cookies、rewrites/redirects/headers、Proxy(旧middleware)、ISR、デフォルトloaderでのImage最適化、Draft Mode、**Server Actions**、Intercepting Routes。→ 既存のAPIルートやServer Actionがあれば全部Workers側APIへ移す必要。
- Browser API（window/localStorage）はuseEffect内でのみ。Client Componentsもビルド時にプリレンダされる。
- 落とし穴（公式ドキュメントで確認できた範囲）: `trailingSlash: true` にすると `/privacy` → `/privacy/index.html` になる。公式の説明は「`/me.html` → `/me/index.html`」。WKWebView（capacitor://localhost）は静的ファイルサーバで、nginxのようなrewriteが無いので、trailingSlash:true にして `/privacy/` 形式にするのが安全というのが一般的な運用（**公式にCapacitor向けとして明記された記述は未確認**、実機/シミュレータで要検証）。
- 画像: `images: { unoptimized: true }`（またはcustom loader）。公式はcustom loader例を提示、unoptimizedは広く使われる（公式ページに直接の記述は今回の取得では未確認）。
- フォント: next/fontはビルド時にセルフホストされ静的書き出しでも動く（一般知識、**未確認**）。Google Fonts等の実行時CDN読み込みはオフラインで落ちるのでバンドル推奨。
- /privacy 等の法務ページ: App Store Connectには公開URLが別途必要（アプリ内リンクとメタデータ両方）。アプリ内は同梱ページか、外部URLをBrowser plugin（SFSafariViewController）で開く構成。
- Sources: https://nextjs.org/docs/app/guides/static-exports （version 16.4.0, 2026-08-09更新）

## 3. WebViewからリモートHTTPS API
- iOSのWebView origin は既定で **capacitor://localhost**（iosSchemeの既定は`capacitor`、http/httpsは指定不可。hostname既定`localhost`、変更せず推奨）。Androidは http(s)://localhost。
- Workers API側のCORS: `Access-Control-Allow-Origin` に **capacitor://localhost**（Web版オリジンも併用するなら両方）をリクエストのOriginが許可リストにあれば**単一値でechoバック**（カンマ区切り不可）。`Vary: Origin`、OPTIONSプリフライト（Authorization/Content-Type: application/json等でプリフライトが走る）に204で応答、必要ヘッダをAllow-Headersに。
- CapacitorHttp（`plugins.CapacitorHttp.enabled: true`）はネイティブ経由でCORSが適用されない。ただしシリアライズのオーバーヘッドがあり、メンテナー見解では「どうしても必要でない限り非推奨」。**自分のAPIならCORS許可で足りるので既定はfetchのまま、CapacitorHttpは有効化しない**が妥当。（引用元は掲示板の要約で、公式見解として明文化されたものは未確認）
- iOS 18.4シミュレータでcapacitor://からのfetchが失敗した報告あり（実機は問題なし）。シミュレータだけ失敗ならまず実機/TestFlightで確認。
- Sources: https://capacitorjs.com/docs/config / https://forum.ionicframework.com/t/does-my-api-server-need-to-cors-allow-capacitor-localhost/250480 / https://developer.apple.com/forums/thread/781454 / Context7 /websites/capacitorjs (CapacitorHttp設定)

## 4. 公式プラグイン（npm latest、peer: @capacitor/core >=8.0.0）
| パッケージ | latest | 公開日 |
|---|---|---|
| @capacitor/preferences | 8.0.1 | 2026-02-12 |
| @capacitor/haptics | 8.0.2 | 2026-03-27 |
| @capacitor/share | 8.0.3 | 2026-10-02（直前の8.0.2=2026-09-16） |
| @capacitor/filesystem | 8.1.4 | 2026-10-02（直前の8.1.3=2026-08-19） |
| @capacitor/status-bar | 8.0.4 | 2026-10-02（直前の8.0.3=2026-07-15） |
| @capacitor/splash-screen | 8.0.2 | 2026-07-15 |
| @capacitor/app | 8.1.2 | 2026-10-02（直前の8.1.1=2026-07-15） |
| @capacitor/browser | 8.0.5 | 2026-10-02（直前8.0.4=2026-07-15） |
| @capacitor/keyboard | 8.0.6 | 2026-10-02 |
- 2週間ルール適用なら、2026-10-02公開分は1つ前（share 8.0.2 / filesystem 8.1.3 / status-bar 8.0.3 / app 8.1.1 / browser 8.0.4）が候補。ただし通常は最新で問題ない。
- App plugin: `appUrlOpen`（ユニバーサルリンク/カスタムURLスキーム）、iOSにはハードウェア戻るボタンが無い（`backButton`はAndroid用）。
- Preferencesの注意: 日記本文のような大きなデータ・機微データには不向き（UserDefaults相当）。Filesystemまたはlocalの保存方式を別途検討（一般知識）。

## 5. RevenueCat
- @revenuecat/purchases-capacitor: **latest 13.7.2（2026-10-08）**。13.7.0=2026-10-01、13.7.1=2026-10-08、**13.6.1=2026-09-24**、13.6.0=2026-09-17、13.0.0=2026-04-15。2週間ルールなら **13.6.1** が確実。peer: @capacitor/core >=8.0.0（Capacitor 8必須）。
- セットアップ: `npm i @revenuecat/purchases-capacitor` → `npx cap sync`。Xcodeで **In-App Purchase capability** を有効化。Swift 5以上。`Purchases.configure({ apiKey: <iOS public SDK key>, appUserID?: })`（Reactなら初回useEffectで1回）。App Store Connect側で商品・サブスクリプショングループ作成、RevenueCat側でProduct→Entitlement→Offering紐付け。App Store Connect API/In-App Purchase keyの登録もRevenueCat側で必要（詳細手順は今回未取得で**未確認**）。
- 匿名ID: appUserID未指定なら `$RCAnonymousID:` で始まるIDをSDKが生成しデバイスにキャッシュ。**再インストールで新ID**になる（ただし同一Apple IDでRestore Purchasesすれば購入は新IDへ移る＝transfer設定に依存、挙動の詳細は未確認）。ログイン無しアプリの推奨は「appUserIDを渡さず匿名IDに任せる」。設定画面でApp User IDを表示してサポート用にコピーさせるのが推奨。自前ID使うなら random UUID v4、100文字以下、メール/IDFA禁止、`/` を含めない、"guest"等は不可。
- 注意: 匿名IDは端末ローカル。サーバー側のユーザー紐付け（日記の月次回数カウンタ等）をするなら、`Purchases.getAppUserID()` をAPIリクエストに添えるだけでは**詐称可能**（他人のIDを送れば他人の権利を使える。IDは推測困難なUUID的だが秘密ではない）。サーバーで独自のデバイストークンを発行し、RC IDと紐付けるか、その点を許容する設計判断が必要。
- バックエンド検証:
  - REST v1: `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}`、`Authorization: Bearer <secret key>`。**存在しなければcustomerを作成して201を返す**副作用あり。レスポンスは `subscriber.entitlements`（**期限切れも含む**ため `expires_date` を現在時刻と比較して判定）、`subscriptions`、`management_url`など。`X-Platform`は情報参照や秘密鍵利用時は付けない。レート制限は未確認。
  - REST v2: base `https://api.revenuecat.com/v2`、v2用secret key（v1キーは不可）、`GET /projects/{project_id}/customers/{customer_id}`（権限 `customer_information:customers:read`）。active entitlementsはこのGetで取得（サブリソースとして`/active_entitlements`のURLが応答内に現れる）。Customer Information のレート制限 480 req/min。v2のsubscriptionには`gives_access`フィールドあり。
  - Webhook: **Proプラン必須**。Integrations > Webhooks にHTTPS URLと任意のAuthorizationヘッダ。HMAC署名（`X-RevenueCat-Webhook-Signature`）も可。200以外は失敗扱いで最大5回リトライ（5,10,20,40,80分）、60秒以内に応答。配信は at-least-once なので event id で冪等化。公式推奨: Webhook受信後は**イベント内容を鵜呑みにせず GET /subscribers で最新状態を取り直す**。SANDBOXイベントは`environment`で判別。キャンセル系は最大約2時間遅れる場合あり。
  - Workers設計の目安: リクエスト時にRESTで権利確認（短TTLキャッシュ、KV）＋Webhookでキャッシュ無効化。secret keyはWorkers secretsに。
- Sources: https://registry.npmjs.org/@revenuecat/purchases-capacitor / https://www.revenuecat.com/docs/getting-started/installation/capacitor / https://www.revenuecat.com/docs/customers/identifying-customers / https://www.revenuecat.com/docs/api-v2 / https://www.revenuecat.com/docs/api-v2/customer / https://www.revenuecat.com/docs/api-v1/customers / https://www.revenuecat.com/docs/integrations/webhooks

## 6. App Store審査
引用元: https://developer.apple.com/app-store/review/guidelines/ （取得時点の本文。末尾12KB分は未読）
- **4.2**: 「repackaged website を超える機能・コンテンツ・UIを備えること。app-like でない/有用性が乏しいなら拒否」。4.2.2: カタログ以外で、マーケ資料・ウェブクリップ・リンク集であってはならない。対策: ネイティブ機能（Haptics、Share、通知、Preferences/ファイル保存、オフライン動作、IAP）を実装し、審査メモでアプリ固有機能を説明。起動時にリモートURLを丸ごと表示する構成（server.url）は避け、バンドルした静的アセットで動かす。
- **3.1.1**: サブスクなど機能解放は**必ずIAP**。独自の仕組み（ライセンスキー、QR、暗号通貨等）で解放不可。→ 課金はRevenueCat（StoreKit）経由のみ。Web決済（Stripe等）への誘導をiOSアプリ内に出すのは別規定（3.1.3等・米国は2025年以降の例外あり、**今回の調査では未確認**）なので、基本は出さない。復元（Restore Purchases）の仕組みを用意。
- **3.1.2**: 自動更新サブスクは7日以上、**全デバイスで利用可能**、継続的な価値の提供が必要。3.1.2(c): 購入前に対価として何が得られるか明確に説明。
- サブスク画面の必須要素（https://developer.apple.com/app-store/subscriptions/）: 名称・期間・内容、**更新時の全額価格を最も目立たせる**（月換算は小さく）、トライアルは期間と終了後請求額、購読者のサインイン/復元手段。**Terms of Use と Privacy Policy へのリンクをアプリ内とApp Store Connectメタデータの両方に**。Restore purchaseは購入画面と設定の両方。サブスク管理への導線（`showManageSubscriptions`相当。RevenueCatの`customerInfo.managementURL`やネイティブ呼び出し）。Schedule 2原文は未読のため**未確認**。
- **5.1.1(i)**: プライバシーポリシーへのリンクをApp Store Connectとアプリ内の両方に。収集データ・方法・用途、第三者の同等保護、保持/削除方針、同意撤回/削除依頼方法を明記。
- **5.1.1(ii)**: データ収集には同意が必要。有料機能が同意に依存してはならない。同意撤回を簡単に。
- **5.1.1(v)**: アカウント作成機能がある場合はアプリ内アカウント削除が必須。ログイン無しで使えるなら不要（Kiriは匿名IDなのでアカウント機能なし。ただしサーバーに保存されるデータがあればデータ削除手段の説明は5.1.1(i)で必要）。
- **5.1.1(ix)**/**1.4.1**/**5.1.3**: 日記がメンタルヘルス寄りの場合、医療的主張は避ける（1.4.1: 不正確な情報や診断/治療に使える医療アプリは厳格審査。受診を促す注意書き）。規制分野（ヘルスケア）は個人でなく法人名義での提出が求められうる→ くうが株式会社名義は適合。
- **5.1.2(i)（AI第三者共有、2025-11-13改訂）**: 「個人データの共有先を明確に開示し、第三者（**third-party AIを明記**）へ共有する前に**明示的な許可**を得ること。許可なく共有した場合は削除・Developer Program除名の可能性」（Apple原文確認）。実務解釈（ブログ・Product Hunt、非公式）: プライバシーポリシーの1文では足りず、**最初の送信前にアプリ内で、送信するデータ・送信先（例: Anthropic）・目的を示した明示的な同意画面**を出すのが安全。バックエンド（Workers）経由でもAI APIに日記本文が渡るなら対象と見るのが安全。オンデバイス処理の扱いは不明確。2026年にさらに改訂があったかは**未確認**（Apple原文を直接取得した時点ではこの条文が有効）。
- **プライバシー栄養表示（App Privacy Details）**: 「collected」= 端末外へ送信し、リアルタイム処理に必要な期間を超えて自社/第三者がアクセス可能。**送信しても即破棄でサーバー保存しない場合は開示不要**だが、①Kiriは「サーバー保存ゼロ（D-18）」でも、AI API（Anthropic）側の保持期間（Zero Data Retention契約の有無、保存期間）次第で「retained」扱いになりうる→ **要確認（Anthropic側の保持設定に依存）**。保持される場合は「User Content > Other User Content」を開示、リンク先=ユーザー識別子と紐づくかを判断（匿名IDでも通常は「linked」扱い。de-identifyしていなければ linked）。トラッキング=広告目的のデータ連携のみ。第三者SDK（RevenueCat: Purchases/Identifiers、Device ID等）も自分のラベルに含める。RevenueCatの収集データは同社ドキュメントの申告ガイド参照（**未確認**）。ラベルはいつでもアプリ更新なしで修正可能。
- Privacy Manifest（PrivacyInfo.xcprivacy）: 2024-05以降、required-reason APIの理由申告必須。Preferences(UserDefaults)使用時は CA92.1 等。公式プラグインやRevenueCat SDKが自前のmanifestを同梱しているか**未確認**（Xcodeのprivacy reportで確認）。
- 年齢レーティング: 2026-01-31までに新年齢レーティング質問への回答が必要（App Store Connect > App Information）。AI生成コンテンツ・ユーザー生成/メンタルヘルス関連の質問に注意。
- 4.8: Googleログイン等をアカウント認証に使うなら同等のSign in with Apple相当が必要。Kiriは匿名なら無関係。
- Sources: Apple guidelines / https://developer.apple.com/app-store/subscriptions/ / https://developer.apple.com/app-store/app-privacy-details/ / https://developer.apple.com/news/upcoming-requirements/ / 非公式解説: https://www.radom.com/insights/apple-updates-app-review-guidelines-to-strengthen-privacy-protections-against-third-party-ai-data-sharing , https://www.igeeksblog.com/apple-app-store-ai-data-disclosure-guidelines , https://stora.sh/blog/2026-05-06-apple-ai-consent-rule-5-1-2-i-implementation-guide

## 要検証メモ（未確認まとめ）
1. 公式プラグイン＋RevenueCatプラグインのSPM対応状況（CocoaPods既インストールなので問題が出たら `--packagemanager CocoaPods` で回避可）
2. trailingSlash / images.unoptimized / next-font のCapacitor固有の公式記述
3. Anthropic APIのデータ保持と栄養表示の整合
4. Stripe等外部決済リンクのiOS規定の最新状態（3.1.3/Epic裁判後の運用）
5. 2026年に5.1.2(i)の追加改訂があったか
6. RevenueCat v1 GETのレート制限、匿名ID→再インストール時のRestore挙動
