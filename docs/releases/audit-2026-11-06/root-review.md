# 統合UI・保存結線の独立レビュー

担当: `/root/fix_api_safety`。2026-11-06。root/S/Tの修正差分を読解し、実害を伴う結線だけを確認。以下は**修正途中の候補で見つけた事項**であり、rootへ共有して修正中。最終合格は修正後の再確認を必要とする。

## 修正が必要な事項

| ID | 優先 | 関連指摘 | 修正途中で観測した問題 | 合格条件 |
|---|---|---|---|---|
| R-01 | P1 | B-04/F-01 | rootの修復用filenameは`recovery-kiri-backup-…`、Tのネイティブ書出しは`kiri-backup-…`しか許可せず、iOS原本救出が必ず失敗する | root/Tの厳密な既知patternを一致。通常・修復用を書出せ、cleanupも対応。パス注入・他Cache削除は不可 |
| R-02 | P1 | A-05 | 90秒deadlineが履歴flush中に発火すると、flush後に霧をオンにしてからtimer内current判定で止まり、loading画面と霧だけが残る | 通信/json完了でnetwork期限を終えるなどフェーズを分離。期限直前応答→遅いflushで、結果または明確な回復画面へ戻る。霧が残らない |
| R-03 | P1 | B-04 | bootがchatを読まずにdataIssuesを確定。chatだけ破損していると、後から検出されてもroot状態へ反映されず修復用原本の導線が出ない | 初期化時にバックアップ対象3キーを確認し、書出し失敗でもissue状態を同期。chatのみ破損から原本を書出せる |
| R-04 | P1 | B-01 | Web容量超過で新しい履歴setが失敗すると、getItem/buildBackupは旧backendだけを読む。未保存の読み解きをバックアップへ救えない | Webも最新の保存意図をメモリ/backupへ反映し、旧永続原本を保持。再試行・書出し・再起動で意味が一致 |
| R-05 | P1 | C-03 | 同意accept→flush待ち中に拒否/Escapeで閉じても、flush後acceptが無条件analyzeを続けて送信する | 同意操作の世代/キャンセルを導入。拒否・撤回・unmount後の完了を無効化し、pendingで立てた同意もセッション上取り消す。拒否後のfetchなし |
| R-06 | P2 | D-01/A-02 | 危機判定が入力上限検証より後にあり、長文の危機日記ではエラーだけで支援が出ない | 上限超過でも端末内判定と支援が可能。送信は禁止したまま、一般文への変更で不要な支援を残さない |
| R-07 | P2 | B-01/G-02 | 同意保存失敗や削除失敗を外側storageNoticeだけに表示すると、native dialogの背面/inert内へ隠れる | 同意dialog内のエラー、履歴dialog内の削除失敗等、最上位の操作画面で失敗を読める。未保存・未削除を成功と誤認させない |

### R-04の独立実行証拠

Sの実`storage/history/backup`をesbuildで一時CJSへまとめ、既存`old`とsetItemで容量例外を返す合成localStorageを使用した。`saveHistory(new)`を試行後:

```json
{"failed":["spiritual-diary.history.v1"],"visible":["old"],"exported":["old"]}
```

`/tmp/kiri-root-peer-data.cjs`。実データ・外部APIは使用していない。Nativeはメモリ先更新なので同じ欠陥ではない。

### 再現条件と確度

- R-01: filenameと実際の正規表現の直接不一致。T/rootが`kiri-recovery-backup-…`へ統一中。
- R-02: fetchが期限直前に完了し、Preferences flushが期限を跨ぐ場合の制御フローで確認。実機の90秒待ち測定はしていない。
- R-03: chatのissueは遅延読込時にWeakMapへ登録されるが、rootのdataIssues stateはboot/profile/history等の更新だけというデータ経路を確認。
- R-05: acceptのawaitとdeclineの無効化欠如を確認。実機のボタン連打は未実施で、rootの回帰QAへ引き継ぐ。
- R-06/R-07: 条件順とnative dialogの操作境界を確認。修正後のWebKitで実画面/キーボード確認が必要。

## 問題を確認しなかった範囲

- 起動のPreferences失敗で通常hydrateへ進まず、原本を保った再試行画面を出す。profile破損時は自動保存を抑止する構造。
- 同期の保存意図と永続化のflushを分け、対象キーを指定して履歴・削除・同意・ロック設定を確認する方針。
- `ModalFrame`はnative dialogで最上位だけを操作対象にし、ロック中は下層dialogを閉じて保留する。`onClose`なしのロックはEscapeでも解除しない。
- JSXの履歴/詳細/削除をrender関数として呼び、更新ごとの再マウントを避ける。説明popupは外へhoistされている。
- JST暦日差のbiorhythm純関数と、分析開始nowの固定。履歴の日時を書換えず、hasBirthTimeに基づいて精密化の説明を分ける。
- Tの購入は固定商品ID/P1M、取得要求世代、採用snapshotのtoken/価格/商品と購入packageを結び付ける。旧取得の完了・失敗後の古いpackage購入を防ぐ。
- Tのチャットはcancel/unmount世代を無効化し、ID取得・fetch・body読込を同じ期限に収める。失敗案内は通常会話へ混ぜず入力を保持。削除後の遅い成功/失敗を採用しない。
- Tの一時ファイルは操作固有pathと同期in-flightで分離。起動/削除cleanupはactive exportを待ち、厳密なアプリ所有pattern以外を削除しない。

## 残る検証

rootが上記結線を修正後、同意accept中止/保存失敗、通信期限と保存の境目、Web保存失敗→書出し、chatだけの破損→原本救出、dialog重なりとロック復帰を確認する。Tの実購入・実共有・OS終了・VoiceOverは別の端末/外部ゲート。コード読解と合成試験を実機合格と扱わない。

## 23時台の静的再確認

rootの修正後ソースでR-01/02/03/06/07への対処を確認した。R-04はSのWeb overlayが追加され、未保存値をgetItemから読める構造になっている。R-05は`createConsentFlow`の操作世代でpendingキャンセルを無効化する対処が入った。これらはソースの再確認であり、root/Sの回帰テスト・最終WebKit確認へ合格を委ねる。

R-05の追加確認条件: acceptのrecordは成功してflushが失敗した後、pending=falseになってから「今はやめる」を押す場合も、メモリの同意が有効なまま残らないこと。失敗後のcancelがpendingだけを条件にrevokeを省く実装だと、次の読み解きで再同意を飛ばせる。この点をrootへ追加共有した。

Tの購入/会話/一時ファイルを再度読解し、固定ID/P1M・採用snapshot・キャンセル世代・送信削減・active path保護に新規P1は確認しなかった。`cleanupInFlight`時のexport戻り値`busy:true`は、rootで利用者自身の取消と区別して表示するようP2の表示整合として共有した。破壊や誤課金の指摘ではない。
