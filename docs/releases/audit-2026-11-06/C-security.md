# C セキュリティ・プライバシー監査

監査日: 2026-11-06。担当: `/root/audit_c_security`。基準: `aac43b6`、隔離候補ツリー。コードは変更していない。秘密値・実日記・本番API・Redis・RevenueCatには接続していない。

## 結果

リリース前に扱う指摘は4件。C-02は無料分析の全体上限を無効入力で浪費できる問題、C-01はエラーログの入力混入経路、C-03は同意画面の説明と会話送信の不一致、C-04は不要な過去会話の送信。本文の通常表示からXSSに到達する経路や、クライアントへ秘密を渡す直接importは見つからなかった。実行時の本番ヘッダ、署名済み成果物、現在の外部設定は未確認。

適用: `security-best-practices`スキル、React/Next.js/general JavaScriptの参照仕様。P分類は暫定で、Astraが統合後に裁定する。依存脆弱性はrootのH-01を参照（重複起票しない）。

## C-01 不正JSONや上流JSON解析の例外本文が運用ログに出る

- 暫定: P2 / Medium。確度: 例外メッセージ出力はコードで確認。NodeのRequest.json()で入力断片を含むSyntaxErrorを再現。Cloudflare実行時の例外書式は未確認。
- 場所: `src/app/api/analyze/route.api.js:463,701,743-745`、`src/app/api/chat/route.api.js:87,165,173-175`。
- 規約: D-15/D-18、`src/app/privacy/page.js:71`は入力内容をログに含めないと説明。
- 証拠: 両catchが `console.error(..., error?.message ?? String(error))`。`request.json()`や`response.json()`の例外は本文由来の断片を含み得る。
- 再現: Nodeで `new Request("https://audit.invalid/", {method:"POST",body:"AUDIT_ONLY_DIARY_MARKER"}).json()` を呼ぶと `Unexpected token 'A', "AUDIT_ONLY"... is not valid JSON`。この例外を既存catchがそのままconsoleへ出す。全例外が本文を含むわけではない。
- 影響: 形式が壊れた入力やJSONでない上流応答に含まれる日記由来の断片が、保存しないと説明する運用ログへ残る。通常の有効JSONが常に漏れるという指摘ではない。他ユーザーの情報が攻撃者へ返る経路も確認していない。
- 最小修正: 解析エラーは固定codeで400/502へ分類。未知の例外は固定codeと安全な例外種別だけを記録し、message/String(error)/cause/bodyをログへ渡さない。
- 互換: 保存形式への変更なし。
- 合格条件: 不正JSON、本文を含むError、JSONでないAI応答をモックし、入力・応答の合成markerが全console呼び出しとクライアントエラーに出ないこと。

## C-02 無効な生年月日・出生時刻でも全体分析クォータを消費する

- 暫定: P1 / High availability。確度: コードの制御順で確認。API統合再現は依存インストール待ちで未実施。
- 場所: `src/app/api/analyze/route.api.js:473-477,498-511`、`src/lib/saju.js:27-45`。上限設定は `wrangler.jsonc` の `DAILY_LIMIT_ANALYZE=30`。
- 証拠: APIのプロフィール検証はbirthDateが文字列かつ長さ10以下であることだけ。birthTimeも長さ5以下だけ。`DAILY_QUOTA.consume()`の後に`calculateSaju()`を呼び、その中の`parseBirthInput()`が日付・時刻を検証して例外を投げる。
- 再現条件: APIキーが設定された稼働環境で、通常のentry/biorhythmと `birthDate:"not-a-date"` または `birthDate:"2000-02-31"`、または `birthTime:"99:99"`をPOST。IPレート以内でも繰り返せば、AIを一度も呼ばずに日次上限へ到達する。1IPで時間を分けるだけでも可能。実サービスへの送信はしていない。
- 影響: 無効入力で一般利用者全員の当日の分析機会を奪える。無認証無料API全般の濫用は別途残るが、失敗すると分かっている入力まで全体予算へ加算する必要はない。
- 最小修正: 既存の`parseBirthInput`をAPI入力検証時に利用し、無効日付/時刻を400としてクォータ前に返す。型と値域も厳格にし、数字文字列等の暗黙変換による後続演算の不一致を防ぐ。計算例外もAI呼び出し前に分類する。
- 互換: 有効な保存済みプロフィールの形式は維持する。古い不正プロフィールは入力修正へ誘導する。
- 合格条件: 各無効日付・時刻で400、全体クォータ未加算、AI未呼び出し。有効な境界日・任意時刻空欄で従来の分析が通る。

