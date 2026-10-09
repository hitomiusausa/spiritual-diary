# DECISIONS.md — Kiri 設計判断ログ

確定した判断は、理由を確認せずに覆さない。新しい判断は末尾へ追記し、過去の記録は上書きしない。

## D-01 正規本体を spiritual-diary に一本化

- **Status**: 確定
- **決定**: `/Users/usausagi/Documents/Playground/spiritual-diary`をKiriサービス本体とする。`kiri-chat`はチャット人格の検証用プロトタイプとして扱う。
- **理由**: 占い結果を中心にした日記体験と、自由チャットの実験を混ぜると、課金境界と責務が曖昧になるため。

## D-02 無料の基本体験と有料チャットを分ける

- **Status**: 確定（課金実装は未着手）
- **決定**: 無料部分は記録・四柱推命・バイオリズム・Kiriの読み解き・端末内履歴。有料オプションはKiriとの自由な会話。
- **理由**: 占い結果をまず体験してもらい、継続的な対話に価値を感じる人だけを課金対象にするため。

## D-03 Kiriの結果文は具体性と余白の二段構え

- **Status**: 確定
- **決定**: 今日のヒントは色・数字・方角・距離感などのキーワードを先に示し、続けて記録や上位テーマに結びつくKiriの具体的な読みを置く。
- **理由**: 抽象的なメッセージだけでは占い体験として手がかりが弱く、断定的な予言ではKiriの世界観を損なうため。

## D-04 同じ条件の同日分析は安定させる

- **Status**: 確定
- **決定**: JST日付・プロフィール・バイオリズム・日記入力を分析キーにし、ヒントをシード化、分析をサーバー内キャッシュ、Anthropic分析を`temperature: 0`で実行する。
- **理由**: 同じ人物が同日に繰り返し占ったとき、結果が毎回変わる不自然さを避けるため。
- **注意**: キャッシュは現状プロセス内のみ。複数インスタンス間の永続的一貫性は未実装。

## D-05 四柱推命は lunar-javascript を基準にする

- **Status**: 暫定確定（専門家照合が必要）
- **決定**: `getEightChar()`、節入り、`getYun(gender, 2)`を採用する。出生時刻なしは内部参照値を12:00とするが、時柱の精度を同等に主張しない。
- **未解決**: 真太陽時、出生地、23時前後・立春前後・節入り境界、流派ごとの大運差。
- **参照**: `docs/SAJU_SPEC.md`。

## D-06 履歴は端末内保存から始める

- **Status**: 暫定確定
- **決定**: 占い履歴は最大30件、チャット履歴は最大40メッセージをlocalStorageへ保存する。個別削除と全削除を提供する。
- **理由**: アカウントや同期基盤なしで日記の継続体験を検証できるため。
- **次段階**: 本番では認証、同期、削除請求、バックアップ方針を設計する。

## D-07 安全性と課金をクライアントだけで判定しない

- **Status**: 未実装だが公開前の必須方針
- **決定**: APIレート制限、利用量監視、安全導線、サーバー側entitlement判定を追加する。クライアントの購入済みフラグは信用しない。
- **理由**: API費用の不正利用、課金回避、危機的相談への不適切な応答を防ぐため。

## D-08 API保護の第一段階はプロセス内メモリ方式

- **Status**: 確定（2026-07-28、本番スケール時に見直し）
- **決定**: `/api/analyze`と`/api/chat`にIP別レート制限（固定ウィンドウ60秒）とJST日単位のグローバル日次クォータを`src/lib/apiGuard.js`で実装する。チャットは`src/lib/entitlement.js`の`checkChatEntitlement()`で判定し、現在は環境変数`KIRI_CHAT_PREVIEW`のみで許可する（未設定なら403）。将来のStoreKit/RevenueCat検証はこの関数内に実装する。設計書は`docs/superpowers/specs/2026-07-28-api-guard-design.md`。
- **理由**: 認証・課金基盤がない現段階で外部ストアを導入するのは過剰。分析キャッシュ（D-04）と同じ制約を受け入れ、外部依存ゼロで公開前のAPI費用リスクを塞ぐため。
- **注意**: カウンタはプロセス内のみ。再起動でリセットされ、複数インスタンス間で共有されない。IPはプロキシヘッダ依存のため、信頼できるリバースプロキシ配下でのみ意味を持つ。本番スケール時はRedis等へ差し替える。

## D-09 日記データのバックアップは三段階で進める

