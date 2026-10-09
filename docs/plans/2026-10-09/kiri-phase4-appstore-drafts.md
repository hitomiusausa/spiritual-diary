# Kiri iOS App Store 申請素材ドラフト（Phase 4）

作成: 2026-10-09 / 対象: Kiri 1.0（運営 くうが株式会社 / KUGA K.K.・Bundle `com.kugainc.kiri`）
前提: **v1.0はチャット・課金なしで出す**想定（D-24でプレミアムUIは `NEXT_PUBLIC_KIRI_CHAT_PREVIEW=1` のビルドのみ。iOS本番ビルドは0固定＝D-20）。チャット/課金はPhase 3以降の更新で追加。この前提なら 3.1.1・サブスク表示要件・RevenueCat のラベル追記は v1.0 に不要で、審査面積が最小になる（推奨）。
凡例: 【確認済】=Apple公式ページを2026-10-09に取得して確認 / 【未確認】=公式で裏が取れていない・推測 / 【判断】=ひとみうさの決定が要る点。

---

## 0. 先に読むべき結論（正直な評価）

1. **最大リスクは 4.3(b)。** Apple公式ガイドライン本文に "fortune telling" が「確立済みで、**意味のある差別化がない限り新規は受け付けない**」カテゴリとして**明記**されている【確認済】。開発者フォーラムでは占星術・ホロスコープアプリが「飽和カテゴリ」で4.3拒否される例が複数あり、機能を絞っても（タロットだけに）覆らなかった報告や、キーワードを消してもAIに「占星術」と分類されて拒否された報告がある【確認済：フォーラム報告。Appleの公式見解ではない】。承認・異議申し立て成功の確かな事例は今回の調査では見つからなかった【未確認】。→ Kiriは「占いアプリ」ではなく**「日記＋内省＋AI」**として、メタデータ・スクショ・審査メモ・カテゴリ全部でそう見えるようにする。それでも通る保証はなく、**1回目の4.3拒否は織り込み済みで動く**（異議申し立て文面は §6）。
2. **日記の主役を実際に画面でも主役にする。** 現状の基本体験は「基本情報→日記→四柱推命とバイオリズム→読み解き」で、占い要素が強い。審査員が最初に見る画面（入力→結果）が占い一色だと4.3の土俵に乗る。スクショは「記録・履歴・振り返り・ロック・プライバシー」を前に出す（§5）。
3. **Anthropic側の保持が栄養表示に効く。** 公式ヘルプ上、API入出力は原則30日以内に自動削除（2025-09に7日へ短縮との第三者情報もあるが公式では未確認）。つまり「サーバー保存ゼロ」は**Kiriのサーバー**の話で、第三者（Anthropic）には最長30日残る可能性がある。ZDR契約が無い限り、App Privacyでは**Other User Contentを「収集（Collected）」として申告する安全側**を推奨（§2）。

---

## 1. メタデータ

文字数は Python で計測（chars=文字数 / bytes=UTF-8）。Apple公式の上限【確認済】: プロモ170字・説明4000字・キーワード100**bytes**・審査メモ4000bytes・名前/サブタイトル30字（※名前/サブタイトルの30字は今回の公式ページから直接は取れず、一般知識。**【未確認】**）。

### 1-1. 日本語（プライマリ言語）

| 項目 | 内容 | 計測 |
|---|---|---|
| アプリ名 | `Kiri` | 4字 / 4bytes / 上限30 |
| サブタイトル | `Mind & Energy Note` | 18字 / 18bytes / 上限30 |
| プロモーションテキスト | 下記 | 96字 / 280bytes / 上限170字 |
| キーワード | `日記,四柱推命,バイオリズム,気分,記録,振り返り,内省,セルフケア,手帳` | 37字 / 95bytes / 上限100bytes |
| 説明文 | 下記 | 1039字 / 2667bytes / 上限4000字 |

注:
- 名前 "Kiri" は他アプリと衝突する可能性あり（空き状況は App Store Connect で名前を予約するまで**【未確認】**）。取れなければ `Kiri 日記` / `Kiri - 気分と記録のノート` を代替に（占い語を入れない）。
- キーワード方針【判断】: `占い`・`運勢`・`星座` を**あえて入れない**（4.3(b)の分類回避。引き換えに検索流入は減る）。`四柱推命` は機能の正確な説明として残した。App Store Connect は「各キーワード2文字超」と書いているが日本語2文字語（日記・気分・内省）がどう扱われるかは**【未確認】**。入力時に弾かれたら語を調整。アプリ名・カテゴリ名は自動で索引されるので重複させない。
- 説明文は「当たる」「運勢」「占い」を使わない。「読み解き」「振り返り」で統一。チャット/課金には触れない（v1.0に無いため。入れると3.1.1や機能不一致の指摘材料になる）。
- サブタイトルは Mind & Energy Note で確定済み（D-20）。日本語ロケールでも英語のまま。

