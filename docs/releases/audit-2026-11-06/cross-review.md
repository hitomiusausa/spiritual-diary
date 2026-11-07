# 保存・復元指摘の独立確認

確認担当: `/root/audit_a_core`。2026-11-06、基準 `aac43b6`。B報告を読んだ後、実モジュールをesbuildでメモリ内bundleし、独立した合成Map/Preferencesで再実行した。コード変更、本番接続、個人データ使用なし。

## 判定

B-01/B-02/B-04/B-05はすべて成立し、誤検出は確認しなかった。

| ID | 独立再現の出力 |
|---|---|
| B-01 | `flushResolved:true / memory:[unsaved,newest] / disk:[newest]` |
| B-02 | `historyAdded:0 / historyTotal:30 / existingKept:29 / first:imported` |
| B-04 | オブジェクト型eventをparseBackupが受入。`[null,{id:valid}]`の履歴に新規保存すると `Cannot read properties of null (reading 'id')` |
| B-05 | `memory:[stale-deleted] / disk:[newest]`。プロフィールのgetだけを失敗させても、正常に読めた最新履歴まで捨てる |

- B-01は「終了直前の数ms窓」というD-22の承認済みリスクではなく、既知の失敗を呼出元が観測できない問題。
- B-02の通常保存30件上限は既定仕様。バックアップ読込まで既存IDを押し出すのは「既存を消さない」という別の約束に反する。
- B-04は可用性・型の問題。Reactがobject childを拒否することをXSS成立と扱わない。
- B-05のロールバックはPreferencesの物理消去を伴わないが、通常UIが古い削除済み内容を出し、保存先が分岐するため、実害のある運用不具合。

## 最小改修で必要なinterface

### 永続化結果

既存の同期 `getItem/setItem/removeItem` と保存キー・JSON形式は維持できる。

- `flushStorageWrites()`で現在の未解決の保存失敗を呼出元へ返す/throwする。`enqueueWrite`のcatchでログへ変換するだけにはしない。
- キー別直列化は維持する。前のrejectで後続writeを実行不能にせず、後続の成功でそのキーの失敗状態を解消する。
- 失敗を記録するならキーと操作/世代だけ。本文やPreferencesの生の例外文をUI/ログへ渡さない。
- 再試行は「そのキーの最新の意図した値/削除」を対象にする。古い失敗writeを後の成功writeの後へ再投入しない。
- `getStorageStatus()/subscribeStorageStatus()`のような観測窓口があれば、プロフィール自動保存・会話effectを全面async化せずに未保存状態を知らせられる。
- 記録保存、バックアップ読込、削除、同意撤回、ロック設定変更は、完了の約束がある箇所でflushを待つ。保存失敗を通信エラーと同じcatchで表示しない。
- WebのsetItem例外もこの表示経路へ含める。localStorageが使えずメモリ保存しかできない場合も、端末へ保存できたと扱わない。

flushを「1回だけPromise.allして終わり」にすると、その間に増えたwriteを取り逃す。現行の安定snapshotまで待つloopは維持するか、操作単位の世代番号で待つ範囲を明確にする。

### 初期化失敗と再試行

- ネイティブでPreferencesのreadが失敗したとき、古いlocalStorageを通常保存先として採用しない。
- `initStorage()`が失敗状態を返す/throwし、呼出元はhydrate・profile自動保存・AI同意/ロック判定の通常画面へ進めない。短い回復画面で再試行できるようにする。
- 再試行できるよう失敗したinitPromiseは解除する。再試行でPreferencesを再読し、成功した場合にだけメモリ窓口を置き換える。
- pendingWritesを失敗のcatchで古いlocalStorageへ適用しない。値を保持して成功後にだけ最新値として適用する。
- Preferences plugin ProxyをPromiseの解決値へ直接渡さない既存対策を残す。
- プラグイン完全欠落でも、移行済みデータの有無を確認できない間は「空の新規端末」と推測しない。初期化前のgetStorage読み取りだけで旧localStorageを画面へ復活させない。

### 非破壊バックアップ

- まず全項目の型・ID・日時・サイズを検証し、全変更案と件数を作ってからsetItemする。UIからparseを通さない `applyBackup` 呼出しでも不正データを入れない。
- 既存IDの内容を優先。取込内の同じIDも一度だけ採用する。追加数は配列length差ではなく実際に採用した新規ID数。
- 上限維持の最小策は、空き件数だけ新規IDを採用して `historySkipped` を返すか、超過を事前に拒否すること。既存30件に新規1件なら、元30件を必ず残す。
- profile/chatを復元するかも変更前に決める。consent/lockをimportしないallowlistを維持する。
- 複数キーへのPreferences書込に原子的transactionはない。flush失敗を成功と言わないことと、既存データを削除しない追加方式を先に確保する。「全キーが必ず同時に保存される」とは約束しない。
- ロールバックを実装する場合、元のraw値を保全し、同時の新しいユーザー操作を巻き戻さないようimportを直列化する。ロールバック自体の書込失敗を無視して「元通り」と表示しない。

## B-04の互換性制約

- 過去の正常レコードには欠けた任意フィールドがある。既存テストも `{id:'a'}` の最小形を使う。必須項目を新規レコード同様に厳格化するだけでは、正常な旧形式まで消してしまう。
- 表示に使う文字列は文字列として検証し、欠けた任意項目に安全な既定値を付ける。未知のデータをJSの `String(object)` で意味不明な文字列へ変えて保存しない。
- 履歴の不正1件を除外して表示を回復する場合も、読込だけで元のrawデータへ空配列を上書きしない。破損を知る手段と原本を保全する手段を用意する。
- プロフィール破損をnullへ変換するだけでは、profileHydrated後の自動保存が空で原本を上書きしうる。回復状態と自動保存の条件を一緒に設計する。
- 現行schemaVersion=1、旧気分値、旧会話40件、birthTime/gender空、古いresultの省略を往復できること。

以上はrootの統合interfaceの助言。任意の追加調査を待つ必要はなく、この4件をAstraへ確定指摘として渡せる。