- **Status**: 方針確定（2026-07-28、実装は未着手）
- **決定**: バックアップは次の三段階とする。
  1. **第一段階（Web/現行）**: バージョン付きJSONの手動エクスポート/インポート。対象はlocalStorageの3キー（`spiritual-diary.history.v1`、`spiritual-diary.profile.v1`、`spiritual-diary.chat.v1`）。インポートは既存データとidベースでマージし、既存データを消さない。
  2. **第二段階（iOS化時）**: localStorageをネイティブストレージ（Capacitor Preferences等）へ移し、iCloudバックアップに自動で乗せる。
  3. **第三段階（本番）**: D-06の次段階どおり、認証・同期・削除請求を伴うクラウド同期として設計する。
- **理由**: iOS Safariは7日間未使用でlocalStorageを削除する（ITP）ため、日記データは全損リスクを持つ。一方でクラウド同期は認証とプライバシー体制が前提なので、外部依存なしで今できる手段から順に積む。
- **注意**: 実装の優先度は四柱推命の境界ケース検証の後。エクスポートJSONにはスキーマバージョンを含め、将来の同期実装の移行下地にする。

## D-10 四柱推命の流派方式を仕様として承認

- **Status**: 確定（2026-07-28ユーザー承認）
- **決定**: 次の3方式をプロダクト仕様とする。①日柱は0時（子正）切替（23時台は当日の日柱のまま）。②夜子時（23時台）の時柱は翌日の日干から起算する。③大運は`getYun(gender, 2)`の節入りベース起運換算（性別と年干で順逆を決定）。いずれも`lunar-javascript`の既定動作と一致するため実装変更はない。
- **理由**: 境界ケースの独立照合（古典ルール——60干支日送り・五虎遁・五鼠遁——による手計算とライブラリの突き合わせ）が、日柱連続性・立春前後・節入り前後・0時前後・時柱境界のすべてで一致した（`docs/SAJU_SPEC.md`参照）。いずれも主要流派の一つであり、根拠を示して明示採用する。
- **注意**: 専門家または外部命式表による人の確認は公開前に実施を推奨（未実施）。節入り当日の分単位境界の外部照合も未実施。

## D-11 閲覧の課金境界: 日記は無料、会話ログは有料

- **Status**: 確定（2026-07-28ユーザー指示）
- **決定**: 日記（占い履歴）は無料会員も遡って閲覧できる。Kiriとの自由チャットは有料で、有料会員は日記に加えてKiriとの会話ログの閲覧もできる。
- **理由**: D-02の課金境界（無料=記録と占い体験、有料=Kiriとの対話）を閲覧機能にも一貫させるため。会話体験だけでなく会話の振り返りも有料価値に含める。
- **現状との整合**: 会話ログはチャットパネル内でのみ表示されるため、パネル自体を購読ゲート（`checkChatEntitlement()`）内に置けば閲覧境界は自然に満たされる。追加実装は課金導入時。
- **注意**: バックアップ（D-09）のエクスポートは閲覧とは別で、データ所有の観点から無料・有料を問わず会話ログも含めて書き出す。

## D-12 iOSの器はCapacitor、課金はRevenueCat経由

- **Status**: 方式確定（2026-07-28ユーザー承認。着手はWebデプロイ後）
- **決定**: iOSアプリは現在のReact UIをCapacitorで包む。課金はRevenueCat SDK経由でStoreKitを扱い、サーバー側の`checkChatEntitlement()`（D-08）に購読検証を接続する。「薄いWebView」審査リスク（App Storeガイドライン4.2）を避けるため、ネイティブストレージ移行（D-09第二段階）・ハプティクスなどのネイティブ統合を器の実装に含める。
- **前提**: `/api/analyze`と`/api/chat`はサーバーが必要なため、Webデプロイ（ホスティング先は未決定）が先行条件。UIを静的同梱にするかリモートURL方式にするかは、フロントとAPIの分離構成の検討とセットでiOS着手時に決める。
- **保留中の関連判断**: Webデプロイ先（未決定）、法務ページの運営者表記・問い合わせ窓口（未記入）、Apple Developer Program加入。

## D-13 デザインシステム: 夜色トークン・明朝×角ゴ・霧の光

