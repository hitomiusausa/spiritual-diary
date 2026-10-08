# HANDOVER.md — Kiri 現在地

最終更新: 2026-10-08

新しいセッションでは、まず`CLAUDE.md` → `DECISIONS.md` → `HANDOVER.md`の順に読む。詳細な履歴は`docs/HANDOFF-2026-07-28.md`と`docs/PROJECT_STATUS.md`にある。

## 現在の場所

- 正規リポジトリ: `/Users/usausagi/Documents/AI_Playground/spiritual-diary`
- ブランチ: `agent/consolidate-spiritual-diary`
- GitHub: `https://github.com/hitomiusausa/spiritual-diary`
- 最新状態: 2026-07-28分まではGitHubへpush済み。2026-10-08のリリース準備 Phase 0（D-14〜D-16）もpush済み。

## 2026-10-08 Phase 1-1 API保護の共有ストア化（コード側完了・push済み）

確定したこと（**D-18**）:
- レート制限・日次クォータのカウンタだけをUpstash Redis（`src/lib/kiriStore.js`）に置く。未設定ならプロセス内メモリ。IPは運営者だけが持つ秘密鍵（`KIRI_STORE_SECRET`）でHMAC化し、平文で保存しない（`src/lib/kiriCrypto.js`）
- **サーバーには日記由来のデータを一切保存しない**。分析のサーバー内キャッシュは撤去
- 同日同入力の文章の安定（D-16）は**端末側キャッシュ**（`src/lib/analysisCache.js`、localStorage`kiri-analysis-cache-v1`、キーは入力のSHA-256、当日分・最大10件）が担う。記録の個別削除・すべて削除で丸ごと消去する。別端末では文章が変わり得る
- Redis障害・タイムアウト（1秒・再試行なし）時は、カウンタをメモリへ降格して制限を効かせ続ける
- **503方針**: `VERCEL_ENV`がproduction/previewで、Redis設定か`KIRI_STORE_SECRET`（32文字以上）が欠けていれば、`/api/analyze`と`/api/chat`は503
- プライバシーポリシー2〜4節を改訂（保存先Upstash東京・IP由来の値は最長2分・回数カウンタは2日・端末内の当日一時保存と削除時の消去）

ユーザー作業（デプロイ前）:
1. ~~Upstash Redisを作成~~ 済み（下記）。Vercelの環境変数に`UPSTASH_REDIS_REST_URL`・`UPSTASH_REDIS_REST_TOKEN`を貼る
2. Vercelの環境変数に`KIRI_STORE_SECRET`を設定（`openssl rand -base64 48`で生成、Sensitive指定）
3. ~~Anthropicコンソールで月の利用額上限を設定~~ 済み: 組織全体$100（通知$30）。組織はつぶやきうさぎ・日本語資金ウォッチと共有なので、**Kiri専用ワークスペース`wrkspc_012jzv8UJ1hKnEB5THWJzark`を作成し月$20上限・$15で通知**（2026-10-08）。本番の`CLAUDE_API_KEY`はこのワークスペースで発行したキーを使う（Kiriが上限に達しても他サービスは止まらない）
   - Kiriワークスペースでキーを発行し、ローカル`.env.local`の`CLAUDE_API_KEY`を差し替え済み。`claude-haiku-5-5`への最小リクエストでHTTP 200を確認（2026-10-08）。Vercelにも同じワークスペースのキーを入れる
4. 1回の読み解きの実費を公開後のログ・Consoleで測り、`DAILY_LIMIT_ANALYZE`（既定300/日）を$20/月に収まる値へ調整する

Upstash（2026-10-08 ユーザーが作成済み）:
- DB名`kiri-prod`、Regional・Primary Region Tokyo（ap-northeast-1）、Read Regionsなし、Eviction ON、Freeプラン。URL/TOKENはローカルの`.env.local`に設定済み（Vercelには未設定）
- 実サーバーで`MULTI`＋`INCR`＋`EXPIRE NX`を確認済み: 1回目は`[1,1]`でTTL 60、2秒後の2回目は`[2,0]`でTTL 58（延長されない）。テスト用キーは削除済み

デプロイ後に確認すること:
- 本番のログに`[kiri-store] incr fell back to memory`（降格の警告）が出ていないこと

残課題:
- チャットのAPI消費管理（購読と連動した上限など）は後日検討
- プライバシーポリシーは「Upstash（東京リージョン）」と書いてある。実際に作ったリージョンが違えば文言を合わせる

