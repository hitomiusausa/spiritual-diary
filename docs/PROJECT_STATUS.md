# Kiri / Mind & Energy Note — 現状と次の作業

更新日: 2026-07-25

## 1. このリポジトリの位置づけ

`spiritual-diary`がKiriサービスの正規本体です。旧`kiri-chat`（`Documents/Playground/kiri-chat`）は、Kiriとの自由チャット人格・安全性・チャットUIを検証した別プロトタイプです。両方を無計画に混ぜず、占い結果を中心とする本体へ、必要なチャット機能だけを後から統合します。

## 2. 現在の構成

```text
src/app/page.js
  └─ SpiritualDiary
       ├─ start: ニックネーム・出生情報
       ├─ input: 気分・出来事・直感
       ├─ loading: Kiriの分析演出
       └─ result: 命式・運勢・ヒント・Kiriメッセージ

src/app/api/analyze/route.js
  ├─ lunar-javascriptで出生時と現在の四柱を算出
  ├─ 五行相性、テーマ別スコア、今日のヒント、大運を算出
  └─ Anthropic APIでdeepMessage / innerMessage / actionAdviceを生成

src/app/api/generate-placeholders/route.js
  └─ 入力画面の例文をKiriの文脈に合わせて生成

src/components/SpiritualDiary.jsx
  └─ UIと入力状態を管理（現在は履歴を永続保存しない）
```

## 3. 実装済み

- 生年月日、出生時刻（任意）、性別（任意）の入力
- 四柱（年柱・月柱・日柱・時柱）の表示
- 日運・時運・月運・年運・大運の表示
- バイオリズム、気分、五行相性を組み合わせたテーマ別スコア
- 色・数字・方角・距離感のヒント
- Kiriのやわらかな読み解き文
- モバイル向けの画面遷移とホワイトアウト演出
- プレミアム案内のUI

## 4. 未実装・リリースブロッカー

### 最優先: 正確性と安全性

- 四柱推命の計算仕様を専門知識と照合する（特に大運、節入り、時柱、性別による順逆）
- 入力値の形式・範囲・本文長をサーバー側でも検証する
- APIキーを含むエラー詳細をクライアントへ返さない
- APIの認証、レート制限、利用量監視を追加する
- 医療・金融などの断定を避ける安全文言と危機時の対応を定義する

### 次: プロダクト機能

- 占い結果の保存・履歴一覧・削除
- Kiriとの有料チャット画面
- 命式と過去結果をチャットへ安全に渡すコンテキスト設計
- プレミアム案内を実際の購入導線へ接続

### App Store公開前

- Swift/Capacitor等によるiOSアプリの器
- StoreKitまたはRevenueCatによる購入・復元・購読状態確認
- サーバー側のentitlement判定（クライアントのフラグを信用しない）
- プライバシーポリシー、利用規約、サポートページ
- App Store用アイコン、スクリーンショット、説明文
- 実機iPhoneでの音声・キーボード・セーフエリア・通信失敗QA

## 5. 既知の整理事項

- ルート直下の重複`SpiritualDiary.jsx`は削除し、`src/components/SpiritualDiary.jsx`を唯一のUI実装とする
- `next.config.js`は`next.config.mjs`と重複していたため削除
- Create Next Appの未使用SVGと古いfaviconを削除
- `src/app/layout.js`のタイトルと説明をKiri用に更新

## 6. 推奨する実装順

1. 命式計算の基準とテストケースを固定する
2. API入力検証・安全性・レート制限を固める
3. 結果を端末またはアカウント単位で保存できるようにする
4. 無料結果と有料チャットの境界を確定する
5. 課金・entitlement・チャットを実装する
6. iOS化、実機QA、プライバシー資料、App Store提出を行う

## 7. 検証状態

- `npm run build`: 成功
- `npm run lint`: エラーなし（`<img>`の最適化警告が1件）
- 自動テスト: 未整備