- **Status**: 確定（2026-07-28ユーザー承認。フォントは実サンプル比較で選定）
- **決定**:
  - **色**: `globals.css`の`@theme`に定義したトークンのみを使う。地=night、面=mist/plum、線=line、主文=text、補助文=lilac/fog、**アクセントは gold 1色のみ**（Kiriの声・見出し・強調）。データ4色（leaf/rain/lilac/rose）はバイオリズム・テーマ運勢専用、五行5色（wood/fire/earth/metal/water）は今日のヒント専用。エラーはdanger。これ以外の生のTailwind色クラスを画面に追加しない。
  - **フォント**: 見出しとKiriの言葉=しっぽり明朝（`--font-kiri-display`、`.font-display`/`.kiri-voice`）、UI本文=Zen Kaku Gothic New（`--font-kiri-body`）。next/font/googleで自前配信。`.kiri-voice`はline-height 2で組む。
  - **アニメーション**: シグネチャーは「霧の谷の光」（`.kiri-fog-orb`のdrift+breathe）。読み解き中画面とトップページ背景で同じ言語を使い、強度だけ変える。入場は`.kiri-rise`、灯りの明滅は`.kiri-ember`。transform/opacityのみ・`prefers-reduced-motion`で全停止。レンダー内`Math.random()`は使わない。
  - **画面遷移**: 白フラッシュではなく薄紫の霧トーンで覆う。
- **理由**: 約40種に散らばっていた色を役割固定のトークンに集約し、「静かで神秘的でシンプル」（Apple HIGのClarity/Deference/Depth準拠）な世界観を全画面で一貫させるため。
- **付随変更**: 履歴タップで過去の読み解きを読み返す詳細モーダルを追加（日記の核体験）。プレミアム案内の「過去の記録をすべて閲覧」をD-11に合わせ「会話ログの読み返し」へ修正。`<html lang="ja">`に修正。

## D-14 運営者はくうが株式会社、Webは無料お試し版・チャットはアプリ限定

- **Status**: 確定（2026-10-08ユーザー指示。公開URLと問い合わせ窓口も同日確定）
- **決定**:
  - **運営者**: くうが株式会社（KUGA K.K.）。D-U-N-S番号取得済み（964317277）のため、Apple Developer Programは法人名義で加入する。法務3ページの運営者表記もこれで埋める。問い合わせ窓口は`info@kugainc.com`。
  - **Web版**: 無料のお試し版として一般公開する。対象は基本体験（記録・四柱推命・バイオリズム・読み解き・端末内履歴・バックアップ）のみ。
  - **Kiriとの自由チャット**: iOSアプリ限定の有料機能。Webには課金導線（Stripe等）を置かず、Web版の`/api/chat`は購読検証が通らない限り閉じたままにする。
- **理由**: 審査を待たずに実ユーザーの反応を得つつ、課金をApp Store内に一本化して二重の決済基盤を持たないため。iOS Safariの7日ルール（D-09）でWebの長期保存は弱いので、「続けるならアプリ」という導線とも一致する。
- **公開URL**: `kiri.kugainc.com`（確定）。kugainc.comのDNSはCloudflare管理なので、CNAMEでVercelへ向ける。コーポレートサイト（Cloudflare Pages・静的）には同居させない。
- **注意**: 公開前にAPI保護をプロセス内メモリからRedis等の共有ストアへ移す（Vercelは複数インスタンスのためD-08のカウンタが実質効かない）。Anthropic側の利用額上限も設定する。

## D-15 危機対応: 寄り添いモードと相談窓口カード

- **Status**: 確定（2026-10-08ユーザー承認・方式A）
- **決定**:
  - 危機の検出・窓口・安全指示は`src/lib/kiriSafety.js`に集約する（kiri-chatの同名ファイルを作り直して移植）。検出は表記ゆれを吸収した正規表現で行い、「死ぬほど〜」などの日常表現は拾わない。
  - **日記（分析）で拾ったとき（方式A）**: 結果画面の一番上に相談窓口カードを出し、読み解きは寄り添いモードで生成する（スコアの低さ・注意・避けたい反応に触れない、今夜を越えるための小さな行動だけを置く）。テーマ別運勢は折りたたんだ状態で表示する。今日のヒントのテンプレート文は日記本文を引用せず「ここに書いてくれた今日」に置き換える。履歴の詳細にもカードを出す。
  - **チャットで拾ったとき**: AIを呼ばず、Kiriの声の固定文＋窓口カードを返す。日次クォータは消費しない。
  - 言葉で拾えない遠回しなつらさへの保険として、分析・チャットの両方のシステム指示に`SAFETY_GUIDANCE`を常に含める。
  - 窓口は24時間の#いのちSOS・よりそいホットラインを先頭に、いのちの電話を続ける。2026-10-08に厚生労働省「まもろうよ こころ」の電話相談ページで確認し、確認日を画面に表示する。
  - ログには検出の有無だけを残し、入力本文は残さない。
