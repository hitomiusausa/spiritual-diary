# Mind & Energy Note — Kiri

生年月日・出生時刻・その日の気分や出来事をもとに、バイオリズムと四柱推命の結果をKiriがやわらかく読み解くWebアプリです。

## 現在の機能

- 生年月日、出生時刻（任意）、性別（任意）、ニックネームの入力
- 気分・出来事・直感の記録
- `lunar-javascript`による本命（年柱/月柱/日柱/時柱）と日運・時運・月運・年運・大運の算出
- 恋愛・お金・仕事・健康のテーマ別スコア
- 色・数字・方角・距離感の「今日のヒント」
- Anthropic APIを使ったKiriの文章生成
- モバイル向けの入力・ローディング・結果画面

## セットアップ

```bash
npm install
cp .env.example .env.local # まだ存在しない場合は CLAUDE_API_KEY を設定
npm run dev
```

`http://localhost:3000` を開いてください。APIルートは `/api/analyze` と `/api/generate-placeholders` です。

## 技術構成

```text
src/app/page.js                            入口
src/components/SpiritualDiary.jsx          入力・分析待ち・結果画面
src/app/api/analyze/route.js               命式・運勢計算とKiriメッセージ生成
src/app/api/generate-placeholders/route.js 入力例の生成
src/app/layout.js                          メタデータとレイアウト
public/kiri.png                            Kiri画像
```

## 課金について

結果画面にはプレミアム案内（過去記録、パターン分析、Kiriとの対話）が表示されていますが、購入処理・購読状態・チャット機能はまだ未接続です。App Store公開前に、iOSの購入検証とサーバー側の権限判定を実装する必要があります。

## 確認コマンド

```bash
npm run lint
npm run build
```

## 方針・次の作業

全体の現状と優先順位は [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) にまとめています。
