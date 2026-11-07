# G-05 読み込み画面の実機レイアウト修正

- 日付: 2026-11-07
- 対象: candidate の `src/components/SpiritualDiary.jsx:1817`
- 根拠: root が iPhone 12 mini の実機で、読み込み中の「中止して入力へ戻る」ボタンが見出しの右に並び、レイアウトが崩れることを確認した。
- 原因: loading ステップの外側コンテナが `flex items-center justify-center` のため、見出しを含むコンテンツと中止ボタンが既定の横方向に配置されていた。
- 修正: 同コンテナのクラスに `flex-col` を追加した。製品コードの変更はこの1行のみ。見出しと中止ボタンを縦に並べ、既存の `mt-6` を縦の間隔として適用する。

## バックアップ

変更前に Git 外の次のファイルへコピーし、SHA-256 の一致を確認した。

`/Users/usausagi/Documents/AI_Playground/spiritual-diary-qa/physical-qa-20261107-1153/G05-loading-before/SpiritualDiary.jsx`

- 変更前 SHA-256: `d1adb4b991a064bc85280efb064b994181acdeaf99e2217222492b08515cca10`
- 変更後 SHA-256: `5631b374b6668b1910436764d5f048dbe55759afc67b1c0ce31f435dacc01477`

## 確認

- バックアップとの差分が `flex-col` の追加1行だけであることを Python の完全一致検証と unified diff で確認した。
- `./node_modules/.bin/eslint src/components/SpiritualDiary.jsx`: 終了コード0、指摘なし。
- root の依頼に従い、単体テスト追加・ビルド・元 release へのコピーは実施していない。修正後の実機描画確認は root 側の再ビルド・実機 QA で行う。