- **理由**: 日記とAIチャットのアプリとして、危機的な書き込みへの応答は公開の前提条件（D-07）。つらい気持ちで書いた人を突き放さず、冷たい数字をいきなり見せないため。
- **注意**: 窓口の番号・受付時間は変わり得るので、公開前と以降も定期的に公式ページで再確認し、`SUPPORT_LINES_CHECKED_AT`を更新する。

## D-16 モデルを5.5世代へ更新、文章の安定はキャッシュが担う

- **Status**: 確定（2026-10-08）。D-04の「`temperature: 0`」部分を置き換える
- **決定**: 分析は`claude-sonnet-5-5`（effort `medium`、server-side fallback `default`）、チャットは`claude-haiku-5-5`（effort `low`）。どちらも環境変数で差し替え可能（`CLAUDE_MODEL`／`KIRI_CLAUDE_MODEL`／`KIRI_ANALYZE_EFFORT`／`KIRI_CHAT_EFFORT`）。応答本文は`extractReplyText()`で思考ブロックを飛ばして取り出し、拒否・途中打ち切りは失敗扱いにする。
- **理由**: 5.5世代は`temperature`を既定値以外にすると400になり（2026-10-08に実APIで確認）、思考が常時オンで`content[0]`が本文とは限らないため。
- **影響**: 同日同条件の文章の安定は、分析キャッシュ（D-04）だけが担う。Vercelの複数インスタンスでは現在のプロセス内キャッシュが共有されないため、Web公開時にキャッシュもRedis等へ移す（D-14の注意と同じ作業）。思考トークンも`max_tokens`に含まれるので、上限は分析8000・チャット2000に広げた。

## D-17 気分の選択肢を11種類・アイコン重複なし・ラベル付きに整理

- **Status**: 確定（2026-10-08ユーザー承認）
- **決定**: 気分の定義を`src/lib/moods.js`に一本化する。選択肢は次の11種類で、Lucideアイコンを重複させず、アイコンの下に短いラベルを付ける。値は互換のため絵文字のまま保つ（画面には出さない）。

  | ラベル | 値 | アイコン | 気分補正 |
  |---|---|---|---|
  | うれしい | 😆 | Laugh | +20% |
  | 愛おしい | 🥰 | Heart | +18% |
  | おだやか（既定） | 😌 | Leaf | +12% |
  | わくわく | ✨ | Sparkles | +15% |
  | 元気 | ☀️ | Sun | +8% |
  | ねむい | 😴 | Moon | -5% |
  | 不安 | 😰 | CloudRain | -12% |
  | 悲しい | 😢 | Droplet | -18% |
  | イライラ | 😤 | Angry | -15% |
  | もやもや（不安定） | 🤔 | CircleHelp | -5% |
  | ふつう | 😮 | Meh | 0% |

- **理由**: 絵文字23種をLucideの10種類のアイコンに置き換えた結果、ハート5個・笑顔4個などが重なり、気分を見分けられなかったため。
- **互換**: 外した旧い値（😊・💓・🌈など）は`LEGACY_MOODS`で従来どおりの補正とアイコンを保ち、過去の履歴・バックアップをそのまま表示できる。AIへのプロンプトには絵文字ではなくラベル（例: 「気分: わくわく」）を渡す。

## D-18 API保護を共有ストアへ移し、サーバーには日記由来のデータを保存しない

