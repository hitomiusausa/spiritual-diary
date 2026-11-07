# C-05 Native診断ログの保存値露出

2026-11-07 / Astra P1 fix-now。F-03の最低OS実検証で追加発見。

## 再現と範囲

- Xcode Release simulatorをiOS15.5でconsole-pty起動すると、CapacitorがPreferences呼出と`TO JS`のJSON戻り値をstdoutへ出した。合成プロフィールの値も表示された。日記・会話も同じPreferences経路なので、本文が診断ログに入る可能性がある。実ユーザーのデータは使用していない。
- SDK側 `CAPInstanceConfiguration.m` のdebug既定、`CapacitorBridge.isDevEnvironment`、`native-bridge.js` のresultJson先頭256字出力を独立確認。AppのRelease Info.plistでCAPACITOR_DEBUGは空。SPMバイナリのDebug判定は有力な説明だが、SDK根因と全配布版への影響は断定しない。

## 修正と確認

- capacitor.config.tsに `ios.loggingBehavior: "none"` と `ios.webContentsDebuggingEnabled: false` を明示。本文を含むPreferences戻り値をCapacitorログに流さず、WebView検査も既定判定へ委ねない。Debugも同じ設定。通常診断が必要なときは本文ログを戻さず、合成データ専用の別成果物で扱う。
- `npx cap sync ios`→Release simulator rebuild成功。同梱したcapacitor.config.jsonの両値を照合し、server.urlがないことも確認。
- 同じ専用simulatorで起動・プロフィール復元を目視し、UIで合成markerを追加入力。実Preferencesの更新も一致。captureしたstdoutは468bytesのOS起動メッセージのみで、`TO JS`、`Preferences`、`QA-NATIVE`、`PRIVATE`は0件。evidence/native-log-privacy.json。
- stderr/stdoutのOS内部メッセージそのものを全て消す保証ではない。今回はprofile読込/保存と同じbridgeの設定を実測。日記/会話/backup/削除の各実機経路、署名済み配布IPAの同梱config・ログもH-02で受け入れる。実決済・本番AIへは接続していない。

ログ: /tmp/kiri-native-private-runtime.log、/tmp/kiri-native-privacy-sync.log、/tmp/kiri-native-privacy-release.log。画面: output/playwright/post-audit/native-log-private-profile.png。

一次資料: [Capacitor configuration declarations](https://github.com/ionic-team/capacitor/blob/main/cli/src/declarations.ts)、[Capacitor configuration](https://next.capacitorjs.com/docs/next/config)。結論はインストール済8.5.2ソースと実ビルドの挙動を優先する。
