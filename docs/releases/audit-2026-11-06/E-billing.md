# E 会話・課金監査

担当: `/root/audit_b_data`（第2担当領域E）。基準: `aac43b6`。2026-11-06。
読解と合成SDK/ストアによる検証。実購入、RevenueCat API、自社本番API、実キーは使用していない。アプリコードの変更なし。

## 結果

購入商品/価格の一致に2件、購入反映の扱いに1件。外部設定が未接続のため、現実のユーザーに誤商品が販売されたとは判定しない。

| ID | 暫定 | 内容 | 成立条件 |
|---|---|---|---|
| E-01 | P1 | 想定商品がなくても別商品を月額商品として表示・購入できる | RC offeringの誤設定/変更 |
| E-02 | P2（価格不一致が成立するならP1） | offering取得競合で表示と購入するpackageがずれる | 同時取得が異なる商品/価格情報を返し、先行取得の適格性判定が遅れる |
| E-03 | P2 / 既存TTL方針の副作用 | 購入・復元直後に古い未購読キャッシュで拒否される | 同じIDに未購読60秒cacheが残る |

## E-01 固定商品IDと更新周期を検証しないまま購入する

- 場所: `src/lib/purchases.js:72-75,177-185,197-201`、`src/lib/kiriTalk.js:43-57`。
- 仕様: D-28/D-30は月額1商品、商品IDは`com.kugainc.kiri.talk.monthly`。表示はStoreKit価格を使用する。
- 証拠: `packageOf`は`current.monthly`がなければ先頭packageを返す。product.identifierやsubscriptionPeriodを確認しない。画面は取得商品を一律「月額」「毎月自動で更新」と表示し、purchaseChatはそのpackageを購入する。
- 合成再現: offeringのmonthlyをnull、先頭を`different.annual / ¥4,800 / P1Y`にする。`getChatOffering`→`paywallView`→`purchaseChat`を実行。
- 結果: 画面用価格は`月額 ¥4,800`、購入に渡したproductは`different.annual / P1Y`。SDKの最終購入シートは別途正しい条件を出すはずだが、Kiriの事前説明との一致は保証されない。
- 影響: 運営設定を間違えたときに、提供していない商品や別周期の商品へ進む。意図したentitlementが付かず「購入済みだが反映待ち」になる可能性もある。
- 最小修正: 固定商品IDかつ対応する月額周期のpackageだけを選ぶ。見つからなければoffering取得失敗として購入を止め、別商品へ自動フォールバックしない。lastPackageも無効化する。
- 合格条件: 別IDのmonthly、正しいIDがないavailablePackages、年額/買切り、空offeringではpurchasePackage未呼出。正しい固定月額商品だけ表示と購入が一致する。
- データ互換性: 保存データの変更なし。実ストアの商品登録内容の確認が別途必要。

## E-02 offering取得の競合で最後に表示した価格と購入packageが一致しない

- 場所: `src/lib/purchases.js:177-185`、`SpiritualDiary.jsx:480-485,540-552`。
- 証拠: `getChatOffering`は`lastPackage=pkg`した後で`await trialFor(product)`する。結果画面での自動読込と購入シートを開く読込は同時実行でき、先行要求を無効化しない。画面のofferingとクロージャのlastPackageが別の応答から作られる。
- 合成再現: Aは同じ商品IDの¥480で無料トライアル適格性判定を保留。Bは¥600でintroなしを即時応答。Bの表示後にAの適格性を解決すると、最後の表示はAの¥480になる。しかしlastPackageはBのままでpurchaseChatは¥600のpackageを渡す。
- 実行結果: `displayedAfterLastResolution:¥480 / actuallyPurchased:¥600`。
- 影響: RC側の価格/商品変更や異なるoffering応答が重なった場合、Kiri内で説明した条件と購入対象がずれる。同一の固定offering応答だけなら価格差は発生しない。現実のストアで価格変更時にこの応答順になることは未検証。
- 最小修正: offering情報と購入packageを同じ確定スナップショットにし、取得を直列化/共有化するか、リクエスト世代で古い完了を無効にする。表示中のofferingに対応する購入対象を明示的に指定できる設計も候補。
- 合格条件: A/Bの成功/失敗/適格性判定の完了順を逆転させても、最後に採用したofferingと購入packageが一致する。取得失敗後に以前のpackageを黙って購入しない。

## E-03 購入/復元成功後にも非購読cacheが残り、最大60秒拒否される