- **Status**: 確定（2026-10-08ユーザー決定）。D-08の「プロセス内メモリ方式」とD-04/D-16の「サーバー内キャッシュ」を置き換える
- **決定**:
  - **共有ストア**: レート制限と日次クォータのカウンタだけを`src/lib/kiriStore.js`経由でUpstash Redis（東京リージョン）に置く。接続先は`UPSTASH_REDIS_REST_URL`/`_TOKEN`（Vercel連携の`KV_REST_API_URL`/`_TOKEN`でも可）。未設定ならプロセス内メモリで動く。`@upstash/redis`は`automaticDeserialization: false`・1秒タイムアウト・再試行なし（`retry: false`、障害時は降格するため）で初期化し、カウンタは`MULTI`で`INCR`と`EXPIRE NX`を同時に送る。
  - **キー**: レート制限は`kiri:rl:{route}:{IPハッシュ}:{分窓番号}`（TTL 120秒）、クォータは`kiri:q:{route}:{JST日付}`（TTL 2日）。IPは運営者だけが持つ秘密鍵で`HMAC-SHA256(KIRI_STORE_SECRET, "kiri/v1/ip|" + IP)`の先頭22文字にして平文で保存しない（`src/lib/kiriCrypto.js`）。クライアントIPは`x-real-ip`を優先し、なければ`x-forwarded-for`の先頭（D-19で`cf-connecting-ip`を最優先に変更）。
  - **サーバー保存ゼロ**: 日記・分析結果はサーバー（Redisを含む）に一切保存しない。分析APIのサーバー内キャッシュは撤去した。
  - **文章の安定（D-16）は端末側キャッシュが担う**: `src/lib/analysisCache.js`。キーは正規化入力（JST日付・プロフィール・バイオリズム・日記入力）のSHA-256（Web Crypto）で、日記本文を平文のキーに持たない。localStorage`kiri-analysis-cache-v1`に当日分だけ・最大10件を保存し、読み書き時に今日（JST）以外を捨てる。成功した結果だけを保存する（寄り添いモードの結果も含む）。記録の個別削除・すべて削除のときは丸ごと消去し、バックアップ読み込みでは触らない。履歴（`history.js`）とは別のキーで、既存データの形式は変えない。
  - **降格**: Redisの障害・タイムアウト時、カウンタはプロセス内メモリへ降格して制限を効かせ続ける（警告ログにキーや例外本文は出さない）。費用の最終防波堤はAnthropicコンソールの利用額上限。
  - **503方針**: `VERCEL_ENV`（D-19以降は`KIRI_DEPLOY_ENV`も）が`production`または`preview`で、Redis設定か`KIRI_STORE_SECRET`（32文字以上）が欠けていれば、`/api/analyze`と`/api/chat`は503`{ success:false, error:"Service unavailable" }`を返す（ログは「store not configured」だけ）。判定はリクエストごと。開発時に秘密鍵が未設定ならプロセス起動ごとのランダム値を使う。
- **理由**: Vercelは複数インスタンスで動くため、プロセス内メモリのカウンタは実質効かない。一方で日記は最も私的な入力なので、プライバシーを最優先にして、サーバー側には「秘密鍵なしでは元のアドレスがわからないIP由来の値」と「回数」しか残さない。
- **デメリット**: 端末キャッシュなので、別の端末・ブラウザや、サイトデータを消した後は同日同入力でも文章が変わり得る。
- **検討して退けた案**: サーバー側の暗号化キャッシュ（入力内容から導く鍵でAES-256-GCM暗号化し、Redisに当日分だけ置く）。運営者も入力を知らない限り復号できない設計だったが、暗号化しても「日記由来のデータをサーバーに置く」こと自体を避けたいというユーザー判断で退けた。
- **注意**: プライバシーポリシー2〜3節をこの内容に合わせて改訂した（2026-10-08）。チャットのAPI消費管理（購読と連動した上限など）は後日検討。

## D-19 ホスティングを Cloudflare Workers（OpenNext）へ移す

- **Status**: 実装・ローカル検証済み（2026-10-08、ブランチ`agent/cloudflare-workers`）。本番の切り替え（デプロイ・ドメイン）は未実施。Vercelは切り替え完了まで残す
- **決定**:
  - `@opennextjs/cloudflare` 1.20.7 ＋ `wrangler` 4.143.1 で Next.js 16.4 を Workers に載せる。設定は`wrangler.jsonc`（`nodejs_compat`・`global_fetch_strictly_public`・compatibility_date 2026-09-21・R2/画像バインディングなし）と`open-next.config.ts`（インクリメンタルキャッシュなし。ISRを使わないため）
  - **本番判定**: `KIRI_DEPLOY_ENV`（production/preview）を正とし、`VERCEL_ENV`も後方互換で見る。**どちらか**が production/preview なら D-18 の503方針を適用する（片方で保護を外せない）。Cloudflare では`wrangler.jsonc`の`vars`に`KIRI_DEPLOY_ENV: "production"`をコミットして設定漏れを防ぐ
  - **クライアントIP**: プラットフォーム別（`src/lib/apiGuard.js`）。Vercel上（`VERCEL=1`か`VERCEL_ENV`あり）は`x-real-ip` → `x-forwarded-for`の先頭で、`cf-connecting-ip`は利用者が偽装できるので見ない。それ以外（Cloudflare）は`cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`の先頭（D-18の記述を更新）
  - **画像**: `images.unoptimized: true`。Workers では Next.js の画像最適化サーバーが動かず、画像は`kiri.png`1枚のため
  - **Next.js 16.4 の一時パッチ**: 16.4 で独立した`.next/server/preview-props.json`を OpenNext（1.20.9まで）が Worker に埋め込まず全ページ500になる。上流の未マージ修正（opennextjs-cloudflare#1356）と同じ1行を`scripts/patch-opennext.mjs`が build 前に当てる。パッチ後（＝上流修正後）の行と完全一致すれば何もせず、どちらとも一致しなければ止まる
  - **秘密を Worker に混ぜない**: OpenNext は build 時に`.env`・`.env.local`・`.env.<mode>(.local)`の中身を`.open-next/cloudflare/next-env.mjs`へ書き出し、Worker が起動時に process.env へ入れる（ダミー値で確認した埋め込み先はこのファイルだけ）。`scripts/check-embedded-env.mjs`が**ビルド成果物**のこのファイルの全モードが空であることを検査し（値は出さずキー名だけ報告）、`cf:deploy`/`cf:upload`は必ず検査してから上げる。秘密は Cloudflare の Secrets、ローカルの workerd プレビューは`.dev.vars`（git管理外）に置く
  - **デプロイ経路**: Workers Builds はビルド`npm run cf:build`・デプロイ`npm run cf:deploy`。手元からは`npm run deploy`。**`npx opennextjs-cloudflare deploy`や`wrangler deploy`を直接実行しない**（検査を通らないため）
  - **ログ**: `observability.logs.invocation_logs: false`（呼び出しログは接続元などリクエストのメタデータを含むため）、traces も無効。console の運用ログ（本文・IP・秘密を含まない）は残す。キーは wrangler の config-schema.json で確認
