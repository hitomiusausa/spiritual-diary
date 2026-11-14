# 4.3(b)（飽和カテゴリ＝占い）対策の深掘り（2026-11-14）

D-27（日記と内省として見せる）の続き。調べた事実 → Kiri の現状の弱点 → 対策案（段階別）→ 落ちたときの返し方、の順。
対策のうち画面・名前・カテゴリに関わるものはひとみうさの判断待ち（まだ実装していない）。

## 1. 調べてわかったこと

- **ガイドライン原文（4.3(b)）**: dating, flashlight, sound effects, wallpaper, simple timers, **fortune telling** は well established で、"meaningfully different or improved experience" でない限り新規を受け付けない。さらに「更新しない・人が集まらないものは今後削除しうる」とも書かれている。
- **実際のリジェクト文**（Apple Developer Forums 737999, 2023〜2024）: "Your app **primarily features** astrology, horoscopes, palm reading, fortune telling, or zodiac reports. As such, it duplicates the content and functionality of many other similar apps"。判断の軸は「**主に何を見せているか**」。
- **落ちたままの例**
  - おみくじアプリ（Classmethod 2022）: 機能を足す・運勢表示を消す・アイコンを変える・「占い要素を除いた」と申し立てる、のどれでも同じ文面で再リジェクト。TestFlight どまり。
  - 占星術アプリ（Forums 737999）: 占星術・数秘術を消してタロットだけにしても変わらず。
  - 共通点: **中身はそのままで、語や一部機能を削っただけ**。審査側は「主目的が占い」と見たままになる。
- **通った例**
  - AI 性格診断アプリ（Zenn 2025-08）: メタデータから占い語を消す・熱意を伝える申し立ては失敗。**テーマ色を紫→白と青、カテゴリをエンタメ→ヘルスケア、文言を心の健康寄り**に変えて通過。著者は「審査員が見てすぐわかる変更のほうが効く」と書いている。
  - スロットアプリ（ゆるふわSE 2023）: 機能追加を重ねて約1か月後に通過（理由は不明）。
  - 解説記事（molfar・newly など）の共通の助言: **占いを「製品」ではなく「エンジン」にする**（例：占星術で導く日記アプリ）。色変更や小さな文言変更だけでは足りない。別アカウントでの再提出は避ける。
- 注意: 体験談は個人・企業ブログで再現性はない。4.3 は担当者の裁量が大きい。