**プロモーションテキスト（JA）**
```
毎日の気分と出来事を書きとめると、四柱推命とバイオリズムをもとに、Kiriがやさしく読み解きます。当たる・当たらないではなく、自分の一日を振り返るための静かな日記帳。記録はあなたの端末の中に。
```

**説明文（JA）**
```
Kiri は、気分と出来事を書きとめて、あとから静かに振り返るための日記アプリです。
四柱推命とバイオリズムの視点を借りて、AI の Kiri が、あなたの一日をやわらかい言葉で読み解きます。

■ こんなふうに使います
1. ニックネームと生年月日を入力（出生時刻と性別は任意）
2. 今日の気分・出来事・直感のメモを書く
3. 「読み解く」を押すと、Kiri がその日の読み解きを返します
4. 記録は履歴として残り、あとから読み返せます

■ Kiri の読み解き
・今日の色・数字・方角といった小さな手がかりと、あなたの記録に結びついた言葉の両方でお届けします
・四柱推命の命式とバイオリズムのグラフも確認できます
・断定したり、不安をあおったりしません。未来を決めるものではなく、気づきのきっかけとしてお使いください
・同じ日・同じ記録なら、同じ読み解きが表示されます

■ 記録はあなたの端末の中に
・日記と履歴は、この端末の中にだけ保存されます（アカウント登録・ログインは不要）
・読み解きのときだけ、入力内容が AI（Anthropic 社の Claude）に送信されます。初めて送る前に確認画面で同意をいただき、同意は設定からいつでも取り消せます
・日記の内容を運営者のサーバーに保存することはありません
・バックアップの書き出し・読み込みに対応。記録はすべて削除することもできます

■ アプリのロック
Face ID・Touch ID・端末のパスコードで、アプリを開くときに確認できます。自動でロックするまでの時間も選べます。

■ つらいときのために
書き込みの中につらい気持ちが感じられたときは、Kiri が相談窓口（#いのちSOS・よりそいホットライン・いのちの電話など）をご案内します。

■ ご注意
・Kiri は、セルフケアと読み物を目的としたアプリです。医療・健康・投資・法律に関する診断や助言ではありません
・AI が生成した文章を含みます。内容の正確さは保証されません。重要な判断は、ご自身の責任でお願いします
・心身の不調が続くときは、医療機関や専門の窓口にご相談ください

運営: くうが株式会社（KUGA K.K.）
プライバシーポリシー: https://kiri.kugainc.com/privacy
利用規約: https://kiri.kugainc.com/terms
お問い合わせ: info@kugainc.com
```

### 1-2. 英語（任意のセカンド言語。アプリのUIは日本語のみ）

英語リスティングを足すと海外ストアで検索はされるが、**UIは日本語のみ**。誤解を避けるため説明文に明記した（App Store Connect上、UI言語とリスティング言語の不一致自体は禁止されていないが、レビューで「誤解を招く」と見られないよう正直に書く。【未確認】）。出さない選択（JAのみ・日本ストア限定配信）も妥当【判断】。

| 項目 | 内容 | 計測 |
|---|---|---|
| Name | `Kiri` | 4字 |
| Subtitle | `Mind & Energy Note` | 18字 / 18bytes |
| Promotional Text | 下記 | 183字 / 183bytes / 上限170 |
| Keywords | `journal,diary,mood,reflection,self-care,biorhythm,four pillars,bazi,daily,log,mindful,notes` | 91字 / 91bytes / 上限100bytes |
| Description | 下記 | 2147字 / 2161bytes / 上限4000 |

**Promotional Text（EN）**
```
Write down your mood and your day, and Kiri reads it back gently through Four Pillars and biorhythm. A quiet journal for reflection, not a prediction app. Entries stay on your device.
```
**Description（EN）**
```
Kiri is a quiet journal for writing down your mood and your day, and looking back on it later.
Borrowing the lenses of Four Pillars of Destiny (Japanese shichusuimei / BaZi) and biorhythm, Kiri, an AI companion, reads your entry back to you in soft, gentle words.

HOW IT WORKS
1. Enter a nickname and your date of birth (birth time and gender are optional)
2. Write today's mood, what happened, and an intuition note
3. Tap "Read" and Kiri replies with a reading of your day
4. Your entries are kept as history so you can revisit them

WHAT KIRI GIVES YOU
- Small clues such as a color, a number and a direction, together with words tied to what you actually wrote
- Your Four Pillars chart and a biorhythm graph
- No hard predictions and no scare tactics. Use it as a prompt for noticing, not as something that decides your future
- The same day and the same entry give the same reading

YOUR ENTRIES STAY ON YOUR DEVICE
- Your journal and history are stored only on this device. No account or login is needed
- Your entry is sent to an AI (Claude by Anthropic) only when you tap "Read". You are asked for consent before the first time, and you can withdraw it any time in Settings
- Your journal content is not stored on the operator's servers
- Back up and restore your data, or delete everything, whenever you like

APP LOCK
Require Face ID, Touch ID or your device passcode when opening the app, with a choice of auto-lock timing.

WHEN THINGS FEEL HEAVY
If your writing suggests you are in pain, Kiri points you to support services (Japanese crisis lines such as #Inochi SOS, Yorisoi Hotline and Inochi no Denwa).

PLEASE NOTE
- Kiri is for self-care and reading enjoyment. It does not give medical, health, financial or legal diagnosis or advice
- Readings include AI-generated text and are not guaranteed to be accurate. Please make important decisions on your own judgment
- If you feel unwell for a long time, please consult a medical professional
- Content and support lines are in Japanese

Operator: KUGA K.K. (くうが株式会社)
Privacy Policy: https://kiri.kugainc.com/privacy
Terms: https://kiri.kugainc.com/terms
Contact: info@kugainc.com
```