- **バージョン選定の例外**: 方針は「リリースから2週間以上の安定版」だが、2週間を超える 1.20.6 は Next.js 16.3以降の実行時チャンクに未対応で、API ルートが`loadCustomCacheHandlers`内の`No such module "file:/.next/None"`で500になった（1.20.7 の #1403 で修正）。Next を 16.3 へ戻すのは本番の版を下げることになるため、1.20.7（2026-09-29）を採用した。wrangler も 4.143.0 以下に miniflare 経由の undici（high）が残るため、修正版の 4.143.1（2026-09-29）を採用した
- **補足**: `esbuild`を開発依存に明示した（0.27.2）。OpenNext が宣言せずに import しており、vitest（vite の optional peer）と版が衝突して node_modules 直下に置かれず build が失敗したため。0.27.3〜0.28.0 は開発サーバーの脆弱性があるので避けた

## D-20 iOS版は静的書き出し（Capacitor）で作り、切替は`KIRI_BUILD_TARGET=ios`

- **Status**: 確定（2026-10-09、Phase 2、ブランチ`agent/ios-shell`。mainへは未マージ・本番Webは不変）
- **決定**:
  - Capacitor 8.5.2（SPM）。`@capacitor/core`・`cli`・`ios`は固定版。プラグインはpreferences・haptics・share・filesystem・status-bar・splash-screen（2週間ルールで固定）。Bundle ID `com.kugainc.kiri`、ホーム画面の表示名「Kiri」、App Storeは名前「Kiri」＋サブタイトル「Mind & Energy Note」（登録はPhase 4）。`ios/`はコミットする（生成物だが再現性のため）
  - `next.config.mjs`は`KIRI_BUILD_TARGET === 'ios'`のときだけ`output:'export'`と`trailingSlash:true`を足す。APIルートは`route.js`→`route.api.js`に改名し、`pageExtensions`（Webは`api.js`を含む、iOSは含まない）で除外する。**`distDir`は使わない**（Next 16.4は書き出し先が`out/`でなく`distDir`になる）
  - ビルドは`npm run ios:build`（`scripts/build-ios.mjs`）。`KIRI_BUILD_TARGET`と`NEXT_PUBLIC_KIRI_API_BASE`は**プロセス環境として**渡し、`.env.ios`は作らない（D-19: OpenNextが`.env*`をWorkerへ埋め込むため）。既定のAPI先は`https://kiri.kugainc.com`、`--dev`で`http://localhost:3000`
  - **ビルド後の安全検査**: 必須ページの有無、秘密の変数名・値（`.env`系から照合）、チャット開発プレビュー文言の混入を調べ、問題があれば`out/`を消して失敗にする。`--dev`でないビルドは`NEXT_PUBLIC_KIRI_CHAT_PREVIEW=0`を強制する（`.env.local`に`=1`があっても本番向けに入らない）
  - Workers Buildsの環境変数に**`KIRI_BUILD_TARGET`を置かない**（置くと本番が静的化してAPIが消える。未設定ならWeb既定）
