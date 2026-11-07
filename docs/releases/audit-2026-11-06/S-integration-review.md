# S 保存結線の独立レビュー

2026-11-06（再開後23:13 JST確認）。担当 `/root/audit_a_core`。SpiritualDiaryのroot変更と保存moduleの接続をレビューした。共有UIは編集していない。

## 確認できたこと

- native init failureはboot errorへ留まり、profileHydratedを立てず、旧localStorageを表示/保存先にしない。もう一度読み込む操作で失敗initPromiseを解消した新しい試行へ進む。
- 起動時にprofile/history/chatを検査してからdataIssuesをstateへ写す。profile破損はautosaveをスキップし、保存moduleも原本への空上書きを拒否する。
- 同意、lock設定、履歴保存、import、削除は必要キーのflushを待つ。任意cacheのwrite failureだけで同意/lock/履歴の保存を失敗扱いしない。
- importはデータmoduleが全incomingを事前検証し、既存IDを残す。上限で取り込まない件数をUIへ示し、複数キーの部分失敗を完全復元と表示しない。
- retrySavingは成功後にprofile/consent/history/chatを再読し、profileの古いUI値を新backendへ空保存することを避ける。
- data recovery exportは通常backupと異なる原本形式。通常exportで破損を検出したcatchもdataIssuesを同期し、原本救出buttonへ到達できる。
- 削除/保存失敗は持続的なnoticeと再試行導線があり、誤った完了文を出さない。全削除中の共有/importとの競合はbusy条件を確認する。
- 同意撤回失敗はconsent moduleのsession revocationでも送信を止める。aiConsent表示だけに依存していない。

## ピアレビューで見つけ、S moduleを修正した点

### Web quota失敗後のbackup救出

最初のWeb facadeは、書込失敗時のgetItemが旧backendを読むため、rootが案内するbackupに未保存の新記録が入らなかった。Webも最新write/removeをoverlayへ保持し、旧永続コピーを変えずに未保存内容を通常backupから救出できるように修正。

実回帰: `saveHistory(new)`がquotaでthrowした後も、`buildBackup(getStorage()).history`はnew+oldを含み、localStorageの実値はold。retry成功後だけnew+oldが永続化される。成功後はoverlayを解除し、その後のbackend変更が読める。

### memory sessionの復帰先に原本があった場合

「retryでメモリを必ず捨てる」は再現しなかった。メモリのwriteはすべてfailed intentとなり、resolver交換前に再実行される。ただし、復帰したlocalStorageに未読の古い原本があるとそれを上書きする別の問題が成立した。

修正後は、復帰時に全failed keyを事前確認する。原本が存在し、最新意図と異なれば`storage_recovery_conflict`で全再試行を止める。新原本・メモリ上の最新記録・削除意図のいずれも捨てない。rootも専用の案内を出す。

## rootへ伝達した結線修正

以下の2箇所はrootが修正し、その後のソースで反映を確認した。今回の保存結線レビューで未解消のコード上のblockerは残っていない。

1. **import失敗catchのprofile再同期:** nativeの部分失敗でmemoryにはimported profileがあるがUIは空のまま、dataIssuesのstate更新がautosaveを再実行すると空profileで上書きしうる。catchでもcurrent storageのprofileをUIへ再同期する修正を確認した。
2. **明示削除後のdataIssues再同期:** quarantineされたhistoryを明示全削除した後も古いdataIssues表示が残る。成功時にmoduleの現状をstateへ写す修正を確認した。

## 検証範囲

保存関連9ファイル・104テスト合格。担当source/testsのeslint合格。実backendを模した失敗・再試行・原本保全・実backup救出を含む。

本レビューはコード/保存moduleの合成回帰で、ブラウザの操作再現や実機永続化の合格ではない。rootのUI再現、本番を使わないWebKit確認、変更後iOS実機の保存→完全終了→復元は別ゲートとして残す。
