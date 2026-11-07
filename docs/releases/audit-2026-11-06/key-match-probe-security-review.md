# 限定key比較probeのセキュリティレビュー（2026-11-07）

API / safety担当が、Git外privateの`key-match-probe/handler.mjs`、`handler.test.mjs`、`prepare.mjs`を読み取りレビュー。秘密値・auth-private.json・config.mjsの実値は開かず、ファイル権限はstatだけで確認した。コード編集・deploy・本番probe / AI呼出しは行っていない。

## 結論

確認範囲にデプロイを阻止すべきP0/P1の実問題は見つからなかった。これは限定的な静的・ローカル検証の結果であり、実行承認ではない。probeの本番deployとkey変更は行われていない。

- 受付は固定pathのPOSTのみ。Bearer tokenは256bit乱数、形式検証後にSHA-256の固定長比較。無認証・誤認証・期限切れは404。失敗時に元APIへfall-throughしない。
- 認証後に既存bindingをhash比較し、返す値は`keyConfigured / matchesExpected`のbooleanだけ。本文を解析せず、token / key / hash / 任意入力を応答・ログへ出すコードは無い。probe自体に外向きfetchは無く、CORS許可も付けない。応答はno-store。
- 通常pathでは元fetchのreceiver / request / env / ctxを保つ。現在の元Workerはplain object default、named exportsの3 Durable Objectを持ち、wrapperのspreadとexport *はその構造と整合する。
- OpenNextの初期化はenvの文字列をprocess.envへ設定するため、probeが比較するCLAUDE_API_KEY bindingは通常APIの入力元と整合する。probe成功はbinding一致の証拠であり、生成成功・結果保存の証明ではない。
- private親 / 対象ディレクトリは700、対象6ファイルは600、symlink無しを確認。

## 検証

担当実行: `node --test handler.test.mjs` **7 / 7 PASS**。一致 / 不一致 / binding欠落・型違い、認証欠落・不正・suffix違い、非POST、期限境界・不正期限、通常APIの透過性、外向きfetch禁止とCORS無しを確認した。実際の秘密値は使っていない。

親担当からの追加結果: explicit configによるdeploy dry-run成功。workerdローカルの6 HTTP確認（synthetic bindingで認証成功・一致false、無認証404、誤token404、GET404、通常ページ200、通常APIの設定欠落503）もPASS。bundle3ファイルに実API key / raw tokenが無いことを親が検査し、local serverを停止した。これを本番実測とは扱わない。

## 運用上の条件

期限は**prepare実行時から10分**。承認・dry-run待ちで切れるため、承認後にtoken / expiryを生成し直す手順が必要。404をkey不一致と解釈しない。期限は受付時に判定し、期限直前に受理した処理が期限後に完了する可能性はある。

expiryはprobeを無効にするが、wrapperのデプロイ自体を自動撤去しない。調査後は監査版の通常Workerへ戻し、既存APIと有効versionを確認する。古い監査前versionへ戻す手順と混同しない。実施・復旧は親担当であり、追加AIやキー再設定はこのprobeに含めない。