- **理由**: 実測で、リポの書き出しとOpenNextの両ビルドが正しく出た。ディレクトリ退避方式はビルド途中の失敗で`src/app/api`が消えたままになる事故があり、`pageExtensions`は決定的で副作用がない。監査（audit-AB）でworkerd上の`route.api.js`＋`pageExtensions`の動作とCORSを実測確認済み。
- **代償**: 本番のビルド経路（ファイル名と`pageExtensions`）に触れるので、main統合前に`cf:build`＋workerdプレビューで`/api/analyze` 400・`/api/chat` 403を再確認する。`.next`を共有するため`npm run dev`や`cf:build`と同時に走らせない。ドメインを変える日はiOSを再ビルドして審査に出し直す。

## D-21 CORSは`capacitor://localhost`だけを許可する

- **Status**: 確定（2026-10-09）。実本番での確認はデプロイ後（HANDOVER参照）
- **決定**: `src/lib/cors.js`の許可リストは`capacitor://localhost`のみ（完全一致・Originをそのまま返す）。両APIに`OPTIONS`を足し、許可Originなら204＋`Allow-Origin`・`Allow-Methods: POST, OPTIONS`・`Allow-Headers: Content-Type`・`Max-Age: 86400`・`Vary: Origin`。POSTの全応答（400/403/429/503含む）にも許可Originのときだけ同じヘッダと`Expose-Headers: Retry-After`を付ける。`*`と`Allow-Credentials`は使わない。`https://kiri.kugainc.com`は入れない（Webは同一オリジン）。開発用`KIRI_EXTRA_ALLOWED_ORIGINS`は`production/preview`判定（D-19の`isGuardedDeployEnv`）では無視する。`CapacitorHttp`は有効化しない。OPTIONSはレート制限・クォータを消費しない
- **理由**: `Content-Type: application/json`でプリフライトが走るため。CORSはブラウザの読み取り制限を緩めるだけで、API防御（IPレート制限・日次クォータ・Cookieなし・秘密なし）には関与しない。他サイトのOriginは今後もプリフライトで落ちる。
- **注意**: 許可リストを`*`にした瞬間、他サイトが利用者のブラウザ経由でAPIを叩けるようになるので絶対にやらない。

## D-22 端末保存はネイティブでPreferencesへ。一度きりの非破壊移行

- **Status**: 確定（2026-10-09、D-09の第二段階）
- **決定**:
  - `src/lib/storage.js`: `initStorage()`（非同期・起動時1回）と`getStorage()`（同期の`getItem/setItem/removeItem`）。Webは`window.localStorage`をそのまま返す。ネイティブ（`Capacitor.isNativePlatform()`）では起動時に対象キーをPreferencesからメモリへ読み、書き込みはメモリ更新（同期）＋Preferencesへのwrite-through（キーごとに直列化・最後の値が勝つ）。`history.js`・`backup.js`・`chatHistory.js`・`analysisCache.js`は`storage`引数設計のまま無変更
  - 対象キー: 履歴・プロフィール・チャット・端末キャッシュ・**同意（`spiritual-diary.consent.v1`）**。同意を含めないと起動毎に同意画面が再表示される
  - **一度きり移行**: ネイティブで`spiritual-diary.migrated.v1`がPreferencesに無いとき、WKWebViewのlocalStorageにある対象キーを**コピー**してから印を置く。localStorage側は**消さない**（D-09「既存データを消さない」）。**優先順位**: Preferencesに既にある値は上書きしない（移行はPreferencesに無いキーだけを埋める）。印があれば以後localStorageは読まない
  - 起動の落とし穴: Capacitorのプラグインプロキシは`then`を持つように見え、Promiseの解決値に入れると永久に待つ。解決値にプロキシを渡さない（66924b1）
- **理由**: ライブラリは全部同期APIでstorageを引数に取るので、同期シムなら呼び出し側の改修が最小。PreferencesはiCloud/端末バックアップの対象で、WebKitの7日削除（ITP）から逃れられる。
- **代償**: write-through直後の強制終了で最後の1書き込みが落ち得る（数ms窓）。データが数MBに育ったらFilesystem移設をD-09第三段階と合わせて判断する。初期化前の`getStorage()`書き込みは禁止（読み書きのずれ。監査P2-5）。

## D-23 AI送信の同意画面（Web・iOS共通、撤回可）

