# F iOS・端末機能の監査

監査日: 2026-11-06。基準: `aac43b6`、監査candidate。コード変更、端末/シミュレータ操作、本番接続は行っていない。D-25/D-26/D-37と実装・依存SDKの同梱Swiftソースを照合した。

## 結果

| ID | 暫定重大度 | 対象 | 結果 |
|---|---|---|---|
| F-01 | P1 | iOSバックアップ書き出し | 二重実行が同じ一時ファイルを共有し、失敗した2本目が共有中の1本目のファイルを削除する |
| F-02 | P2 | 書き出し用一時ファイルの寿命 | 共有中の強制終了等で残った平文一時ファイルを起動時/全削除時に掃除する経路がない |

F-01は依存を模した実関数の実行で再現した。F-02はプロセス終了でfinallyが完走しない条件と、保存/削除の到達経路の確認に基づく。iOS実物のファイル残存と共有先の挙動は未確認であり、検証項目として残す。

## F-01 並行した書き出しが別の書き出し用ファイルを消す

- **場所:** `SpiritualDiary.jsx:184-204`、`1103-1110`、`src/lib/backupShare.js:22-38`、`src/lib/backup.js:28-35`。SDKの2本目拒否は `node_modules/@capacitor/share/ios/Sources/SharePlugin/SharePlugin.swift:66-69`。
- **期待:** バックアップ操作は連打されても、共有中のファイルを別の操作が破壊せず、保存/中止の結果を正確に表示する。
- **事実:** 書き出しボタンにbusy/disabledがなく、exportBackup自体にも同時実行ガードがない。backupFileNameは日付だけで同日に固定。同時に2本動くと同じ `Directory.Cache` の同じpathに書く。Share SDKは「共有中」の2本目を拒否する。その2本目のfinallyが同じpathを削除する。
- **再現:** `exportBackupNative()`を同じfilenameで2回並行実行し、実SDKと同様にShare1本目は保留、2本目は `Can't share while sharing is in progress` で拒否。FilesystemはMapで模擬。アプリコードに変更なし、外部送信なし。

```json
{
  "secondResult": { "error": "Can't share while sharing is in progress" },
  "firstShareStillOpen": true,
  "fileExists": false,
  "calls": [
    ["write", "kiri-backup-2026-11-06.json"],
    ["write", "kiri-backup-2026-11-06.json"],
    ["share", 1],
    ["share", 2],
    ["delete", "kiri-backup-2026-11-06.json"]
  ]
}
```

- **利用者への影響:** 共有先がまだ読んでいないファイルがなくなるため、バックアップ失敗または共有先依存の結果になる。単純な書き出し連打で起き得る。Shareがファイルを即座に内部コピーする場合の影響は共有先で異なるので、「必ず全共有先で保存に失敗する」とは断定しない。
- **確度:** 競合と削除は高（実関数再現）。実機での共有先別の影響は未確認。
- **最小修正:** 呼び出し側の同期in-flightガードとbusy表示で書き出しを直列化し、ネイティブ関数でも重複を制御する。一時ファイルは1操作1pathにすれば別操作のfinallyが消さない。利用者に見せるファイル名と内部の一時pathは分けられる。
- **互換性:** 履歴・バックアップJSONのschema変更は不要。同じ日付の利用者向けファイル名は維持可能。
- **合格条件:** 二重tap/同時呼出し、share拒否、write失敗、キャンセル、通常完了で1本目の一時ファイルを2本目が削除しない。共有後に自分の一時ファイルだけを掃除する。iOS「ファイルに保存」でJSONを読み戻す。
- **関連:** Bの書き出し成功表示/保存失敗の監査と統合する。D-25の共有シートが自動ロック後も残る承認済みリスクとは別件。

## F-02 共有中に終了した場合の一時バックアップが削除対象に含まれない

- **場所:** `src/lib/backupShare.js:24-38`、`src/lib/deleteAll.js:7-11`、起動処理 `SpiritualDiary.jsx:259-310`。利用者向け削除説明 `src/app/privacy/page.js:94-99`、`src/app/support/page.js:27-31`。
- **期待:** アプリ自身が作った一時ファイルには回収方針があり、「この端末の日記・読み解き・会話をすべて削除」の実行後に古い平文一時コピーが残り続けない。利用者が共有先へ保存したファイルは利用者管理という既存方針を維持する。
- **事実:** 一時JSONはアプリのCacheへ書く。削除はShare promiseがsettleした後のfinallyのみ。deleteFileの失敗も無視する。起動時/clearAllRecordsにCacheの該当ファイルを掃除する経路がない（src全体でFilesystem.deleteFileを呼ぶのはこのfinallyだけ）。
- **再現条件:** 共有シートが開いた状態でアプリを強制終了、またはfinallyのdeleteFileが失敗。その後再起動して記録をすべて削除する。プロセス終了ではJS finallyは完走しないため、作成済みファイルの削除はOSによるCache掃除まで保証されない。現物のCache確認は未実施。
- **影響:** 利用者が共有先へ保存していないものも含め、日記・プロフィール・会話の古い平文コピーがアプリ内に残る可能性。通常UIからの閲覧経路や外部流出は本監査では確認していない。データ削除の範囲と一時コピー管理の問題。
- **確度:** 削除経路不足は高。実機の強制終了・OS清掃タイミングは未確認。
- **最小修正案:** Kiri専用の一時ディレクトリ/接頭辞で管理し、起動時に前回プロセスの孤立ファイルを掃除する。全削除では進行中の共有と競合させず、一時コピーも回収する。cleanup失敗は値を含めず検知できるようにする。利用者が外へ保存したバックアップを消す提案ではない。
- **互換性:** ユーザーが管理する保存先に触れず、アプリ専用Cacheの既知ファイルだけを対象にする。F-01の固有path導入と合わせて回収方針を作る。
- **合格条件:** 孤立した旧一時ファイルを合成して起動/全削除し、該当ファイルが回収される。進行中の共有ファイル、無関係なCacheファイル、外部へ保存したファイルは対象にしない。cleanup失敗で通常の起動や記録読み取りを壊さない。

