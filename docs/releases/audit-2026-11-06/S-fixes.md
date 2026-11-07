# S 保存・復元の修正記録

2026-11-06。Astra裁定B-01/B-02/B-04/B-05を担当。対象はstorage/history/backup/chatHistory/dataIntegrity/analysisCacheと担当テストのみ。共有UIはrootが結線する。Git外の基準バックアップは00-baselineの場所にある。

## 変更

- **B-01:** 同期get/set/removeを維持しつつ、永続化の状態・完了・再試行を追加。Preferencesのrejectを状態へ記録し、flushで失敗を返す。失敗したchainで後続を止めず、同じキーの最新意図だけを再試行する。Webもラッパーで容量例外を観測し、メモリfallbackを永続成功と扱わない。本文やraw例外を状態へ含めない。Webの失敗した最新write/removeはoverlayに保持し、救出backupで未保存の新記録も取り出せる。永続原本は保つ。
- **B-05:** Preferencesのkeys/get/移行コピー/移行印失敗で初期化をrejectし、失敗したinitPromiseを解除して再試行可能にした。古いlocalStorageへ降格せず、初期化前のgetも旧データを再表示しない。pendingWritesは成功後に適用。元のPreferencesと移行元を消さない。プラグインProxyのthen対策を維持。
- **B-02:** backupの全incomingと既存保存先を事前検証してから書く。既存ID・内容を保持し、空き枠にだけ新規の一意IDを取り込む。追加・上限スキップ・重複を別に計数する。profile/chatの既存優先、consent/lock除外、schemaVersion=1を維持。
- **B-04:** 共有validatorで、旧省略フィールドを許容しつつ、null/object文字列欄/不正日時/過大形式等を検出。読込は安全な表示用subsetを返し、元rawは上書きしない。破損キーへの通常保存・通常importをブロック。profile破損をnullにした後の空自動保存もsaveProfile自身で防ぐ。通常backupが破損を黙って除外しないよう失敗させ、別形式の原本救出JSONを用意した。
- **B-04追加の同じ危険経路:** 現在結果画面へ直接渡す端末cacheのpayloadも型検証し、object本文・不完全hints/saju・不正score/日時をcacheから除外する。履歴には触れない。
- 保存済みの長文や旧気分・最小`{id}`レコード・任意の未知レコードフィールドを切り詰めない。チャットの既存長文も次の保存で1800字へ再切断しない。新規保存の通常件数上限は既定どおり。

## root/T向けinterface

```js
getStorageStatus() // stable snapshot: { phase, mode, pendingKeys, failedKeys }
subscribeStorageStatus(listener) // returns unsubscribe; changes only, no immediate callback
await initStorage() // native read/copy/marker failure -> StorageInitError; retry same call
await flushStorageWrites({ keys: [keyA, keyB] }) // optional keys; default all
await retryStorageWrites() // latest failed intents only, then flush
```

- phase: `idle|initializing|ready|error`。mode: `unknown|native|web|memory`。memoryは永続化不能。
- flush failure: `StorageWriteError`、code=`storage_write_failed`、`failedKeys`。キー別flushで任意cacheの失敗と同意/記録などの完了を分けられる。
- memory→Web復帰時は全対象を事前確認し、未読の原本と異なる値/削除があれば`storage_recovery_conflict`（`conflictKeys`）で停止する。元の永続領域も、この画面の最新意図も残す。
- init failure: code=`storage_init_failed`。rootはhydrate/profile自動保存を始めず、回復画面から再試行する。
- `dataIntegrity.js`: `getDataIssues(storage)`→`[{key,reason}]`、`hasDataIssues(storage)`、`DataRecoveryRequiredError`（code=`data_recovery_required`）。通常保存は原本救出が必要なキーを例外で示す。
- `buildRecoveryBackup(storage)`はapp=`spiritual-diary-recovery`の別形式。profile/history/chatのraw文字列だけを含め、lock/consent/購入IDを選ばない。通常parseBackupはこの救出形式を自動で受け入れない。
- `applyBackup()`は同期の事前検証・書込計画で、結果は`{historyAdded,historySkipped,historyDuplicates,historyTotal,profileApplied,chatRestored}`。rootは書込後に対象キーのflushを待ってから完了表示。

## 検証

対象9ファイル・104テスト合格。担当source/testsにeslintエラーなし。

```text
npx vitest run
  src/lib/__tests__/storage.test.js
  src/lib/__tests__/storage.capacitorProxy.test.js
  src/lib/__tests__/history.test.js
  src/lib/__tests__/backup.test.js
  src/lib/__tests__/chatHistory.test.js
  src/lib/__tests__/deleteAll.test.js
  src/lib/__tests__/profileStep.test.js
  src/lib/__tests__/dataIntegrity.test.js
  src/lib/__tests__/analysisCache.test.js

Test Files 9 passed / Tests 104 passed
```

回帰にはnative set/remove failure→retry→再初期化、後続writeで回復、Webquota/fallback、key別flush、read/marker/copy失敗→再試行、既存30+新規1、29+重複/複数import、invalid後段の事前拒否、null/objectフィールド/不正日付/過大文、破損raw不変と救出、旧省略/長文往復、cache異常payload、Web失敗writeの実backup救出、失敗remove、復帰時に見つかった原本との競合事前停止を含めた。

旧テストの「永続化失敗でもflush成功」「native初期化失敗で旧localStorageへ降格」「破損importを黙って除外」「Web窓口とlocalStorageのobject同一性」は、今回直す振る舞いに合わせて変更した。通常の保存・移行・Proxy・上限・旧形式の検証は維持した。

## 限界と統合確認

- Preferencesは複数キーの原子的transactionを持たない。partial persistenceの失敗を成功扱いしないことが必要。自動rollbackで完全に元へ戻るとは約束しない。
- 読込quarantineは原本を守る措置であり、元rawの自動修復・自動消去はしない。rootは原本救出と状態説明を提示し、明示的に元データを修復/入替する場合にだけquarantine解除を扱う。
- ブラウザUIの保存失敗表示、iOSの実永続化と完全終了後の復元、容量不足の実機挙動は統合/端末ゲート。モック104テストを実機合格と扱わない。
- 同意撤回、ロック設定、削除の完了表示はroot/T/Aが新しいflush/状態通知へ結線する。