- **Status**: 確定（2026-10-09、オーナー承認。App Store 5.1.2(i)対応）
- **決定**:
  - `src/lib/consent.js`: `CONSENT_VERSION = 1`、キー`spiritual-diary.consent.v1`（`{version, acceptedAt}`）。**バックアップには含めない**（端末ごとの同意。取り込み側もホワイトリストで同意を立てない）
  - 同意が無い状態で「読み解く」（およびチャット送信）を押すとモーダルを出し、同意後に続行する。起動時にはブロックしない。文言は、基本情報と今日の記録がくうが株式会社のサーバーを経由してAnthropic社のAI（Claude）に送られること、送信は読み解きのときだけでサーバーに日記を保存しないこと、取り扱いは同社の方針に従うこと、設定でいつでも取り消せること。ボタンは「同意して読み解く」「今はやめる」＋ポリシーへのリンク（読んでも書きかけが消えない）
  - 撤回は設定の「AI送信の同意を取り消す」。「すべて削除」は同意を消さない（同意は記録ではなく端末の設定）
  - **断った場合**: 送信はしない。ただし危機表現は`detectCrisis`（外部依存なしの純関数）で**端末内で検出**し、当たれば`SupportCard`（相談窓口）を出す。D-15「つらい気持ちで書いた人を突き放さない」の維持（監査P1-1）
  - Webにも出す（送信内容が同じなので説明責任も同じ）。プライバシーポリシー2〜3節の文言変更を承認済み
- **理由**: 5.1.2(i)は第三者AIへの共有前の明示的な許可を求める。D-18の「サーバー保存ゼロ」は文言の強み。
- **代償**: 初回体験に1タップ増える。

## D-24 課金開始までプレミアムカード・チャット入口を隠す（Web・iOS）

- **Status**: 確定（2026-10-09、オーナー決定Q4）
- **決定**: プレミアムカード（とその中の「開発プレビューでKiriに聞く」）、`KiriChatPanel`、プレミアムのInfoPopupは`NEXT_PUBLIC_KIRI_CHAT_PREVIEW === '1'`のビルドでだけ描画する。`next.config`で未設定を`'0'`に静的置換し、フラグ外のコードはバンドルから消える。サーバーの403ゲート（`KIRI_CHAT_PREVIEW`未設定）は残す（二重の壁）。開発でチャットを試すには`NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1`と`KIRI_CHAT_PREVIEW=1`の両方が要る（`.env.local`のみ。iOSは`--dev`ビルドのみ。D-20の強制`0`参照）。チャット送信にも同意ゲートを置いた
- **持ち越し（L-4）**: `/terms`・`/support`の「開発プレビュー」文言とチャットパネル内文言はPhase 3（課金接続）で改稿する。

## D-25 アプリのロック方針（決定済み・実装は進行中）

- **Status**: 方針確定（2026-10-09、オーナー決定）。実装はT-L1/T-L2（ブランチ`agent/ios-lock`）。ロック画面の見た目は比較HTML→合意→実装の順
- **決定**:
  - 守る対象は「他人に見られないこと」。**OS認証（Face ID／Touch ID／端末パスコード）だけ**でゲートする。独自パスワードは持たず、忘れて全損するリスクがない（D-09と矛盾しない）
  - **Web版にはロックをつけない**（T-L10不要）
  - 端末内データの暗号化はしない。**バックアップの合言葉暗号化は今はつけない**（保留。将来のためにデータ形式の`version`を確保するのは任意）
  - 自動ロックの既定は**5分**（選択肢: すぐに／1／5／15分）。切り替え画面はOSの目隠し
- **理由**: 暗号化（端末内）は「合言葉を忘れたら全損」でD-09・D-18と両立しない。覗き見・貸し出しにはゲートで足りる。
- **正直な限界**: 平文のままiCloudバックアップとバックアップJSONに乗る点はゲートでは守れない（バックアップの扱いは利用者の管理）。

## 付記（Phase 2 の確定事項）

- **Q2 一日の上限は未変更**: `DAILY_LIMIT_ANALYZE=30`（全体合算）のまま。1端末あたり上限（T11）も入れていない。**アプリを一般配布する前に必ず見直す**（Kiriワークスペース月$20のままだと実費$0.05/回で約13回/日分。実費は未計測）。
- **スプラッシュはA案「静かな霧」**（「霧の谷の光」風グラデーション3案から、ロゴなし・初画面と最も自然につながる案を選択。ステータスバーは明るい文字）。iOSの起動画像サイズ上限を超えると黒画面になるため、機種ごとの縦長クロップを使う（17e0710）。
- **エラー文言**: `src/lib/analyzeError.js`にKiriの口調の失敗メッセージを実装済み（2c55694）。文言はオーナーのレビュー待ち。
- **iOSの表示**: 入力欄は16px（フォーカス時の自動ズーム防止）、ステータスバー背後にスクリム。Dynamic Typeには追従していない（WKWebView既定。要検討）。
