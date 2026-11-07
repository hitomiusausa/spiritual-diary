# 独立照合 C担当によるE/Fの重要指摘確認

2026-11-06。担当 `/root/audit_c_security`。アプリコード変更なし、外部接続なし。報告記述だけでなく実ソースの制御順と依存Share SDKを確認し、元の担当とは別に合成SDK/Filesystemを作って再実行した。全体テストは重複実行していない。

| 指摘 | 独立照合 | 結論 |
|---|---|---|
| E-01 | purchases.js:72-75,181-201、kiriTalk.js:43-57。monthlyなし、先頭にdifferent.annual/P1Yを返すSDKでoffering取得→purchaseChatを実行。実際にpurchasePackageへ同年額商品が渡った | 確認。商品ID/周期の防御がなく、月額と説明した別商品へ進める。RCの誤設定が成立条件で、現在のストアで誤販売済みとは判定しない |
| E-02 | purchases.js:184でlastPackage更新→trialFor awaitの順序、SpiritualDiary:480-485と540-552の並行呼出を確認。Aのtrial判定を保留→B完了→A完了とした | 確認。最後の表示¥480、purchasePackageへ渡った商品価格¥600。異なる応答を返す設定/価格変更が成立条件。固定応答なら価格差は出ない |
| F-01 | backupFileNameは日付固定、backupShare.js:24で同path、35でfinally削除。SharePlugin.swift:67-69が2本目を拒否。実関数の1本目shareを保留し2本目を拒否 | 確認。1本目共有は未完了のまま、2本目finally後にファイルがMapから消えた。共有先の読み取り時機で実機影響は異なるが、競合は確定 |

E-02の最小修正は、表示情報と購入packageを同じ採用済みスナップショットへ結びつけること。単にlastPackageの代入をawait後へ移すだけではUI側の古い応答採用が残り得るため、取得世代または同時取得の共有も合わせて扱う。

F-01はUIのdisabledだけでは同じフレームの連打や別呼出経路を守れないため、同期in-flightガードと操作固有の一時pathで防ぐ。既存の認証/背景移行抑止の設計を維持する。

E-01は別の固定商品へフォールバックしない検証を行い、取得失敗時に古いlastPackageを黙って再利用しないことも合格条件へ含める。
