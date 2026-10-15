# Kiri TestFlight → App Store（2026-10-16）

目標は、ひちゃんのiPhoneでTestFlight版を確認してからApp Storeへ進むこと。
このファイルは再開用。作業ツリーは `spiritual-diary-release`、ブランチは `agent/testflight-release-20261016`（起点 `origin/main=55933a2`）。

## 現在の先行条件

1. **Bundle IDは解消済み（D-37）**: `com.kugainc.kiri` はWeb・Xcode両方で利用不可。ひちゃんの対応依頼を受けて `com.kugainc.kiri.ios` を採用し、CapacitorとDebug/Releaseを統一。新IDで法人配布用profileを取得し署名IPAを作成できた。既存テスト版とは別アプリなので、必要な記録は元アプリからJSONバックアップする。元アプリは削除していない。
2. **Appleの契約**: 法人加入は完了。ASCに Paid Applications Schedule 更新の通知あり。本人の確認・同意が必要。税務・銀行情報の状態は今回未確認。既存の下書きや入力内容を推測で確定しない。
3. **ASCアプリレコードは作成済み（D-38）**: iOS / 会社名「くうが株式会社」（D-14の運営者）/ アプリ名「Kiri - Mind & Energy Note」/ 日本語 / SKU `kiri-ios` / Bundle ID `com.kugainc.kiri.ios`。名前 `Kiri` は使用済みで拒否されたため、確定済みのサブタイトルと組み合わせた。Apple ID `6823251374`。[ASC](https://appstoreconnect.apple.com/apps/6823251374/distribution)。
4. **配布署名は成功**: 未署名archiveからApp Store Connect向けexportでKUGAの配布profileと署名を付けられた。IPAの `embedded.mobileprovision` は `JQU8USCS8L.com.kugainc.kiri.ios`、`get-task-allow=false`、デバイス一覧なし。開発用署名は法人チームに登録端末が無いので失敗したが、TestFlight向けexportには端末登録は不要だった。署名チームはCLI引数で指定。
5. **課金接続**: RevenueCatキーは未設定。D-28/D-30/D-31が正で、月額480円・1週間トライアル・1日60通・商品名「Kiriと話す」。旧Phase 3資料 Ruling 12 の `premium.monthly` / 「Kiri プレミアム」は古い。正しい商品IDは `com.kugainc.kiri.talk.monthly`、Entitlement `kiri_chat`、Offering `default` / package `$rc_monthly`。Bundle IDを変更しても、商品IDまで機械的に変更しない。

## Appleへのアップロードと内部配布（成功・実機確認前）

- 2026-10-16 01:13 JST、1.0 / build 1 のアップロード成功。`/tmp/kiri-testflight-20261016-upload-retry.log` に `Upload succeeded` / `Uploaded App` / `EXPORT SUCCEEDED`。Apple側の処理も完了。
- 暗号化の質問は「上記のアルゴリズムのどれでもない」を保存。HTTPS・Web Crypto SHA-256・同梱RC SDKのCryptoKit/CommonCryptoの使用を確認し、[Appleの説明](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)と照合した。このビルドに独自暗号実装はない。`ITSAppUsesNonExemptEncryption` はソースに未追加なので、次のビルドでも質問が出る。実装やSDK変更時は再確認。
- 内部グループ「Kiri 内部テスト」を作成、自動配信はオフ。本人のASCアカウント1人のみ追加。ビルド1を追加し、**「1人のテスター・1個のビルド」「1.0 (1) テスト中」** を画面で確認。再読み込み後、本人のステータスも **「招待済み」** を確認した。インストール状態は未確認。外部テスターには配布していない。
- TestFlight: `https://appstoreconnect.apple.com/teams/528f37d1-3237-441f-bae2-bdfcf9e20158/apps/6823251374/testflight`
- グループ: `https://appstoreconnect.apple.com/teams/528f37d1-3237-441f-bae2-bdfcf9e20158/apps/6823251374/testflight/groups/b7d885d0-4228-4312-8f5b-e9cbc62fe6cd`

## できたこと

- 最新mainを取得し、既存ワークツリーに変更せず新しい作業場所を作成。
- `npm ci`、715テスト、lint、Web build、実行時依存の監査（0件）。開発依存込みでは8件の指摘があるため、実行時0件と区別する。依存の自動更新はしていない。
- `npm run ios:sync` で本番API `https://kiri.kugainc.com` 向け静的資産を同梱。購入キーなしのため購入UIなし。モック・開発プレビューなし、秘密の埋め込み検査合格。
- Privacy Manifestに端末内保存とファイル日時APIの理由を追加してResourcesへ登録。データ収集ラベルの代わりにはならない。
- XcodeのIn-App Purchase capability追加。ストアの商品・契約・RevenueCat接続は別途必要。
- Releaseの未署名archive成功。アプリ内の `PrivacyInfo.xcprivacy` を実物で検査。Capacitor・Cordova・RevenueCatの同梱manifestも存在。アイコンは1024×1024・RGB・アルファなし。
- ID変更後にiOS関連63テストと `ios:sync` を再確認し、新IDのRelease archive・法人配布署名IPAのexportに成功。IPA内の署名・profile・manifestを検査済み。

参照: [Preferencesの必須理由](https://capacitorjs.com/docs/apis/preferences#apple-privacy-manifest-requirements)、[Filesystemの必須理由](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements)、[Manifestの追加方法](https://capacitorjs.com/docs/ios/privacy-manifest)。

## 再開する順番

1. 本人の招待メールをiPhoneで開き、[Apple公式TestFlight](https://apps.apple.com/jp/app/testflight/id899247664)でKiriを入れる。招待済みは確認。アプリレコード・新ID・配布用署名・アップロード・処理・内部グループへの配布開始も済み。
2. 初回TestFlightは今ある基本機能の署名IPAを使える。課金テストも含める場合は、ASCの商品とRevenueCatを先に接続して再ビルド。公開SDKキーはビルド時のプロセス環境、秘密キーはCloudflare Secrets。秘密を `.env*` に書かない（D-19）。App Storeで有料チャットを出す判断は既存のD-28/D-30を維持。
3. 課金込みなら `npm run ios:sync -- --require-iap`。キーなしで止まることを維持し、モックをアップロードしない。端末のAPI送信先・Version/Build番号・署名・manifestをarchiveの実物で確認。
4. 次回の新ビルドはビルド番号を増やして下記のCLIでUpload。Appleの処理完了とビルド番号を確認し、必要なビルドだけ内部グループへ手動で追加する。本人は追加済み。第三者を招待するときは送信の指示を別途受ける。
5. iPhoneのTestFlightでインストールし、下記を確認。自動テスト・未署名archiveは実機の合格に数えない。
6. 合格後に、実装に合う説明文・スクリーンショット・App Privacy・年齢レーティング・審査メモを完成させて提出。旧 `kiri-phase4-appstore-drafts.md` は課金なし前提のドラフトなのでそのまま転記しない。

Apple公式: [ビルドのアップロード](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)、[内部テスター](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)。

## iPhoneで確認すること

- 初回起動 → 基本情報 → 日記 → AI送信の同意 → 読み解き → 履歴 → 再起動で復元。
- バックアップ書き出し・読み込み、重複取込で履歴が増殖しない、削除の確認。
- Face ID・パスコード、自動ロック、アプリ切替時のぼかし、復帰時の本文表示。
- 大きい文字、キーボード、セーフエリア、通信失敗と再試行。
- 課金込みの場合: 価格・トライアル表示、サンドボックス購入、復元、購読管理、期限切れの読むだけモード。実AIは設計書どおり合計2回まで。公開前にチャット費用を実測し、予算と全体上限を確認。
- 共有シートを開いたままロック時間をまたぐ件はD-25の受容済み残リスク。実機確認結果を分けて記録する。

## 検証用成果物

配布用IPA: `build/testflight-20261016/Kiri-1.0-1.ipa`（Git管理外、1.0 / build 1 / `com.kugainc.kiri.ios`、21,484,268 bytes）。SHA-256 `5b71e741d795b5cf8cdaabb072f81a3c3d633946a191083648e6830720f6ffb0`。

archive: `/Users/usausagi/Library/Developer/Xcode/Archives/2026-10-16/Kiri-TestFlight-20261016.xcarchive`（未署名。GUIの推奨配布は `No Team Found in Archive` になる。下記のCLIは成功する）。

```sh
xcodebuild -exportArchive \
  -archivePath /Users/usausagi/Library/Developer/Xcode/Archives/2026-10-16/Kiri-TestFlight-20261016.xcarchive \
  -exportPath /tmp/kiri-testflight-20261016-export \
  -exportOptionsPlist /tmp/kiri-testflight-20261016-export.plist \
  -allowProvisioningUpdates
```

exportOptionsは `method=app-store-connect` / `destination=export` / `signingStyle=automatic` / `teamID=JQU8USCS8L` / `manageAppVersionAndBuildNumber=false` / `uploadSymbols=true`。
アップロード用 `/tmp/kiri-testflight-20261016-upload.plist` は `destination=upload` にしたもの。ASCのアプリレコード作成後、上記コマンドから `-exportPath` を外し、このupload plistを指定して実行する。

ログ: `/tmp/kiri-testflight-20261016-archive-new.log`、`/tmp/kiri-testflight-20261016-export.log`（成功）、`/tmp/kiri-testflight-20261016-upload.log`（missingAppで失敗）。
このIPAは**課金なし**。TestFlightの内部グループへ配布開始済み。本人のiPhoneへのインストールと実機テストはまだ確認していない。App Store審査にも未提出。