### 1-3. カテゴリ・URL・その他

| 項目 | 推奨 | 理由 |
|---|---|---|
| Primary category | **Lifestyle** | 日記・内省アプリの定位置。Day One 等の日記系もLifestyle/Productivityに分散【未確認：現在のランキング配置は未調査】 |
| Secondary category | **Productivity**（代案: Health & Fitness は避ける） | 「日記＝記録の道具」と示す。**Entertainment は占いの巣窟なので避ける**。Health & Fitness は1.4.1の厳格審査・年齢レーティングのMedical/Wellness質問と連動して面倒が増える【判断】 |
| Support URL | `https://kiri.kugainc.com/support` | 連絡先 info@kugainc.com が載っている（Appleは実連絡先必須【確認済】）。**要修正**: FAQ「Kiriとの対話が使えません」が「開発プレビュー」表記（L-4）。v1.0では該当Q削除か文言差し替え |
| Marketing URL | `https://kiri.kugainc.com/` | Web版（無料お試し）。**注意**: Webにも占い要素の見えるLPがあれば審査員が見る。トップの文言も「日記」寄りに |
| Privacy Policy URL | `https://kiri.kugainc.com/privacy` | 5.1.1(i)でアプリ内リンクとApp Store Connect両方必須【確認済（調査メモ）】。アプリ内（設定）からのリンクがあるか要確認 |
| EULA | Apple標準EULAで可。独自にするなら `/terms` | `/terms` 第3節に「開発プレビュー」文言が残る→v1.0では削除/改稿 |
| Copyright | `2026 くうが株式会社`（EN: `2026 KUGA K.K.`） | 形式は「年＋権利者名」、©は自動付与【確認済】 |
| Content Rights | 第三者コンテンツなし（NO） | |
| Primary language | 日本語 | |
| Price | 無料（v1.0） | 課金が入るPhase 3で再審査 |
| 配信地域 | 日本のみから始める【判断】 | 相談窓口が日本の番号のみ。海外配信するなら窓口が無意味になる（1.4.1/5.1の懸念）。審査ガイドの観点でも日本限定が無難 |
| Version release | 手動リリース | 審査通過後に本番APIの状態を確認してから出せる |

---

## 2. App Privacy（栄養ラベル）回答ドラフト

根拠: Apple定義では "collect"=端末外へ送り、リアルタイム処理に必要な期間を超えて自社/第三者がアクセス可能にすること。送って即破棄ならば開示不要【確認済】。第三者パートナー（SDK等）の収集も自社分として開示【確認済】。**AI処理者（Anthropic）の扱いについてAppleのこのページに具体記述なし**【確認済：記述なしと確認】。

### 2-1. v1.0（チャット/課金なし）

| データタイプ | 申告 | 用途 | ユーザーに紐付け | トラッキング | 根拠 |
|---|---|---|---|---|---|
| User Content > **Other User Content**（日記本文・気分・直感メモ） | **Collected（推奨・安全側）** | App Functionality | **Not linked** | No | 読み解きのため端末外（Kiriサーバー→Anthropic）へ送信。Kiriサーバーは保存ゼロ（D-18）だが、Anthropic側に最長30日残りうる【公式ヘルプ記述あり。ZDR契約の有無は未確認】。アカウント/ユーザーIDが無く、サーバー側で識別子と結びつけない＝de-identifiedとして Not linked と主張。**【判断】**: 「即破棄で非収集」と申告するのは、Anthropicの保持を知りながらでは危険。ZDRが取れたら見直し可 |
| Contact Info > Name（ニックネーム） | 【判断】 | App Functionality | Not linked | No | ニックネームはAIプロンプトに含まれ送信される。「特定の項目（名前）を尋ねるなら具体タイプで申告」とAppleは書く【確認済】ので、**Name を Collected・Not linked で足す方が安全**。本名を要求しない旨はUIで明確に |
| 生年月日・出生時刻・性別 | 該当タイプなし。Other User Content に包含して申告 | App Functionality | Not linked | No | 性別はAppleのSensitive Info列挙（人種・性的指向・妊娠・障害・宗教・政治・遺伝・生体）に無い【確認済：列挙の記憶に基づく。公式ページ全文は未取得＝**一部未確認**】 |
| Health & Fitness > Health | **申告しない（要判断）** | — | — | — | 気分日記は「Health」（健康・医療データ）に当たるかが灰色。Kiriは医療を主張せず、診断データでもない。ただしメンタルヘルス寄りと見られる可能性があるので**【判断】**。保守的にいくなら Health（Other）を追加でも害は小さい |
| Identifiers > Device ID / User ID | **なし** | — | — | — | IDFA不使用、アカウント無し、広告SDK無し |
| Usage Data / Diagnostics | **なし** | — | — | — | 解析SDK・クラッシュレポート導入なし（導入するなら追加）。Appleが集めるクラッシュ情報はApple側 |
| IPアドレス（レート制限） | 開示不要寄り【判断】 | — | — | — | HMACキー付きハッシュで最長2分（Upstash東京）、回数カウンタ2日。生IPは保存しない。「即破棄」に近いが厳密には数分保持→保守的に **Other Usage Data / Not linked / App Functionality(不正防止)** を足す選択肢あり。ポリシー第3節には記載済み |
| Purchases | なし | — | — | — | v1.0は課金なし |

