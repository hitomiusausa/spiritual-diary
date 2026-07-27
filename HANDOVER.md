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

## 検証済み

```text
npm test                 4 files / 18 tests passed
npm run lint             errors 0、<img>最適化 warning 1件
npm run build            success
npm audit --omit=dev     vulnerabilities 0
```

## まだ着手していない重要項目

1. 四柱推命の専門家・外部命式表との照合ケース拡充
2. `/api/analyze` と `/api/chat` の認証、レート制限、利用量監視
3. チャットの購読状態チェックとStoreKit/RevenueCat連携
4. サーバー側entitlement判定
5. プライバシーポリシー、利用規約、サポートページ
6. iOSの器、App Store素材、実機iPhone QA

## 次に進める順番

1. APIのレート制限・安全性・購読境界を固める
2. 四柱推命の境界ケースを検証し、仕様を承認する
3. 規約・プライバシー・サポート文面を作る
4. iOS化と課金を実装する
5. 実機QA後にApp Store提出準備へ進む

## 開発コマンド

```bash
cd /Users/usausagi/Documents/Playground/spiritual-diary
npm install
cp .env.example .env.local
# .env.local に CLAUDE_API_KEY を設定
npm run dev
```

ブラウザは`http://localhost:3000`。分析APIは`POST /api/analyze`、チャットAPIは`POST /api/chat`。
