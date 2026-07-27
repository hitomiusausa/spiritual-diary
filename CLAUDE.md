# CLAUDE.md — Kiri / spiritual-diary 開発前提

このファイルには、セッションをまたいでも変わらない前提だけを書く。現在の進捗は`HANDOVER.md`、設計判断の履歴は`DECISIONS.md`を読む。

## プロダクト

- `spiritual-diary`がKiriサービスの正規本体。旧`Documents/Playground/kiri-chat`は自由チャット人格を検証した別プロトタイプ。
- 基本体験は「基本情報 → 日記 → 四柱推命とバイオリズム → Kiriの読み解き → 履歴保存」。Kiriとの自由チャットは有料オプション。
- Kiriは、やわらかく温かく、少し神秘的。ただし、色・数字・方角などの具体的な手がかりと、記録に結びつく説明を両方出す。
- 占いは断定・脅しを避け、医療・金融・法的判断をしない。AI出力を事実や専門的診断として扱わない。

## 実装ルール

- 命式計算の基準は`src/lib/saju.js`と`docs/SAJU_SPEC.md`。計算ロジックをUIやAIプロンプトに重複させない。
- 同一JST日・同一入力では結果を安定させる。ヒントのシード、分析キャッシュ、AIの`temperature: 0`を壊さない。
- APIキーなどの秘密情報をクライアントへ出さない。APIエラーは詳細を返さない。
- 無料結果と有料チャットを混同させない。購入処理や購読状態が未接続なら、開発プレビューと明示する。
- 履歴は現状localStorageのみ。保存仕様を変更するときは、既存データを消さない移行方針を先に決める。
- UIは低彩度の夜色、余白、薄い境界線を中心にする。絵文字を画面表示に使わず、Lucideアイコンを優先する。

## 変更前後の確認

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

大きな変更では、入力→分析→結果→チャット→履歴の一連の動作を実ブラウザでも確認する。作業完了時は`HANDOVER.md`を更新し、必要なら`docs/PROJECT_STATUS.md`も同期する。

## 重要な参照先

- `HANDOVER.md`: 次回の最初に読む現在地
- `DECISIONS.md`: 確定した設計判断と理由
- `docs/SAJU_SPEC.md`: 四柱推命の採用基準と限界
- `docs/DECISION_INPUT_MAP.md`: 入力が結果へ与える影響
- `docs/HANDOFF-2026-07-28.md`: 詳細な引き継ぎ記録