**Tracking: NO**（広告・データブローカー連携なし。ATT不要。`NSUserTrackingUsageDescription` を入れない）
**Privacy Choices URL**: 不要（任意）。同意の取り消しは設定内。

ポリシー側の同期（申請前に必須）【判断】:
- 第3節に「Anthropic側で最長30日保持されうる（公式記述に基づく）」旨を足し、ラベルと矛盾させない。ZDR状況は未確認なので断定しない。
- ポリシーは「Cookieや広告識別子を使用しません」と書いている。RevenueCat導入後は変わるため §2-2 参照。

### 2-2. Phase 3（RevenueCat + チャット）で変わること
- **Identifiers > User ID**（RevenueCatの匿名App User ID `$RCAnonymousID:`）: Collected / App Functionality / **Linked**（購入履歴と結びつくため）/ No tracking。
- **Purchases > Purchase History**: Collected / App Functionality / Linked。
- **Device ID**: RevenueCat SDKがIDFAを既定で収集しない【RevenueCat公式の申告ガイドで要確認。**未確認**】。IPアドレス等はRevenueCat側がサーバーで見る可能性があり、同社の申告ガイドに従う【未確認】。
- チャット本文は Other User Content に既に含めてあるので追加不要（会話ログの扱いが変わるなら更新）。
- プライバシーポリシー第1・5節を更新（アカウントなし・広告IDなしの文言と整合させる）。ラベルはアプリ更新なしで修正可能【確認済（調査メモ）】だが、課金追加のバージョン提出前に更新する。

---

## 3. 年齢レーティング質問票 回答ドラフト

制度（【確認済】）: 2025年に13+/16+/18+が追加され、質問票への回答期限は2026-01-31。2026-07に社会メディア関連質問が追加され、**回答必須化は2026-09**（報道ベース。Apple公式ページ上では「Social Media」項目あり）。質問領域: アプリ内制御（Parental Controls／Age Assurance）／機能（Unrestricted Web Access、User-Generated Content、Social Media、Messaging and Chat、Advertising）／成人向け題材／Medical or Wellness／性的表現／暴力／偶然性（賭博・ルートボックス等）。AIチャットボット専用の質問は確認できず【未確認】（Appleの案内では、AIアシスタント等の機能が各センシティブ内容の「頻度」に影響する点に注意するよう記載）。

| 質問 | 回答 | 根拠 |
|---|---|---|
| Parental Controls / Age Assurance | None | 親制御・年齢確認機能なし |
| Unrestricted Web Access | No | アプリ内ブラウザで任意サイトを開けない。相談窓口カードの厚労省リンクは特定の1サイト（外部Safari遷移）。【判断】Browserプラグインで任意URLを開けない設定にしておく |
| User-Generated Content | No | 他人に配信されない。自分専用の日記 |
| Social Media | No | フィード・共有・発見なし |
| Messaging and Chat | No（v1.0）。Phase 3は要注意 | Appleの定義は「ユーザー同士の直接のやりとり」。KiriのAIチャットはユーザー間通信ではない。ただし2026年にチャット機能ありでNoと答えて2.3.6で指摘された報告がある【確認済：検索結果の開発者報告】→ **Phase 3でチャットを入れるときは Yes で出す方向で再検討**【判断】 |
| Advertising | No | 広告なし |
| Profanity / Crude Humor | None | |
| Horror / Fear Themes | None | 脅し表現は禁止方針（CLAUDE.md） |
| Alcohol, Tobacco, Drugs | None | |
| Medical or Treatment Information | None | 診断・治療・服薬の助言をしない（利用規約1節）。**ただし**自傷・自殺の相談窓口案内カードは「治療情報」ではなく支援先の案内。【判断】質問票で自殺/自傷に触れる項目が出たら「頻度=なし/まれ」で、窓口案内のみと説明 |
| Health or Wellness Topics | **Infrequent（またはYes）** | 気分記録と「今日の小さな行動」などのセルフケア提案は「自己ケア・生活提案」の定義に近い【確認済：定義は自己ケア・ライフスタイル提案】。ここを正直にYesとして9+になるのが安全 |
| Mature / Suggestive Themes, Sexual Content, Nudity | None | |
| Cartoon/Realistic Violence, Weapons | None | |
| Gambling / Simulated Gambling / Contests / Loot Boxes | None | 占い≠賭博。ガチャ等なし |