- 場所: `src/lib/entitlement.js:108-121`、`SpiritualDiary.jsx:561-566`。
- 期待する利用体験: 購入/復元成功から会話へ入る。D-31自体は非購読結果を1分cacheする方針なので、重大な権限突破やTTL実装違反ではない。公開前に扱いを決めるUX/運用上の副作用。
- 合成再現: 同じIDの未購読RC結果を一度取得→RC代役を購読中へ変更→60秒以内に再判定→61秒後に再判定。
- 実行結果: `before:false / justPurchased:false / after61sec:true`。実際のRCへは通信していない。
- 影響: 期限切れで一度送信して拒否された人が復元・再購入した場面などで、クライアントは購読中、サーバーはnot_entitledとなる。現在の案内は「Kiriと話すを確かめて」となり、購入が失敗したと誤解しやすい。
- 最小修正候補: 正当な購入/復元直後の再確認の仕組み、または反映待ちとしての説明と安全な再試行。クライアントのentitledフラグを信用してサーバー権限を開けない。cache迂回を作る場合はRC呼出の濫用制限も必要。
- 合格条件: サーバー非購読cache→購入/復元の順を試し、余計な再購入を促さず、反映待ちと再試行が理解できる。無購読者がフラグだけで通る回避策を作らない。

## 関連指摘と認証の残リスク

- **B-03:** 送信中の削除後に会話が復活する。Eでも同じ制御フローを確認。Bへ統合。
- **C-03/C-04:** 会話への同意説明と、毎回の全履歴送信。Cへ統合。
- **Cの「課金ID単体の認証に関する残リスク」:** サーバーは匿名IDに紐づくRC権利を確かめるが、送信者がそのIDの所有端末かは証明しない。漏えい/共有されたIDを別端末から使える。匿名128bit IDの総当たりで他人の権利を発見できるとは判定しない。現状のコードにID一覧流出経路は確認できず、推測困難なIDをbearerとして使う設計上の残リスクとしてAstraへ判断を依頼する。

## 確認済みの範囲

| 対象 | 結果 |
|---|---|
| 課金なし/Webビルド | IAP定数・native判定・公開キーなしでSDKを初期化しない。無料の日記/分析は別体験。build1で課金有効とは扱わない |
| SDK初期化 | 成功後1回、同時呼出で設定を共有、失敗後リトライ可能。Capacitor Proxyを直接awaitしない |
| トライアル | 無料introのみ、適格status=2だけ無料表示。unknown/失敗は通常価格。期間はStoreKit情報から作る。ローカルSDK13.6.1の型定義とメソッド戻り形を照合 |
| 購入 | キャンセル/承認待ち/既購入/反映待ちを分類。購入結果の権利を、直後の情報取得失敗で消さない。PaywallのbusyRefが同じシートの二重操作を抑止 |
| 復元/管理 | 復元の有無と失敗を区別。管理URLはRC由来かApple既定URL、noopener/noreferrer。OSの実遷移は未検証 |
| クライアント権利/失効 | customerInfoのactive entitlementを使用。SDK更新listenerと設定を開く時の再読込、サーバー403後の再読込がある。サーバーはクライアントboolを信用しない |
| サーバー権利 | 本番preview bypass無効。形式不正ID/キーなし/期限切れは拒否、障害は503。期限なし権利、grace、cacheの期限判定を読解。graceフィールドは下記公式schemaでentitlementにも存在することを確認し、不具合とは判定しない |
| 無料・解約後のログ | iap有効版で保存済み会話の読むだけ入口がある。送信権限と閲覧を分け、1000件保存、復元/書出に購読を要求しない |
| クォータ | 1人60通/JST、全体500通、IP毎分制限、権利判定後に加算。危機の固定応答は権利/API/日次上限を消費しない。AI失敗でも回数減、Redis障害でインスタンス単位化はD-31の受容済み制約 |

## 外部設定・実機で残る必須確認

1. ASCの月額商品/価格/試用、RC offering/entitlement/Bundle IDの実接続、公開キーとサーバーキーの配置。実値は今回閲覧していない。
2. 実機で購入・取消・承認待ち・復元・更新・期限切れ・grace・再インストール後の復元。既存build1の無料動作確認を代用しない。
3. 実ストアの試用適格性と表示、正しいStoreKit購入確認、管理画面への遷移、外部から戻った時の再読込。
4. 匿名ID再発行時の復元/移管挙動と、RCプロジェクトのrestore behavior設定。
5. 上限/費用の実測と有料機能停止時の運用案内。実AI・実決済は今回実行していない。

## 検証根拠

- 実行プローブ: Node + esbuildでpurchases/kiriTalk/entitlement/kiriStoreを一時CJSへbundleし、合成SDK/Map/固定時刻を使用。`kiri-e-billing-probe.cjs`。E-01/E-02/E-03を実行再現。
- 親の基準テスト: 45 files / 715 tests PASSとの共有あり。本担当は同じ全体試験を重複実行していない。既存テストは先頭packageへのフォールバックを肯定しているが、それは月額商品の仕様との一致を保証しない。
- [RevenueCat Customer Info Model](https://www.revenuecat.com/docs/api-v1/customer-info-model)（2026-11-06確認）: entitlementとsubscriptionのschemaを照合。graceフィールドがentitlementにないという疑義は棄却。
- [RevenueCat Billing Issues & Grace Periods](https://www.revenuecat.com/docs/subscription-guidance/how-grace-periods-work)（同日確認）: graceの間はアクセス維持が期待される。実プロジェクトのgrace設定と実応答は未確認。