出典: [Apple 審査ガイドライン](https://developer.apple.com/app-store/review/guidelines/) / [Forums 737999](https://developer.apple.com/forums/thread/737999) / [Forums 819940](https://developer.apple.com/forums/thread/819940) / [Zenn: 個人開発の占いアプリで4.3(b)を突破](https://zenn.dev/ichihos1111/articles/93de94636f6449) / [Classmethod: おみくじアプリ](https://dev.classmethod.jp/articles/newyear-app-release-challenge/) / [ゆるふわSE](https://www.yurufuwase.com/entry/2023/12/04/190000) / [molfar](https://www.molfar.io/blog/apple-review) / [newly](https://newly.app/guides/guideline-4-3-spam-rejection)

## 2. Kiri の現状で「主に占い」と見られそうなところ

審査員は日本語を翻訳して見ることが多い前提で、最初の数画面と審査メモを洗い出した。

| 場所 | 今の見え方 | 危なさ |
|---|---|---|
| 最初の画面の見出し下（`SpiritualDiary.jsx:1599`） | 「バイオリズム×四柱推命から読み解く心の分析ノート」→ 翻訳すると "Four Pillars of Destiny" が最初に出る | 高 |
| ページ説明（`layout.js:24`） | 「バイオリズムと四柱推命から、Kiriが今日の心の流れを…読み解く」 | 中 |
| 最初の入力 | 生年月日を先に聞く（占いアプリの典型の入口） | 中（必要な入力なので消せない。見せ方で和らげる） |
| 結果「今日のヒント」 | 色・**数字・方角**・距離感。方角の説明に「風水」 | **高**（ラッキーカラー／ナンバー／方位は星占いの定番そのもの） |
| 結果の四柱推命・バイオリズム・テーマ別のめやす | 閉じた状態だが、開くと命式・大運・点数バー | 中（閉じてあるのは良い） |
| ストア名 | Kiri - **Mind & Energy** Note | 中（Energy はスピリチュアル寄りに読まれる） |
| カテゴリ | ライフスタイル | 中（占星術アプリが多く並ぶ棚） |
| 審査メモ冒頭 | 2文目で "Four Pillars of Destiny … to generate reflective readings" | 高（自分から「主機能＝運命術」と書いている） |
| 日記としての機能 | 書く・最近の記録30件を読み返す・バックアップ | 弱い（「書いた日記を振り返る」専用の画面がない） |

まとめ: 今の Kiri は「生年月日を入れる → 一言書く → 読み解きとラッキー項目が出る」という流れで、審査員には **占いが製品、日記が入力欄** に見えうる。D-27 の方針は正しいが、画面とメモがまだ追いついていない。

## 3. 対策案（効き目の小さい順に積む）

### 段階A: 言葉と申請情報（コードは小さい・すぐできる）
1. **最初の画面の一言**を日記が先の言い方に。例「気分と出来事を書きとめて、Kiriと静かに振り返るノート」。四柱推命・バイオリズムは「Kiriについて」や説明モーダルで正直に書く（隠さない）。
2. **審査メモの組み替え**（下の 5 に案）。冒頭は日記・振り返り・安全機能・端末内保存。四柱推命は "a traditional East Asian calendar system (the sexagenary cycle, known as Four Pillars) used only as a lens for reflection prompts" と説明し、"Destiny" の語は使わない。正直さは保つ（D-27「NOT a fortune-telling app と書かない」も守る）。
3. **ストア名**: 「Kiri - Mind & Energy Note」→ 例「Kiri - 気持ちを書く日記」/「Kiri: Journal & Reflection」。
4. **スクリーンショットの順**: ①書く画面 ②最近の記録 ③Kiriの読み解き文（ヒント欄・点数バーは写さない）④Kiriと話す ⑤ロック・バックアップ・相談窓口。
5. **キーワード**: 日記, ジャーナリング, 気分, 振り返り, セルフケア, 内省, 記録。占い・四柱推命・運勢は入れない。

### 段階B: 結果画面の見せ方（ひとみうさの見た目の判断が必要）
6. **「今日のヒント」の数字と方角**。最も「ラッキー項目」に見える部分。ただし CLAUDE.md で「色・数字・方角などの具体的な手がかり」は Kiri の核と定めているので、消すかどうかはコンセプトの判断になる。選択肢:
   - 6a（軽い）: 残す。説明の「風水」を消し、ヒント欄を閉じた状態から始め、スクリーンショットと審査メモには出さない。
   - 6b（中）: 色と距離感だけ表に出し、数字と方角は「もっと見る」の中へ。
   - 6c（強い）: 数字と方角を外す（CLAUDE.md のプロダクト前提の変更を伴う）。
7. **カテゴリの変更**: ライフスタイル → **ヘルスケア／フィットネス**（Daylio・Reflectly など日記系アプリの多い棚。Zenn の通過例もこれ）。代償: 健康の棚は医療的な言い回しへの目が厳しくなる。Kiri は既に「医療の助言はしない」ので相性は悪くない。第2候補は仕事効率化。
8. 生年月日の入力欄に「Kiriがあなたの暦（こよみ）のリズムを知るために使います」程度の一言を添え、占いの入口に見えにくくする。

### 段階C: 「日記として意味のある違い」を足す（一番効くが、設計と合意が先）
9. **振り返りの画面**: 最近の記録を「日付と気分の一覧（カレンダーまたは帯）」で見られるようにし、Kiri が「この1週間のあなたの言葉」をまとめる。占いを製品ではなく**エンジン**にする、という通過例の考え方そのもの。審査メモにも具体的に書ける。
   - 実装の規模感: 一覧と気分の帯は端末内のデータだけで作れる（AI不要）。週のまとめを AI でやる場合は費用・上限・同意文の見直しが要る。まずは AI なしの一覧から。

### 段階D: 落ちたときの備え
10. **返答（Resolution Center の Reply）**は、変更したことを**画面ごとに具体的に**書く（「占い要素を除いた」だけの申し立ては通らない例がある）。ひな形は下の 6。
11. 2回落ちたら App Review Board へ不服申し立て。それでも駄目なら Apple 自身が勧めている**Webアプリ（ホーム画面に追加）**で続ける道がある。Kiri は kiri.kugainc.com で既に動いているので、ここが保険になる。
12. 公開後も定期的に更新する（4.3(b) は「更新しないアプリは削除しうる」）。
13. 別アカウント・別名での出し直しはしない（規約違反扱いの危険）。

## 4. おすすめの組み合わせ

- **最低限（今回の提出に必ず）**: A の 1〜5 ＋ B の 6a（6b 以上はひとみうさのコンセプト判断）。
- **できれば**: B の 7（カテゴリ）。見た目の色（紫基調）は Kiri の世界観の核なので変えない前提でよい（色だけ変えても効かない例もある）。
- **1回目で落ちたら**: C の 9 を入れて再提出（返答にも書ける「意味のある違い」になる）。先に入れておくと1回目の通過率は上がるが、リリースは遅れる。

## 5. 審査メモの組み替え案（英語・貼り付け用の下書き）

```text
Kiri is a Japanese-language journaling app for mood and daily reflection. Users write about their day (events, feelings and intuitions), keep their entries privately on the device, and read them back later in their history. Kiri, an AI companion, responds to each entry with a short, gentle reflection that helps the user notice patterns in their own words.

To shape the tone of these reflections, the app uses two traditional rhythm systems as a lens: a biorhythm cycle and the East Asian sexagenary calendar (known as Four Pillars). They appear only in collapsed "details" sections of the result screen. Kiri does not make predictions, and its words are not medical, financial or legal advice. The app states that Kiri's words are AI-generated.

What makes Kiri different from other apps:
- Journaling first: no account; entries stay on the device; backup export/import through the iOS share sheet; App Lock with Face ID / Touch ID / passcode; a privacy screen in the app switcher.
- Safety by design: if an entry or chat message contains expressions of self-harm or suicidal thoughts, the app shows Japanese crisis hotlines (including lines for people under 18) before anything else, switches to a supportive mode, and does not call the AI for that chat message.
- Consent before any AI request: a dialog explains the transfer to Anthropic (United States) through our server; declining keeps the entry on the device.

(以下、テスト手順・課金・上限・URL は app-review-notes.md の既存文をそのまま続ける)
```

## 6. リジェクトされたときの返答ひな形（英語）

```text
Thank you for your review. We would like to clarify how Kiri differs from fortune-telling apps, and describe the changes we made.

Kiri's primary purpose is private journaling and self-reflection:
1. [変更点を画面名つきで具体的に。例: The home screen now starts with the journal entry; the "lucky number" and "direction" items were removed from the result screen.]
2. [日記として固有の機能。例: The History screen shows the user's past entries and moods so they can look back on their week.]
3. Safety: crisis hotlines are shown before any AI response when an entry suggests self-harm.
4. Privacy: no account, on-device storage, App Lock, and explicit consent before any AI request.

The calendar-based rhythm sections are optional, collapsed by default, and used only as a tone for the reflections. We would appreciate a re-review, and we are happy to provide a demo video.
```