**想定結果: 9+（Health/Wellnessを申告した場合）。** 申告しなければ4+。**【判断】** 日記にAIが返す内容が気分の落ち込みに触れる点、自由記述でつらい内容が入りうる点から、13+を自主的に選ぶ（Age Rating Override相当の機能の有無は**【未確認】**）選択肢もある。利用規約は未成年は保護者同意としている。審査上は「実際より低い」ことが問題で、高く申告する分には問題になりにくい。

---

## 4. App Review 提出情報ドラフト

- Sign-in required: **No**（デモアカウント不要）
- Contact: くうが株式会社 / ひとみうさ（氏名・電話は国際形式 `+81…` で別途入力。Appleは「+」と国番号付きを要求【確認済】）/ info@kugainc.com
- 審査メモは英語（Appleは言語自由【確認済】、4000bytes以内）。**3286bytes**（実測）

```
Kiri is a Japanese-language reflective journal (UI is Japanese only). It is NOT a fortune-telling/horoscope app: the user writes a daily mood/event entry, and an AI (Claude by Anthropic) writes a reflective reading using Four Pillars of Destiny (shichusuimei) and biorhythm as lenses. Features beyond a website: on-device history in native storage, backup export/import via the iOS share sheet, App Lock (Face ID/Touch ID/passcode), haptics, a privacy screen in the app switcher, offline history and chart viewing, and in-app crisis support. The UI is bundled in the app (no remote URL loaded); only the AI reading calls our server.

NO ACCOUNT / NO LOGIN. No demo credentials needed. v1.0 has no purchases and no chat. Paid features are not in this build.

HOW TO TEST (about 3 minutes)
1. Launch. Enter any nickname and birth date (e.g. 1990-05-15). Birth time and gender are optional.
2. On the diary screen pick a mood, type anything in the event field (e.g. "Had a quiet day at work") and tap the read button (labelled in Japanese).
3. AI CONSENT (Guideline 5.1.2(i)): on the first read a consent dialog appears. It states that the entry is sent via our server to Anthropic's AI (Claude), that nothing is stored on our server, and that consent can be withdrawn in Settings. Tap the agree button to continue. If you decline, nothing is sent. Withdraw: Settings (gear icon, top right) > AI consent withdrawal.
4. The reading shows the Four Pillars chart, biorhythm, color/number/direction hints and Kiri's reading. It is saved to History on the device.
5. CRISIS SUPPORT (Guideline 1.4.1/5.1): type the Japanese phrase "消えてしまいたい" in the event field and read. A support card with Japanese helplines (#Inochi SOS 0120-061-338, Yorisoi Hotline 0120-279-338, Inochi no Denwa 0570-783-556) appears at the top, and the reading switches to a gentle mode. Detection of such phrases also runs on-device before anything is sent, so the card appears even if the user declines AI consent.
6. APP LOCK: Settings > App Lock, turn on (requires a device passcode). Background the app and return after the chosen time to see the lock screen; tap the button to authenticate with Face ID/passcode. The lock fails open if the device passcode is removed so users are never locked out of their own data.
7. BACKUP/DELETE: Settings > Backup exports a JSON file via the share sheet; "Delete all" erases local records.

DATA HANDLING. Diary text, profile and history are stored only on the device. For a reading, the input is sent over HTTPS to https://kiri.kugainc.com (Cloudflare Workers) and forwarded to Anthropic's API; the server stores no diary content. Only a keyed hash of the IP and a usage counter are kept for abuse prevention. No tracking, no ads, no third-party analytics SDK. Privacy policy: https://kiri.kugainc.com/privacy  Support: https://kiri.kugainc.com/support

NOT MEDICAL. Kiri makes no medical, diagnostic or treatment claims. Terms and in-app text state it is for self-care and entertainment and direct users to professionals when unwell.

Server note: the API has a per-IP rate limit and a daily quota; if a reading shows a "try again later" message, please retry a little later or contact info@kugainc.com (we respond quickly). Contact: KUGA K.K., info@kugainc.com
```