## C-03 同意画面が会話送信を説明せず、読み解き専用と明言する

- 暫定: P1（有料会話を公開する前）/ Medium privacy。確度: 文言と送信コードを照合済み。実際の同意バイパスとは区別する。
- 場所: `src/components/ConsentModal.jsx:20-35,54`、`src/components/KiriChatPanel.jsx:65-85`、`src/lib/consent.js:3-11`。設定の説明も `SpiritualDiary.jsx:1133-1135`。
- 証拠: 同意UIは「読み解きのための送信について」「送信は読み解きのときだけです」と表示。一方、チャットは同じversion1同意の有無だけを確認し、会話と当日の記録・結果・nicknameを送る。プライバシーポリシーは両方を説明しているが、同意の主画面とは不一致。
- 影響: 読み解きへの同意が会話にも使われることや、会話で一緒に送る記録・読み解き結果を、同意の場で理解しにくい。無同意の通常送信が成立するという指摘ではない。課金なしbuild1は会話非表示なので、その版の通常操作で会話送信されるとは扱わない。
- 最小修正: 読み解き・会話双方の送信契機、送信内容、相手先、撤回後の動作を同意UI/設定/ポリシーで一致させる。実質的な対象拡張なら同意versionを上げ、既存端末にも再確認する。会話から同意へ戻る導線も確認する。
- 関連: D-23/D-24/D-28/D-31。外部保持の補足は下記一次情報に基づき、自社保存ゼロと区別する。
- 互換: 日記/会話/プロフィールは変更しない。同意状態だけが再確認の対象。
- 合格条件: Web/iOSの実提供機能に合う説明。拒否・撤回中は読み解き/会話とも外部送信なし。version更新後の再同意、ポリシー閲覧後の入力維持も確認。

## C-04 会話送信時に最大1,000件の履歴を丸ごと自社APIへ送る

- 暫定: P2 / Medium privacy and availability。確度: UIとAPIのコードで確認。
- 場所: `src/components/KiriChatPanel.jsx:71-85`、`src/app/api/chat/route.api.js:10-11,44-53,87`、`src/lib/chatHistory.js`の保存上限。
- 証拠: UIは `messages: nextMessages` を送信。APIは受信後に `slice(-MAX_MESSAGES)`（12件）し、AIへ渡す。したがって使わない過去988件以上も毎回ネットワークを通り、自社APIのJSON解析対象になる。両APIはContent-Lengthもストリーム読み取りのバイト数もアプリ側で制限しない。
- 影響: 文脈に利用しない古い個人的な会話まで送信し、通信量・解析メモリを増やす。大量会話の通常ユーザーに影響するため、単なる仮説的DoSではない。エッジの制限値や実機の最大サイズは今回未確認なので、サービス停止が確実に起きるとは断定しない。
- 最小修正: 送信前にモデルへ必要な直近12件と必要フィールドだけに絞り、履歴保存件数とは別に共有定数化する。サーバー側の12件/各文字数制限も維持する。チャット・分析両APIのJSON読み込みに適切なバイト上限を設け、過大要求を413にする。Content-Lengthだけに依存せずchunked/欠落時も上限を守る。
- 互換: 端末内の1,000件の履歴保存・解約後閲覧・バックアップは維持し、送信対象だけを減らす。
- 合格条件: 1,000件履歴から送信するテストでbodyは直近12件のみ、古いmarkerなし。過大bodyはAI/権利照会/クォータ前に413。通常の最大長入力は成功する。

## 確認済みの防御・範囲

