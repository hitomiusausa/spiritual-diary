# HANDOVER.md — Kiri 現在地

最終更新: 2026-07-28

新しいセッションでは、まず`CLAUDE.md` → `DECISIONS.md` → `HANDOVER.md`の順に読む。詳細な履歴は`docs/HANDOFF-2026-07-28.md`と`docs/PROJECT_STATUS.md`にある。

## 現在の場所

- 正規リポジトリ: `/Users/usausagi/Documents/Playground/spiritual-diary`
- ブランチ: `agent/consolidate-spiritual-diary`
- GitHub: `https://github.com/hitomiusausa/spiritual-diary`
- 最新状態: 作業ツリー clean。2026-07-28のD-08〜D-12（API保護・バックアップ・四柱照合・法務ページ）までGitHubへpush済み。

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
- 四柱推命の境界ケース独立照合（D-10）: 日柱連続性・立春前後・節入り前後・0時/夜子時・時柱境界がすべて古典ルール手計算と一致。流派方式3点を仕様承認済み
- 日記データのJSONバックアップ（D-09第一段階）: スタート画面から書き出し/読み込み。復元はidマージで既存データを消さない。実ブラウザでエクスポート/インポート往復を確認済み
- 閲覧の課金境界を確定（D-11）: 日記履歴は無料、Kiri会話ログの閲覧は有料側。実装は課金導入時にチャットパネルごとゲート
- プライバシーポリシー（/privacy）・利用規約（/terms）・サポート（/support）ページ。スタート画面下部からリンク。運営者名と問い合わせ窓口はプレースホルダのまま（公開前に要記入）

## 検証済み

```text
npm test                 7 files / 53 tests passed
npm run lint             errors 0、<img>最適化 warning 1件
npm run build            success
npm audit --omit=dev     vulnerabilities 0
```

APIの403（プレビュー無効）、429（レート制限・Retry-Afterヘッダ付き）、プレビュー有効時の通過は、`next start`をポート3999で立ててcurlで実挙動を確認済み（2026-07-28）。

## ローカルで進められる作業はここまで完了（2026-07-28）

以降はすべてユーザーの決定・外部リソースが先行条件になる。

- **運営者表記・問い合わせ窓口**: 「後で決める」で保留中。確定したら`/privacy` `/terms` `/support`のプレースホルダを差し替える
- **Webデプロイ**: 「まだデプロイしない」で保留中。/api があるためNodeホスティングが必要（Vercel推奨済み）
- **iOSの器**: Capacitor方式で確定（D-12）。着手はWebデプロイ後。課金はRevenueCat→`checkChatEntitlement()`接続
- **四柱推命の人による照合**: 独立演算照合はD-10で済。専門家または外部命式表での確認を公開前に推奨
- **API認証・永続的利用量監視**: レート制限・日次上限はD-08で第一段階済み。本格版は本番インフラ決定後
- **実機iPhone QA・App Store素材**: iOS着手後

## デプロイを決めたあとの順番

1. 運営者名・問い合わせ窓口を確定して法務3ページに記入する
2. Webを公開し、実環境で入力→分析→結果→履歴→バックアップを通し確認する
3. Capacitorの器と課金を実装する（entitlementはD-08のスタブに接続、閲覧境界はD-11、ネイティブ保存はD-09第二段階）
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
