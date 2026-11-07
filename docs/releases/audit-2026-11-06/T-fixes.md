# T 修正記録: 購入・会話・ネイティブ書出し

担当 `/root/audit_b_data`。Astraの最終裁定に従って隔離candidateへ実装。実API、実購入、実ユーザーデータ、配布、コミットは実行していない。

## 対応と結線契約

| 対象 | 変更 | root側の結線 |
|---|---|---|
| E-01 | 固定商品IDかつsubscriptionPeriod=P1Mだけ選択。別商品/別周期/欠落時は購入不可 | 既定商品/価格の変更なし |
| E-02 | getChatOfferingが採用したopaque purchaseTokenを返し、購入時に表示snapshotと一致するか検証。trial判定の遅い古い応答は新snapshotを上書きしない。取得失敗で旧packageを無効化 | `handlePurchase(displayedOffering=talkOffering)`→`purchaseChat(displayedOffering)`。PaywallはonPurchase(offering)を渡す |
| E-03 | 購入直後のnot_entitledを反映待ちと案内。入力を残し、再購入や自動再送を促さない。60秒cache変更/回避なし | chatへ`purchasePending`、`onChatSuccess={() => setPurchasePending(false)}` |
| B-03 | request世代+AbortControllerで削除/閉じる/unmount後の応答を無効化。送信中のuser文はpending表示し、成功時だけuser+replyを会話履歴へ保存 | 全削除時にもchatを閉じる/再マウントし、旧instanceを無効にする |
| A-05関連 | ID取得/fetch/body読込を同じ45秒期限で打切り。取消操作で入力を残す | API上流30秒との順序を維持 |
| D-01/D-03 | 失敗案内を独立noticeへ。失敗/拒否/空応答は通常履歴へ保存/再送しない。入力保持。危機文の失敗/同意拒否/過大入力では端末内SupportCard | 同意v2はA担当、分析失敗の支援はroot |
| C-04 | 端末1000件と送信12件を分離。role/content以外の内部情報を除き、nicknameと必要なentry/result文だけ送信 | inputContractの上限と共有 |
| G-02/G-04関連 | Paywall/chat/会話削除確認を共通ModalFrameへ。独自Tab/Escape処理を除去。chat入力に安定したlabel/id。大きい文字・低高さでは本文領域を縮め操作部を維持 | ModalFrame/LockContext/globalsはroot |
| B-01関連 | chatのsave/delete後flushを待ち、失敗を明示。最新の未保存意図を保持して保存だけ再試行。再試行でAIへ再送しない | storageのflush/retry契約はS担当 |
| F-01 | ネイティブ関数入口で同期in-flight guard。操作固有Cacheサブフォルダで利用者向け日付ファイル名を維持。write/share失敗や取消でも自分のファイルだけ回収 | rootの書出しボタンもbusyで直列化 |
| F-02 | 起動/全削除向けcleanupを追加。既知の旧日付ファイルと専用領域の既知ファイルだけ対象。共有中/cleanup中はpending。削除失敗を件数で返す | 起動時nativeのみ呼出、全削除時はexport中を拒否/待機しcleanup結果を確認 |

ネイティブ公開API:

```js
isBackupExportInProgress() // boolean
exportBackupNative({ json, fileName, title, deps? })
// => {shared:boolean, busy?:true, cleanupFailed?:true}
cleanupBackupCacheNative({ deps? })
// => {removed:number, failed:number, pending:boolean}
```

`cleanup`はDirectory.Cacheだけを扱い、外部保存先へ触れない。ルートは`kiri-backup-YYYY-MM-DD.json`完全一致、専用領域は32桁hex操作フォルダ内の同形式だけ。active共有中は何も消さずpendingを返す。空フォルダ以外をrecursiveに消さない。部分書込み失敗のファイルも回収を試み、回収できなければ次回cleanupへ残す。

## 変更ファイル

- `src/lib/purchases.js`、`kiriTalk.js`、`backupShare.js`。
- `src/lib/chatRequest.js`（送信世代/中断/最小payload）。
- `src/components/PaywallSheet.jsx`、`KiriChatPanel.jsx`。
- 対応テスト: purchases、backupShare、chatRequest。既存kiriTalkテストも実行。

## 実行した検証

`npx vitest run src/lib/__tests__/backupShare.test.js src/lib/__tests__/purchases.test.js src/lib/__tests__/kiriTalk.test.js src/lib/__tests__/chatRequest.test.js`

**4 files / 99 tests PASS**。対象ファイルのESLintもPASS。

追加した回帰条件:

- 商品ID/周期不正、価格改変、古いsnapshot、取得失敗で旧商品が購入されない。
- 遅いtrial応答と新しい価格応答の順序を逆転させても、表示と購入が一致する。
- 二重書出し、共有保留中cleanup、取消、共有失敗、部分write失敗、回収失敗、既知/未知Cacheの混在。
- 削除/新送信/古いfinishの世代関係、無期限に止まったID/本文Promiseの打切り。
- 1000件の保存済み会話を変えず12件だけ送信し、内部fieldやsystem案内を送らない。

## 残る統合・端末確認

- rootの画面結線を含むWebKitで、B-03の元の成功/503競合、入力保持と別notice、危機失敗支援、全削除・モーダル重なりを再現する。
- 購入モックでsnapshot引渡しと購入直後反映待ちを確認する。実購入/復元/失効は外部公開ゲートのまま。
- iOS共有/保存したJSON読み戻し、共有中強制終了→次回起動cleanupは実機確認。モックMapでの回収テストを実機合格とは扱わない。
- Safariソフトウェアキーボード、VoiceOver、ネイティブSafe Areaの実際の到達性は未確認。
- 全体テスト/ビルド/成果物/依存更新はrootが実施する。担当Tは共有node_modulesやlockを変更していない。


## 統合時の追加修正: 回復用書出し名

peer reviewでrootの回復用JSON書出し名とネイティブ関数の厳密な許可名の不一致を検出。rootと`kiri-recovery-backup-YYYY-MM-DD.json`へ契約をそろえ、通常名とこの回復名だけを書出し/孤立回収の対象にした。似た別名や他ファイルは対象外。回復名の書出し→共有→回収と、次回孤立回収の回帰テストを追加した。