同日の追加（ユーザー承認）:
- **基本情報画面のスキップ**: 生年月日が保存済みなら起動時に日記入力画面から始める（`initialStepFor`、`src/lib/history.js`）。日記入力画面のヘッダーに「{生年月日}生まれ ・ 変更する」と設定の歯車を追加し、下部の「前の画面に戻る」は削除。結果画面の「今日の記録をクリアする」も日記入力へ戻る。復元が終わるまでは背景だけ表示
- **プロフィールが空で上書きされる不具合を修正**: 起動直後、復元前の空の値で保存処理が走り、端末の基本情報を消していた（開発モードでは毎回再現）。復元の反映をstateで待ってから保存するようにした
- Playwrightで375px・1280pxを確認（保存済みプロフィールで日記入力から始まる／「変更する」で値入りの基本情報画面へ／歯車で設定モーダル／コンソールエラー0）

## 2026-10-08 リリース準備を開始（Phase 0 完了・push済み）

リリースまでの道のり: **Phase 0 下準備（済）→ Phase 1 Web公開 → Phase 2 iOSの器 → Phase 3 課金 → Phase 4 審査準備・提出**。

確定したこと:
- **D-14**: 運営者はくうが株式会社（D-U-N-S 964317277 取得済み→Apple Developerは法人で加入）。Webは無料お試し版として公開し、Kiriとのチャットはアプリ限定の有料機能。公開URLは`kiri.kugainc.com`、問い合わせ窓口は`info@kugainc.com`で確定。法務3ページに記入済み
- **D-15**: 危機対応（方式A）。日記で拾ったら窓口カード＋寄り添いモードの読み解き、チャットで拾ったらAIを呼ばずに固定文＋窓口カード
- **D-16**: モデルをSonnet 5.5（分析）／Haiku 5.5（チャット）へ。`temperature`が使えなくなったので、文章の安定はキャッシュが担う

この日にやったこと:
- `src/lib/kiriSafety.js`（検出・窓口・安全指示）と`src/components/SupportCard.jsx`を新規作成し、結果画面・履歴詳細・チャット・/supportに組み込んだ
- `src/lib/claudeResponse.js`で、思考ブロックを飛ばして本文を取り出すようにした
- `npm audit fix`でNext.js 16.4.0／sharp 0.35.5へ更新（critical含む実行時の脆弱性を解消）。開発用依存に`braces`のhighが残るが、`--force`が必要なため保留
- `<img>`を`next/image`に置き換え、lintの警告を0にした
- 実APIで確認済み: 危機の日記→`support: true`＋寄り添い文、日常の日記（「死ぬほど笑った」）→通常、同一入力の2回目はキャッシュで同一、チャットの危機ワード→固定文。Playwrightで375px・1280pxの結果画面／チャット／サポートページを目視確認
- 寄り添いモードでは今日のヒントの文が日記本文を引用しないようにした（「ここに書いてくれた今日」）
- 法務3ページに運営者（くうが株式会社）と問い合わせ窓口（info@kugainc.com）を記入
- 気分の選択肢を11種類・アイコン重複なし・ラベル付きに整理（D-17、`src/lib/moods.js`）。記録欄の例文に出ていた「/n」も改行に修正

気づいたけど未対応:
- チャットパネルの背景が半透明で、後ろの結果画面が透けて読みにくい（以前からのデザイン）

