# 上流失敗の安全な診断分類（2026-11-07）

明示された追加修正としてcandidateだけに実装。本番へdeployせず、追加のネットワーク / AI送信・秘密値読出しも行っていない。実機の実AI2試行はbuild2であり、調査記録のbuild3表記を訂正した。今回の原因をUIやConsole表示だけから断定しない。

## 保全

変更前の6既存ファイル、対象のみのGit diff、SHA-256台帳を、Git外のprivate `physical-qa-20261107-1153/provider-diagnostics-before/` に保存。ディレクトリ700 / ファイル600。元releaseへのcopyは親担当。

## 実装

- `src/lib/providerFailure.js`: HTTP statusを基本とした固定reasonだけを返す。400の組織/workspace spend limitは、既知type・公式の固定接頭句・語末区切りが一致した場合のみ。429のtier capは既知typeと厳密な既知error_codeだけで区別する。任意type/message/detailsを返さない。
- `src/lib/apiRequest.js`: 非2xxエラー本文を既存のbounded readerで最大16 KiB、既存のfetch/本文共通deadline内だけ読む。生データは戻り値dataへ渡さない。受信済みresponseを保持し、外側Promise.raceが本文deadlineで先にrejectしても元statusの分類を失わない。abort時にreaderをcancelし、期限・listenerも解放する。
- `src/app/api/analyze/route.api.js` / `src/app/api/chat/route.api.js`: ログへ元upstream statusと固定reasonだけを追加。端末には従来の一般的な502を返す。analyzeのno usable textもchatと同じ固定語`upstream_unusable`にそろえた。request ID・キー・prompt・生本文をログへ追加していない。

これは観測可能性の修正であり、実機の上流400を解消したという証拠ではない。全体deadlineは既存のanalyze60秒 / chat30秒を維持する。

## 確認

`npm test -- src/lib/__tests__/providerFailure.test.js src/lib/__tests__/apiRequest.test.js src/lib/__tests__/apiRoutes.test.js`: **3 suites / 82 tests PASS**。

既知のspend/tier分類、near-matchや任意語からの推定禁止、未認識type、不正JSON、実byte超過、偽/過大Content-Length、body停止中の外側deadlineとstream取消しを確認。両routeで実際のdeadline定数をfake timersで進め、元400が一般502＋`provider_request_invalid`で記録され、504へ化けないことも確認した。合成秘密値をkey・prompt・日記・上流message/type/request_id/stop_reasonに入れ、全ログと端末応答へ出ないことを確認。

上記7 source/testファイルの `npx --no-install eslint ...` は **PASS**。全test / 全lint / CF buildは親担当。デプロイ・本番AI・実機の成功→保存の再確認は未実施。

## 変更ファイル

1. `src/lib/providerFailure.js`（新規）
2. `src/lib/apiRequest.js`
3. `src/app/api/analyze/route.api.js`
4. `src/app/api/chat/route.api.js`
5. `src/lib/__tests__/providerFailure.test.js`（新規）
6. `src/lib/__tests__/apiRequest.test.js`
7. `src/lib/__tests__/apiRoutes.test.js`
8. `docs/releases/audit-2026-11-06/analyze-upstream-400-investigation.md`
9. `docs/releases/audit-2026-11-06/provider-diagnostics.md`（新規）