審査前に必ず潰す運用リスク【判断・重要】:
- **日次クォータ**: `DAILY_LIMIT_ANALYZE=30`（全体合算）のまま（DECISIONS付記）。審査員と他ユーザーで30回に達すると429になり、審査員が「機能しない」と判断して2.1拒否になりうる。**審査提出の期間はクォータを引き上げる**（Anthropicの月次利用額上限とセットで）。
- 本番API（kiri.kugainc.com）とCORS（capacitor://localhost）がデプロイ済みで、実機で通ることを提出前にTestFlightで確認（D-21の本番確認は「デプロイ後」と記載＝未実施）。
- 審査員の環境で日本語入力が難しい場合に備え、メモにコピペ可能な日本語サンプル（日記文・危機文）を付ける。

---

## 5. スクリーンショット計画とプレビュー動画

### 5-1. サイズ【確認済：Apple公式 screenshot-specifications、2026-10-09取得】
- iPhoneは**6.1"系（1179×2556 または 1206×2622）が必須**（Dynamic Island 中型）。6.5"系（1284×2778 / 1242×2688）は大型6.9"(1320×2868)を出さない場合に必須と表にある。Appleの説明は「最高解像度だけで可、他は自動縮小」。→ **1320×2868（6.9"）を撮り、念のため 1206×2622 または 1179×2556 も用意**。表記は公式では6.9/6.5/6.1の「インチ名」でなく「Dynamic Island 大/中」等なので、App Store Connectの表示に従う。
- iPadは**iPadでも動く場合のみ**13"（2064×2752 か 2048×2732）が必須。KiriがiPad対応なら必須、iPhone専用（`TARGETED_DEVICE_FAMILY=1`）にすればiPadスクショ不要。Capacitorの既定はユニバーサル（iPad対応）になりやすい。**iPhone専用にするか判断**【判断・推奨: v1.0はiPhone専用】。
- 形式 jpeg/png・**アルファ無し**・1言語/サイズあたり1〜10枚【確認済】。2027年4月以降、iOS 27.1 SDKでビルドする場合はiPhone Duo サイズ追加【確認済】。

### 5-2. 構成（日記を前に出す。4.3対策）
順番 = 審査員とユーザーが最初に見る順。1〜2枚目に占い要素を置かない。

| # | 画面 | JAキャプション | ENキャプション |
|---|---|---|---|
| 1 | 日記入力（気分11種アイコン＋出来事欄） | 今日の気分と出来事を、静かに書きとめる | Write down your mood and your day, quietly |
| 2 | 読み解き結果（Kiriの言葉＋色・数字・方角の手がかり） | やさしい言葉で、今日をふり返る | A gentle reading to reflect on your day |
| 3 | 履歴一覧＋詳細モーダル | 記録は積み重なる。いつでも読み返せる | Your entries, ready to revisit |
| 4 | バイオリズムと命式（1枚） | 日記に添える、もうひとつの視点 | Another lens to go with your journal |
| 5 | アプリのロック画面「静かな扉」 | Face IDで、自分だけの日記に | Face ID keeps your journal private |
| 6 | 同意画面 or 設定（バックアップ/すべて削除/同意取り消し） | 記録はこの端末の中に。同意はいつでも取り消せます | Entries stay on your device. Withdraw consent any time |
| 7 | 相談窓口カード（任意・センシティブなので慎重に） | つらいときは、相談先をご案内 | Support is one tap away when it feels heavy |

- 撮影は実機/シミュレータでPlaywrightでなくXcodeシミュレータ（iPhone 17 Pro Max 系）を使う。ダミーデータを使い、実在の日記を載せない。ステータスバー整形（9:41・満充電）は `xcrun simctl status_bar` で。
- キャプションは画像に焼き込む形式（Pencilで合成）。日本語の折り返しは実幅で確認（手動br禁止）。
- 「当たる」「運勢」「占い」の語をスクショ内に出さない（アプリ画面内にあれば隠れない場合も多いので、画面ごとの文言も確認）。

### 5-3. プレビュー動画（任意・15〜30秒）
流れ: 起動（霧の谷の光・スプラッシュ）→ 気分を選ぶ → 一言書く → 読み解くを押す → 同意（初回のみ）→ 霧の中で読み解き中 → 結果 → 履歴に残る → ロックして再オープン。音なしで字幕のみ。【未確認】動画の解像度要件は今回取得せず（デバイスサイズ依存で最大3本・ローカライズごと【確認済】）。必須ではないので初回は見送りも可。

---

## 6. リスク一覧と対策