Vercel（2026-10-08）:
- 既存プロジェクト`spiritual-diary`（`spiritual-diary-tau.vercel.app`、GitHub連携・`main`が本番）を使う。`main`を作業ブランチまで早送りし、`vercel.json`で関数を東京（hnd1）に
- 環境変数: `CLAUDE_API_KEY`（Kiriワークスペースのキーに差し替え・Secret・All Environments）、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`（Secret）、`KIRI_STORE_SECRET`（Secret）、`DAILY_LIMIT_ANALYZE=30`。いずれもProduction and Preview。`KIRI_CHAT_PREVIEW`は入れない（Webはチャットを閉じる、D-14）
- 環境変数を入れる前の本番デプロイでは、`/api/analyze`・`/api/chat`が設計どおり503を返すことを確認済み
- 料金プラン: Hobbyは非商用のみなので、`kiri.kugainc.com`で一般公開する前にProへ上げるか判断する

次（Phase 1 Web公開）の順番:
1. API保護をUpstash Redisへ移す（コード側は完了・D-18）。Upstash作成・`KIRI_STORE_SECRET`設定・Anthropic側の利用額上限はユーザー作業
2. Vercelへデプロイ → Cloudflareで`kiri.kugainc.com`のCNAME → 実環境で入力→分析→結果→履歴→バックアップを通し確認

## できていること

- 年・月・日の選択式を含む基本情報入力と、次回起動時の復元（2回目以降は日記入力から始まる）
- 気分・出来事・直感の日記入力
- 四柱、日/月/年/時運、大運、テーマ別スコアの算出
- キーワード＋Kiriの具体的な説明による今日のヒント
- Kiri人格を共有した分析文と、結果文を文脈にしたチャット開発プレビュー
- 占い履歴（最大30件）とチャット履歴（最大40メッセージ）の端末内保存
- 同日・同一条件での分析結果の安定化
- モバイル向けの静かな夜色UI、絵文字表示から線画アイコンへの変更
- APIの第一段階保護（D-08）: IP別レート制限、JST日次クォータ、チャットの`KIRI_CHAT_PREVIEW`ゲート＋entitlementスタブ。403/429時はチャットUIがKiriの言葉で案内
- 四柱推命の境界ケース独立照合（D-10）: 日柱連続性・立春前後・節入り前後・0時/夜子時・時柱境界がすべて古典ルール手計算と一致。流派方式3点を仕様承認済み
- 日記データのJSONバックアップ（D-09第一段階）: 設定の歯車（スタート画面・日記入力画面）から書き出し/読み込み。復元はidマージで既存データを消さない。実ブラウザでエクスポート/インポート往復を確認済み
- 閲覧の課金境界を確定（D-11）: 日記履歴は無料、Kiri会話ログの閲覧は有料側。実装は課金導入時にチャットパネルごとゲート
- プライバシーポリシー（/privacy）・利用規約（/terms）・サポート（/support）ページ。スタート画面下部からリンク。運営者名と問い合わせ窓口は2026-10-08に記入済み
- デザインシステム（D-13）: 夜色トークン（金アクセント1色・データ4色・五行5色）、しっぽり明朝×Zen角ゴ新、「霧の谷の光」アニメーション（トップ/読み解き中、reduced-motion対応）、履歴タップで過去の読み解きを読み返す詳細モーダル。実ブラウザで全画面QA済み
- 画面の情報設計を整理: バックアップはスタート画面右上の設定アイコン（歯車）→設定モーダルへ。最近の記録は結果画面「今日の記録」下のボタン→一覧モーダル（記入日付き）→タップで詳細。CollapsibleSectionのbutton入れ子（HTML違反・hydrationエラー）も修正
- 記録削除の安全化: 個別削除・すべて削除とも確認ダイアログを挟む（「削除した記録は元に戻せません。バックアップを取っていない場合、復元はできません」＋設定アイコンへの導線）。削除後は「記録を削除しました」を3秒表示（role=status）
- バックアップ文言の統一: 「バックアップは自動では行われないので、設定アイコンの「バックアップ」を選択して定期的に書き出す」を設定モーダル・削除確認・サポートFAQの3箇所に反映。昔の日記だけ読む導線は現状不要と判断（入口は結果画面のみ）

## 検証済み

```text
npm test                 15 files / 130 tests passed（2026-10-08）
npm run lint             errors 0 / warnings 0
npm run build            success
npm audit --omit=dev     vulnerabilities 0
```

APIの403（プレビュー無効）、429（レート制限・Retry-Afterヘッダ付き）、プレビュー有効時の通過は、`next start`をポート3999で立ててcurlで実挙動を確認済み（2026-07-28）。
2026-10-08: `VERCEL_ENV=production`かつRedis未設定で`/api/analyze`・`/api/chat`が503、開発時（`VERCEL_ENV`未設定）でレート制限の429（Retry-After付き）が従来どおり返ることをcurlで確認済み。

## 2026-07-28セッションのまとめ

同日中に次を完了した（コミット146d3f4〜e3c61cd、すべてpush済み）。

1. API第一段階保護（D-08）: レート制限・日次上限・チャットのプレビューゲート＋entitlementスタブ
2. 四柱推命の境界ケース独立照合と流派方式の仕様承認（D-10）
3. 日記データのJSONバックアップ第一段階（D-09）と閲覧課金境界の確定（D-11）
4. 法務3ページ（/privacy /terms /support、運営者表記は保留）とiOS方式確定（D-12: Capacitor）
5. デザインシステム（D-13）: 夜色トークン・しっぽり明朝×Zen角ゴ新・「霧の谷の光」アニメーション
6. UX仕上げ: 設定アイコン化・記録一覧と読み返しモーダル・削除確認＋完了通知・バックアップ文言統一

検証はテスト53件・lint 0エラー・build成功・audit脆弱性0。主要フローは実ブラウザで通し確認済み。
注意: 長時間起動のdevサーバーはTurbopackキャッシュでCSSが古くなることがある。表示が変なら再起動＋ハード再読み込み。

## ローカルで進められる作業はここまで完了（2026-07-28）

以降はすべてユーザーの決定・外部リソースが先行条件になる。

- **運営者表記・問い合わせ窓口**: 2026-10-08確定・記入済み（くうが株式会社／info@kugainc.com）
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
cd /Users/usausagi/Documents/AI_Playground/spiritual-diary
npm install
cp .env.example .env.local
# .env.local に CLAUDE_API_KEY を設定
# チャットを使うなら KIRI_CHAT_PREVIEW=1 も設定（未設定なら /api/chat は403）
npm run dev
```

ブラウザは`http://localhost:3000`。分析APIは`POST /api/analyze`、チャットAPIは`POST /api/chat`。
