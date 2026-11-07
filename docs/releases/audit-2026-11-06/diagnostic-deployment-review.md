# 診断反映前レビュー（未反映）

## 現在の問題と確定範囲

iPhone実機の合成入力2回はAnthropic upstream HTTP400。本番の旧実装は理由本文を破棄しているため拒否理由は不明。Consoleの表示中組織は残高あり・支出上限未到達だが、Kiri本番キーとの対応は確認できていない。Astra判定はH-02 P1公開阻害を維持。原因確定・分析成功とは扱わない。

## 準備した変更

`providerFailure.js`で既知のHTTP status/type/公式spend-limit接頭句を固定reasonへ分類。`fetchUpstreamJson`は非2xx本文を最大16KiB・既存の全体deadline内だけ読む。不正JSON・過大本文・本文停止でも受信済みHTTP statusを維持する。analyze/chatのログにはstatusと固定reasonだけを渡し、生の本文・message・任意type・request ID・キー・入力を残さない。analyzeの任意stop_reasonログも固定語へ変更。端末への一般的な502案内は維持する。

既知分類に一致しない400は `provider_request_invalid` となる。今回の追加だけで全ての400の詳細原因が分かる保証はない。

## 配布候補の範囲

候補は `candidate` 作業ツリー全体であり、先行した監査修正を含む。診断ログだけの単独差分配布ではない。Web画面・API保存/同意/安全性/課金境界・依存更新も含むため、既存公開Webとアプリの接続先に影響する。本番秘密値・データ・利用上限の変更、TestFlight配布、実購入は含まない。今回のNative端末build3には新しいサーバー診断変更を再同梱していない（サーバー側の変更）。

## 検証

- 全体51 files /824 tests PASS。分類、秘密文字列非出力、非2xx本文停止/不正JSON/byte超過/偽Content-Lengthを含む。
- lint errors0/warnings0。
- Next/OpenNext Cloudflare build成功。
- embedded-env/Web課金混入検査PASS。
- Wrangler4.158.0 deploy --dry-run成功、upload/deployなし。
- 証拠: evidence/provider-diagnostics-*.txt。

## 承認後の実施順と切戻し

1. 現行versionを再確認し、想定 `eb128156-5748-4f31-82dc-925f52dd9ba4` と異なる場合は他者変更を先に確認。新しい既存version情報と設定名の控えをGit外へ保存する。秘密値を読出さない。
2. 承認された候補を本番反映し、新version・公開ページ・静的資産・APIのCORS/入力拒否を確認。個人の日記は使わない。
3. 追加AIは別途承認した合成入力で最大1回。元のprofile/history/lockを保全する。理由分類または成功を確認したら止める。個人データで再現しない。
4. 公開画面/API等の後退があれば、`npx wrangler rollback eb128156-5748-4f31-82dc-925f52dd9ba4 --name kiri` で元versionへ戻し、deploymentsと公開画面を再確認（実施前にversion再確認）。AIが再び400でも原因修正済みとは扱わず、取得できた固定分類で次の対応を決める。
5. 原因解消後も実機の成功→保存→完全終了→復元、VoiceOver/大文字、StoreKit/RevenueCatなどH-02の残条件を満たすまで公開完了にはしない。

本番反映と追加AIは未実施。既存の実AI上限2回を使い切っているため、追加1回は再承認が必要。


## 実施状況の更新

上記は反映前レビューとして保存。ひちゃん承認後、2026-11-07にversion `cf45f762-b4d7-4269-a580-398ed865e095` を本番反映済み。公開/保護試験PASS、追加AIはまだ未実施。最新状態は approved-deployment-2026-11-07.md を参照。
