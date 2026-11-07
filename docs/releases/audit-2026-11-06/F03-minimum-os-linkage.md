# F-03 最低対応OSのネイティブリンク確認（追加監査）

2026-11-06。rootによる隔離iOS 15.5シミュレータの起動確認で見つかった、Debug成果物の起動前dyld停止を独立診断する。通常アプリコード、署名、SDK版、最低対応OSは変更していない。

## 確定した事実

- Xcode 26.3（17C529）、iPhoneSimulator SDK 26.2。Appのdeployment targetは15.5。
- 既存Debugビルド `build/audit-simulator/Build/Products/Debug-iphonesimulator/App.app/App.debug.dylib` は `LC_BUILD_VERSION minos 15.5`。
- 同dylibに `/System/Library/Frameworks/SwiftUICore.framework/SwiftUICore` が **LC_LOAD_DYLIB（strong）** として入っている。`SwiftUI.framework`もstrong、`_StoreKit_SwiftUI.framework`と`CoreTransferable.framework`はweak。
- rootの最低OSシミュレータではSwiftUICoreが見つからず、WebViewやJSの開始前にdyldがabortする。これは日記保存/JS初期化の失敗とは別。
- 依存経路はpurchases-capacitor 13.6.1 → purchases-hybrid-common 19.3.1 → purchases-ios-spm 5.90.2。RC側Package.swiftの最低iOS宣言は13で、RC本体にもSwiftUIのimportがある。
- 使用SDKのSwiftUICore.tbdはsystem framework向けallowable-clientsと、iOS13〜18のSwiftUIへのsymbol previous指示を含む。アプリのソースはSwiftUICoreを直接importしていない。

## 過去の配布IPAとの区別

保護対象の既存IPA `/Users/usausagi/Documents/AI_Playground/spiritual-diary-release/build/testflight-20261016/Kiri-1.0-1.ipa` を変更せず、zip内のApp実行ファイルだけを一時フォルダへ展開しotoolした。

```text
SwiftUI.framework/SwiftUI: strong
_StoreKit_SwiftUI.framework/_StoreKit_SwiftUI: weak
SwiftUICore.framework: 依存なし
```

したがって、今回のDebug停止から過去のTestFlightや公開用Releaseにも同じ問題があるとは断定できない。まず現在のReleaseを別成果物で比較する必要がある。

## 現在のRelease比較

Debug成果物を上書きせず、次のコマンドで別のderivedDataへbuildする。

```text
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/audit-release-simulator \
  -clonedSourcePackagesDirPath build/audit-simulator/SourcePackages \
  -disableAutomaticPackageResolution \
  ENABLE_DEBUG_DYLIB=NO CODE_SIGNING_ALLOWED=NO build
```

ログ: `/tmp/kiri-release-simulator-build.log`。既存のPackage.resolved、プロジェクトのbuild settings、SDKは変更しない。次回以後の比較で片方のarchitectureだけが必要ならarm64 simulatorへ絞れる。

Releaseはbuild成功。arm64/x86_64ともSwiftUICoreへの依存なし。最低OSでdyld停止は起きず、その後のJS構文停止を以下で別途確認した。

## 対応方針

- Releaseが最低OSで起動するなら、公開用の最低OSを上げる修正やSDKの無根拠な降格は行わず、Debug/新SDKのリンク差として扱う。
- rootが行う `-weak_framework SwiftUICore` は隔離したDebugの診断用override。private/system frameworkをshipping flagsへ明示追加する判断とは分ける。
- Appleは弱リンクしたsymbolを利用前に存在確認する必要を説明している。任意frameworkをweakにすればすべてのOS互換問題が解消する、と扱わない。
- 最低OSの起動・主要画面確認はRelease成果物で行い、現行OS上のDebug成功を代用しない。

一次資料: [Apple: Frameworks and Weak Linking](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPFrameworks/Concepts/WeakLinking.html)、[Apple: Addressing missing framework crashes](https://developer.apple.com/documentation/xcode/addressing-missing-framework-crashes)。根本原因の特定は現在のバイナリ/SDK/依存ソースと比較buildで行い、一般文書だけから特定SDKの不具合とは断定しない。

## 2026-11-07 ReleaseのJS互換性と修正結果

1. Releaseのconsole-ptyで `SyntaxError: Unexpected token '{'`、生成chunk内の `class ... {static{...}}` を確認。dyldのDebug停止とは異なる。Next既定ターゲットはSafari16.4、App最低OSは15.5のため不整合。Astraが追加F-03をP1へ裁定。
2. package.jsonのBrowserslistにSafari/iOS Safari >=15.5を明示し、最低OSやSDKを変えず再生成。`npm run ios:sync`、上記Releaseコマンドとも成功。再生成したchunkに当該static blockは残らない。
3. 専用シミュレータ `Kiri-audit-20261106`（iPhone SE2/iOS15.5、UDID CF16BE1A-2120-48B4-9502-56D5D38C74D9）だけで、初期画面→設定dialogを開閉→合成profile入力→記録入力→同意dialog→拒否を操作。APIには送っていない。
4. UIで保存した合成profile（QA-NATIVE-15/2000-01-01/時刻・性別空）を、App完全終了→起動で復元。実Preferences plistの値とも一致。`evidence/native-profile-persistence.json`。同意は保存されていない。
5. Nativeの初期・設定・入力・同意で文字/背景/境界/余白/選択状態/フォーカスを目視。CSS代替指定の独立確認はF03-css-compatibility.md。画像はoutput/playwright/post-audit/native-ios15-*.png。実機、実決済、実AI結果、共有、VoiceOverの合格を意味しない。

ログ: `/tmp/kiri-ios15-target-sync.log`、`/tmp/kiri-ios15-target-release.log`。公開用の署名済みIPAは未作成。新SDKでのDebug strong-link問題は開発環境上の留意として残す。診断用weak flagはプロジェクトに書いていない。

一次資料: [Next supported browsers / Browserslist](https://nextjs.org/docs/architecture/supported-browsers)、[Tailwind compatibility](https://tailwindcss.com/docs/compatibility)。公式の基準より古いOSを指定したことだけで全機能互換とせず、上記の実測範囲とH-02の実機ゲートを分ける。