## 確認範囲と結果

| 対象 | 確認方法 | 結果 |
|---|---|---|
| appLock設定・reducer | D-25、状態遷移読解、既存テスト | boot lock、hide/show境界、時計逆行、背景を挟む認証成功抑止あり |
| lockBoot | 設定→availability→stepの順序、timeout、テスト | availability待ちは1500ms上限。stepとロックの適用は同期。通常経路の新規不具合は確認せず |
| lockAuth | SDK Swift実装、wrapper、テスト | deviceOwnerAuthentication・allowDeviceCredential、reason、Face ID usageあり。Proxy thenable対策あり |
| lockController/lockUi | auth/再認証/enable/disable、700ms settle、テスト | 背景移行後の書き出し続行抑止あり。共有開始前の二重実行はF-01 |
| appState | pause/resume、heartbeat、非同期解除、テスト | 登録前解除を回収。遅延pauseの保守側時刻あり。現物の通知順は未確認 |
| privacyScreen | wrapper/Swift patch/hash検査、テスト | UIKitをmain queueへ集約し、ウィンドウ上の非modal viewを使う。パッチ適用検査あり |
| native | haptics/statusbar/splash、テスト | Web no-op、hideの重複抑止、splash fallbackあり |
| Dynamic Type | D-26、boot script、CSS接続、テスト | iOS限定100〜135%は承認済み。初回同期反映と再測定あり。VoiceOver/実寸は未確認 |
| LockScreen | レイヤー・inert・focus・support分岐 | 本体は保持しつつ操作/読み上げ対象から除外。支援は別routeに移動しない。低高さ/大きい文字はGと統合 |
| ネイティブ保存interface | initStorage/getStorageと起動順を読解 | 詳細な永続化・移行の指摘はBへ委ねる。重複指摘なし |
| AppDelegate/SceneDelegate | 接続・URL/userActivity転送を読解 | CAPBridgeViewController、SceneDelegateProxy結線あり。ネイティブbuildはrootの統合検証へ |
| Bundle ID・最低OS | capacitor.config.ts、Xcode Debug/Release | com.kugainc.kiri.iosで一致。15.5の設定一致。既存データを別IDへ勝手に移す処理なし |
| Info.plist/Privacy manifest | `plutil -lint`、登録テスト | 両方OK。Face ID文言/arm64/manifest Resourcesを確認。理由コードの現行審査適合性はHへ |
| 一時共有ファイル | 実関数＋mock SDK | F-01再現。寿命F-02 |

## 承認済み制約として区別したもの

- D-25の「パスコード未設定・認証プラグイン利用不可時のフェイルオープン」は意図した方針であり、無条件の認証回避として数えない。
- 端末データ/バックアップJSONを独自暗号化しない方針も既決。暗号化導入を本監査の必須修正にしない。
- D-25の「本人が開いた共有シートが背景→自動ロック後にも残る」は明示的に受け入れたリスク。F-01/F-02とは分ける。
- Dynamic Type上限135%と小さい設定で縮めない方針はD-26で承認済み。
- iOSの生体認証画面・パスコードへのfallback・snapshot採取時刻・resume直後の本文露出は、コード/モックだけで実機合格と扱わない。

## 障害検出に関する観察（追加検証候補）

`setPrivacyScreen()`は失敗時falseを返すが、呼出し元effectは戻り値を見ない。`subscribeAppVisibility()`もプラグイン登録失敗を無通知で飲み込む。この条件では設定が有効の表示でも目隠し/自動ロックが動かない。現行の正しいビルドで当該障害が発生した証拠はないため、通常状態の保護が破れているとは断定しない。Hの成果物検査と合わせ、プラグイン欠落/拒否を注入した際に保護状態を利用者へ通知するかをAstraが判断する。

## 検証記録

以下の12ファイル・202テストが合格（2026-11-06）。正常系・モック境界を検証した結果であり、実機検証ではない。

```text
npx vitest run \
  src/lib/__tests__/appLock.test.js \
  src/lib/__tests__/lockBoot.test.js \
  src/lib/__tests__/lockAuth.test.js \
  src/lib/__tests__/lockController.test.js \
  src/lib/__tests__/lockUi.test.js \
  src/lib/__tests__/appState.test.js \
  src/lib/__tests__/privacyScreen.test.js \
  src/lib/__tests__/native.test.js \
  src/lib/__tests__/dynamicType.test.js \
  src/lib/__tests__/backupShare.test.js \
  scripts/__tests__/iosProject.test.js \
  scripts/__tests__/patchPrivacyScreen.test.js

Test Files 12 passed / Tests 202 passed
plutil -lint Info.plist PrivacyInfo.xcprivacy: both OK
```

次の実機検証は、通常のFace ID/再ロック/目隠しだけでなく、書き出し二重タップ→ファイル保存と読み戻し、共有中終了→再起動→全削除、一時Cacheの回収、Touch IDまたはパスコードのみの端末、復帰直後の本文露出、Dynamic Type変更を含める。