| # | リスク | 重大度 | 対策 |
|---|---|---|---|
| R1 | **4.3(b) スパム（占い飽和）**。公式本文に fortune telling が明記【確認済】 | 高（ほぼ確実に1回は指摘と想定） | ①名前/サブタイ/説明/キーワード/スクショに占い語を出さない ②カテゴリをLifestyle+Productivityに ③**日記が主・読み解きは従**をUIの導線でも成立させる（例: 読み解きを使わなくても記録・履歴・バックアップ・ロックだけで有用であること）④審査メモの冒頭で「占いアプリではない」と差別化を明記（§4）⑤差別化の実体: 端末内保存＋AI同意＋サーバー保存ゼロ＋危機対応＋アプリロック＋バックアップ。⑥拒否後は文面を変えるだけでなく**機能で応える**（フォーラム報告で、メタデータだけ直す再提出は無効）。異議申し立て(App Review Board)も併用 |
| R1' | 四柱推命/バイオリズムの体験が結果画面の中心 | 高 | 結果画面の見出しを「占い結果」でなく「今日の読み解き」「記録」に。命式は折りたたみ/二次的に。【判断】UI変更はオーナー決定 |
| R2 | **4.2 最低機能（Webの再パッケージ）** | 中 | D-12/D-20の対策が実装済み: 静的同梱（リモートURLでない）、Preferences保存、Haptics、Share、ロック（生体認証）、プライバシー画面、オフラインで履歴閲覧。審査メモに列挙済み。**オフライン時に履歴/ロック/バックアップが動く**ことを提出前に実機確認。読み解きだけはサーバー依存だと明記 |
| R3 | **5.1.2(i) AI第三者共有** | 中（対応済みだが弱点あり） | D-23の同意画面は「送信するデータ・送信先(Anthropic)・目的・撤回方法」を含む。**弱点**: 実務解釈(非公式)では最初の送信前の明示同意が必須。Kiriは「読み解く」押下時に同意を出す構成なのでOK。ポリシーに保持期間を追記。審査メモにフロー記載。2026年に追加改訂があったかは**【未確認】**。同意文でAnthropicの保持（最長30日）に触れるか【判断】 |
| R4 | **1.4.1 医療アプリ／5.1.1(ix) 規制分野** | 低〜中 | 医療・診断の主張なし（規約1節、CLAUDE.md）。メンタルヘルス隣接なので: カテゴリはHealth & Fitnessにしない／説明に注意書き（実装済み）／相談窓口カード。5.1.1(ix)は法人名義提出で適合（くうが株式会社） |
| R5 | **1.2 UGC** | 低 | 他者に公開されない自分専用の日記のためUGC要件(報告/ブロック)は対象外のはず。審査メモで「共有・公開機能なし」と明記（バックアップ共有は本人のファイル書き出しのみ） |
| R6 | **2.1 動作不備（クォータ/CORS/本番API停止）** | 高（運用） | §4のクォータ引き上げ、TestFlightで実機E2E、Workers/Upstash/Anthropic上限の確認、審査期間中はAPIを止めない |
| R7 | **5.1.1 プライバシー情報の不一致** | 中 | 栄養ラベル・ポリシー・同意文の三者で保持表現を揃える（Anthropic最長30日）。ポリシー「Cookie・広告識別子を使用しません」はv1.0では正 |
| R8 | **3.1.1 / 3.1.2 課金（Phase 3）** | v1.0では無関係 | v1.0に購入導線・「プレミアム」表示・課金の言及を一切入れない（D-24でフラグ0）。Phase 3: IAP必須、復元ボタン、利用規約/プライバシーへのリンクをアプリ内とメタデータ両方、更新価格を最も目立たせる、Webへの決済誘導は出さない（D-14）【確認済（調査メモ）。外部決済リンク規定の最新は未確認】 |
| R9 | **旧文言残存**（「開発プレビュー」: /terms 3節、/support FAQ） | 中 | v1.0提出前に改稿(L-4)。審査員が支援ページで「プレビュー」を見ると未完成と判断する |
| R10 | 名前 "Kiri" の重複・商標 | 低〜中 | 予約して確認。J-PlatPatで商標確認【未確認】 |
| R11 | 日本の相談窓口番号の陳腐化 | 低 | `SUPPORT_LINES_CHECKED_AT` 2026-10-08を提出直前に再確認（D-15） |
| R12 | 危機表現の取りこぼし（正規表現） | 中 | 遠回しな表現は `SAFETY_GUIDANCE` に委ねる設計。審査では露呈しにくいが、公開後モニタリング方法（本文を残さない方針と両立する範囲）を検討 |

### 異議申し立て文面の骨子（4.3拒否時）
「Kiriは占いの結果を売るアプリではなく、日記（記録・履歴・バックアップ・生体認証ロック）を中心にしたジャーナリング体験です。AIによる読み解きは記録の振り返りのためのもので、断定や予言を避け、危機表現には相談窓口へ誘導します。日記データは端末内にのみ保存され、サーバーに保存しません。同カテゴリの既存アプリが提供しない差別化点は①〜⑥」。

---

## 7. 提出前チェックリスト