| 対象 | 結果と根拠 |
|---|---|
| クライアント/サーバー分離 | API秘密はAPI内で読む。SpiritualDiary等からkiriStore/entitlement等への直接importなし。iOS成果物には禁止markerと秘密値検査がある。今回の実成果物検査はrootのビルド検証へ引継ぎ |
| 日記/AI応答の表示 | JSXの文字列として表示。強調は分割してJSX要素化し、AI本文をHTML化していない。dangerouslySetInnerHTMLは固定Dynamic Type起動スクリプトだけ |
| CORS | capacitor://localhostの完全一致、資格情報許可なし、本番の追加origin無視。CORSを認証と誤認していない。不許可origin POSTは実行されるが、もともと公開APIでありcookie認証はない |
| レート/IP | cf-connecting-ip優先（Cloudflareが付ける前提）、Vercelでは別順序。HMACにより平文IPをストアへ保存しない。実エッジの信頼境界は未確認 |
| クォータ/ストア | JST日次キーとTTL、原子的INCR+EXPIRE。共有ストア不備はproduction/previewで503。Redis障害時のメモリ降格はD-18/D-31の受容済み制約としてHへ |
| 課金ゲート | 本番はpreview bypass無視、RCキーなし/ID不正/期限切れで閉じる。RC障害は503、期限キャッシュを確認。サーバーはクライアント購読フラグを信用しない |
| 同意 | 通常の読み解き・会話送信でhasConsentを確認。拒否時支援は端末内。バックアップに同意設定を含めない。C-03は説明不一致であり、同意チェック欠如ではない |
| 外部通信 | Anthropic/RevenueCatのサーバーURLは固定、IDはURLエンコード。動的API_BASEはビルド設定からのみ。SSRFとなる利用者入力由来のURLなし |
| 操作外部遷移 | サブスクリプション管理URLはRC応答由来、noopener/noreferrer使用。URLスキームの防御追加は検討余地があるが、信頼するRC応答の改ざんを前提とするため独立した確定脆弱性にしない |
| 保存/ログ | 自社Redisに本文保存する経路なし。C-01以外の通常ログは回数・status・定型警告。端末内平文/書き出しJSONはD-25の既知仕様としてB/Fへ |
| headers/CSP | アプリ設定では明示CSP/frame-ancestors等を確認できず。Cloudflareの実ヘッダは未確認。インフラ側の欠如と断定しない |

## 課金ID単体の認証に関する残リスク（E/Astraへ）

`chat/route.api.js:100`はbodyのApp User IDだけをRC照会し、`entitlement.js:99-122`で権利を決める。購読者のIDを知る第三者は別端末やcurlから同IDを送ってその枠を利用できる。ランダム128bitのIDなので総当たりで他人のIDを見つけられるとは扱わない。現在のコードにはIDを一覧公開する経路も見つからず、漏えい/利用者による共有が成立条件。RC公式も匿名ID方式を標準対応しつつ推測困難なIDを推奨している。アカウント新設を即必須にせず、IDを秘密として扱う設計の妥当性、端末証明や購入証明との結びつけの必要性をAstraで判断する。現時点で無条件のP0/P1認証突破とはしない。

## 検証と制限

- 実施: 全該当ソース・設定・関連テストの読解、危険sink/通信/ログ/環境変数参照の検索、NodeのRequest.json()例外書式の合成入力実験。
- `npm ci`完了後、`npm test -- src/lib/__tests__/apiRoutes.test.js src/lib/__tests__/cors.test.js src/lib/__tests__/consent.test.js src/lib/__tests__/entitlement.test.js`を実行。4 files / 96 tests PASS（13:32 JST）。既存テストの合格であり、今回の4指摘が否定されたわけではない。
- 未実施: 本番通信、実購入、実機のプロキシ/バックアップ、実エッジヘッダ、過大body負荷試験、署名済み成果物検査。

## 一次情報（2026-11-06確認）

- [Anthropic商用APIの保持](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data): 標準では入出力を受信/生成から30日以内に削除。個別契約・規約違反対策・法令等の例外あり。Kiri専用契約の条件は未確認であり、全データが必ず30日で消えるとは案内しない。
- [RevenueCat Identifying Customers](https://www.revenuecat.com/docs/customers/identifying-customers): 匿名IDは端末生成・保存、再インストールで新しいIDになる。推測困難なIDを推奨。これはKiri独自APIの本人証明を提供するという意味ではない。
