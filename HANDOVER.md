# HANDOVER.md — Kiri 現在地

最終更新: 2026-07-28

新しいセッションでは、まず`CLAUDE.md` → `DECISIONS.md` → `HANDOVER.md`の順に読む。詳細な履歴は`docs/HANDOFF-2026-07-28.md`と`docs/PROJECT_STATUS.md`にある。

## 現在の場所

- 正規リポジトリ: `/Users/usausagi/Documents/Playground/spiritual-diary`
- ブランチ: `agent/consolidate-spiritual-diary`
- GitHub: `https://github.com/hitomiusausa/spiritual-diary`
- 最新状態: 作業ツリー clean。直近のドキュメント変更はGitHubへpush済み。

## できていること

- 年・月・日の選択式を含む基本情報入力と、次回起動時の復元
- 気分・出来事・直感の日記入力
- 四柱、日/月/年/時運、大運、テーマ別スコアの算出
- キーワード＋Kiriの具体的な説明による今日のヒント
- Kiri人格を共有した分析文と、結果文を文脈にしたチャット開発プレビュー
- 占い履歴（最大30件）とチャット履歴（最大40メッセージ）の端末内保存
- 同日・同一条件での分析結果の安定化
- モバイル向けの静かな夜色UI、絵文字表示から線画アイコンへの変更
- APIの第一段階保護（D-08）: IP別レート制限、JST日次クォータ、チャットの`KIRI_CHAT_PREVIEW`ゲート＋entitlementスタブ。403/429時はチャットUIがKiriの言葉で案内

## 検証済み

```text
npm test                 6 files / 33 tests passed
npm run lint             errors 0、<img>最適化 warning 1件
npm run build            success
npm audit --omit=dev     vulnerabilities 0
```

APIの403（プレビュー無効）、429（レート制限・Retry-Afterヘッダ付き）、プレビュー有効時の通過は、`next start`をポート3999で立ててcurlで実挙動を確認済み（2026-07-28）。

## まだ着手していない重要項目

1. 四柱推命の専門家・外部命式表との照合ケース拡充
2. `/api/analyze` と `/api/chat` の認証（レート制限・日次上限はD-08で第一段階済み。永続的な利用量監視は未実装）
3. チャットの購読状態チェックとStoreKit/RevenueCat連携（`checkChatEntitlement()`内に実装する）
4. プライバシーポリシー、利用規約、サポートページ
5. iOSの器、App Store素材、実機iPhone QA

## 次に進める順番

1. 四柱推命の境界ケースを検証し、仕様を承認する
2. 規約・プライバシー・サポート文面を作る
3. iOS化と課金を実装する（entitlementはD-08のスタブに接続）
4. 実機QA後にApp Store提出準備へ進む

## 開発コマンド

```bash
cd /Users/usausagi/Documents/Playground/spiritual-diary
npm install
cp .env.example .env.local
# .env.local に CLAUDE_API_KEY を設定
# チャットを使うなら KIRI_CHAT_PREVIEW=1 も設定（未設定なら /api/chat は403）
npm run dev
```

ブラウザは`http://localhost:3000`。分析APIは`POST /api/analyze`、チャットAPIは`POST /api/chat`。