### Apple Developer / App Store Connect 準備
- [ ] Apple Developer Program（法人: くうが株式会社、D-U-N-S 964317277）加入完了・承認
- [ ] 有料App契約（Paid Apps Agreement）／税務／銀行口座: v1.0無料なら不要だが、**Phase 3前に必須**。今から進めておく
- [ ] 日本の特定商取引法に基づく表記（課金時）【未確認：必要性は課金開始時に確認】
- [ ] App Store Connectでアプリ作成（名前予約・Bundle ID `com.kugainc.kiri`・SKU）
- [ ] App Information: カテゴリ、年齢レーティング質問票、Content Rights、EULA
- [ ] App Privacy 回答（§2）、Privacy Policy URL
- [ ] 価格=無料、配信地域=日本（推奨）
- [ ] Review情報: 連絡先・電話(+81)・メモ（§4）・サインイン不要にチェック

### Xcode / プロジェクト
- [ ] Xcode 26.x でビルド（2026-04-28以降はXcode 26+/iOS 26 SDKが必須【確認済：調査メモ】）
- [ ] **`ITSAppUsesNonExemptEncryption` = NO**（Info.plist）。HTTPS（標準暗号）のみで独自暗号を使わないなら免除対象。Capacitor/OSのHTTPSのみ使用でNO、フランス配信は不要という扱い【輸出コンプライアンスの最終判断は法務確認。**未確認**】。ロックはOS生体認証でKiri独自の暗号実装なし（D-25）。NOにしておくとTestFlight/提出のたびの質問が出ない
- [ ] `NSFaceIDUsageDescription`（Face ID使用理由の日本語説明。生体認証プラグイン使用で必須）
- [ ] 写真/カメラ/位置情報/トラッキングの権限文字列は**入れない**（使わないものを入れると指摘対象）。バックアップは共有シート経由でファイル権限不要
- [ ] `PrivacyInfo.xcprivacy`: アプリ自体と、Capacitor/Preferences(UserDefaults=CA92.1)/Filesystem/privacy-screen/biometric/haptics 各プラグイン同梱のmanifestを確認。Xcodeの「Privacy Report」で集約確認【未確認：各プラグイン同梱状況】。Required Reason APIの申告漏れ=ITMS-91053等で警告/却下になる
- [ ] 対象OS iOS 15.5（D-25で15.5に引き上げ）。iPhone専用か（TARGETED_DEVICE_FAMILY）を決定
- [ ] アイコン: 1024×1024 PNG・**角丸なし・アルファなし**（App Store用）。AppIcon asset の全サイズ
- [ ] 起動画面: 霧グラデの機種別クロップ（D-付記）で黒画面が出ないことを実機で確認
- [ ] ステータスバー、ダークのみ UI（`UIUserInterfaceStyle`）の指定確認
- [ ] `capacitor.config`: `server.url` を設定していない（リモートURL丸ごと表示はNG）。`CapacitorHttp` 無効のまま
- [ ] ビルドは `npm run ios:build`（`NEXT_PUBLIC_KIRI_CHAT_PREVIEW=0` 強制・安全検査付き）。**`--dev` ビルドをアーカイブに使わない**
- [ ] バージョン/ビルド番号、署名（Distribution証明書・Provisioning）、Automatically manage signing

### TestFlight 手順
1. Xcodeで Product > Archive（Any iOS Device）→ Distribute App > App Store Connect > Upload
2. App Store Connectで処理完了（メール）、輸出コンプライアンス質問が出なければplist設定が効いている
3. 内部テスター（自分）で実機検証: 同意→読み解き→履歴→バックアップ共有→ロック→危機文→機内モード→削除
4. 本番API/CORSを実機で確認（シミュレータiOS 18.4でcapacitor://のfetch失敗報告あり、実機で確認【調査メモ】）
5. 必要なら外部テスター（Beta App Review が別途ある）
6. 問題なければビルドを選択して審査へ提出

### 提出直前の最終確認
- [ ] /privacy, /terms, /support から「開発プレビュー」「チャット」等のv1.0に無い機能の表記を整理
- [ ] 日次クォータ引き上げ・Anthropic上限・Upstash状態
- [ ] 相談窓口の再確認日の更新
- [ ] スクショ（アルファ無し・必須サイズ）、キャプションのチェック（占い語なし）
- [ ] 栄養ラベル・ポリシー・同意文の保持表現の一致

---

## 8. 参照した公式ソース（取得日 2026-10-09）
- 審査ガイドライン https://developer.apple.com/app-store/review/guidelines/ （4.3(b) fortune telling、1.4.1、5.1.2(i)、5.1.1(ix)、1.2、末尾約12KBは未読）
- スクショ仕様 https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- プラットフォーム情報（文字数上限） https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- 年齢レーティング定義 https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions （一覧のうちiOS 26節の詳細・Japan節は未読）
- App Privacy詳細 https://developer.apple.com/app-store/app-privacy-details/
- 占星術4.3拒否の例（フォーラム）https://developer.apple.com/forums/thread/737999 / 異議: https://developer.apple.com/forums/thread/820697
- Anthropic保持 https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-personal-data
- 年齢レーティング更新報道 https://ppc.land/apple-forces-13-rating-on-apps-with-social-feeds-from-september/ ほか
- 事前調査 kiri-ios-external-research.md
