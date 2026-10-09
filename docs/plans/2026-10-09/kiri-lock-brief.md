# Kiri アプリロック調査ブリーフ（読み取り専用調査 / 2026-10-09）

## 結論（先に）
「ここにのこす」の“あんしんロック”は **暗号化ではなく UI ゲート**（WebAuthn の userVerification を通すだけ）。パスワード/PIN は意図的に **存在しない**。したがって「パスワードをかける」というKiriの要望に対し、そのまま流用できるのは次の3点だけ:
(a) ゲート方式（起動時は常にロック、解除でメモリ上フラグを下げる）、(b) 自動ロックの時間計算（非表示時間の timestamp 差分＋前景アイドルタイマー）、(c) スイッチャー目隠しの考え方。
一方「パスワードで日記を暗号化する」部分は、ここにのこす側では **バックアップファイルにだけ** 実装されている（Argon2id/PBKDF2 + AES-GCM + DEK ラップ）。Kiri の端末内データ暗号化は流用元が無く、新規設計になる。

## 1. ここにのこす の実装（file:line）
ルート: `/Users/usausagi/Documents/AI_Playground/ここにのこす/koko-ni-nokosu_hackathon-diary`

- 状況: BUILD_STATUS.md:17「Stage 7 あんしんロック（WebAuthn UVゲート・自動ロック・前景アイドル・スイッチャー秘匿・非対応フォールバック）✅」、:11 Stage 6 バックアップ実暗号化 ✅、172テスト緑（:14）。実機スパイク（S-1〜S-4）は未記入（docs/SPIKE_RESULTS.md の判定欄すべて ⬜）。
- 設計の柱 BUILD_STATUS.md:46「あんしんロックは暗号化ではなくUIゲート。PRF拡張なしでは生体認証で暗号鍵を守れない。文言で「暗号化」と言わない。暗号保護はバックアップファイルのみ」
- 形態: Vite+React+TS の **PWA**（ネイティブではない）。データは IndexedDB(Dexie)。Capacitor は未使用（SECURITY_THREAT_MODEL.md:54 で「ネイティブラップ(Capacitor privacy-screen)が唯一確実、v1.0は見送り」）。

### 脅威モデル（docs/SECURITY_THREAT_MODEL.md:13-21）
- 守る: A 端末を一時的に手にする非技術者（家族・同僚）／B バックアップ入手者／D 運営者（サーバーに何も無い）。
- 守らない（明記）: C フルアクセスの技術者（DevTools で IndexedDB を読める）。:27「端末内データ自体は暗号化されない（攻撃者Cには無力）」。

### 何が暗号化され、何がゲートか
- 端末内の写真・メモ: **平文のまま IndexedDB**。ゲートは React 状態 `locked` のみ（app/src/app/LockContext.tsx:106,163-）。
- バックアップファイル: 暗号化（下記）。

### 鍵導出・検証子の保存
- ロック本体に鍵導出・パスワード・検証子は **無い**。認証は WebAuthn: `userVerification: 'required'`, `authenticatorAttachment:'platform'`, `residentKey:'preferred'`, ES256/RS256（app/src/lib/lock/webauthn.ts:103-119）。アサーションはサーバー検証せず、成功/失敗だけ見る（:4-8, :141-143）。
- 保存するのは credentialId（base64url）と設定のみ。`lockEnabled / lockAutoMinutes / hideInSwitcher / lockCredentialId` を Settings に保存（app/src/data/types.ts:185-192、"Never a secret by itself"）。
- バックアップ側 KDF（packages/backup-format/src/kdf.ts, constants.ts）:
  - Argon2id（hash-wasm）: mem=19456KiB, iter=2, par=1（constants.ts:39）、出力32B（kdf.ts:37-45）
  - フォールバック PBKDF2-HMAC-SHA256 600,000回（constants.ts:42, kdf.ts:47-57）
  - salt 16B（constants.ts:27）、パスフレーズは NFC 正規化→UTF-8（kdf.ts:34）、最小15コードポイント（constants.ts:45）
  - ランダム256bit DEK を KEK で AES-GCM ラップ（crypto.ts:55-60, create.ts:73）。本体はチャンクごと AES-GCM（STREAM構成、AADでチャンク番号束縛）。パスフレーズ/導出鍵は永続化しない。

### ロックアウト/レート制限
- **無し**（アプリ側に失敗回数制限は無い）。試行制限は OS（Face ID/パスコード）任せ。失敗時は文言「認証に失敗しました。もう一度お試しください。」(locales/ja/common.json:52)。

### 忘れた場合
- ロック: そもそも合言葉が無く、端末の生体/パスコードを使う → 「忘れる」状態が構造的に発生しない。非対応環境は「利用できません」と表示し端末の画面ロックを案内。**独自PINは実装しない**（SECURITY_THREAT_MODEL.md:43、implementation plan Stage 7 でも「暗証番号変更は載せない」）。
- バックアップ合言葉: 「運営側でも確認・再発行できません。忘れると開けなくなります」(common.json:327)。回復手段なし（意図的）。

### 自動ロック（LockContext.tsx）
- 起動時は常にロック（:142-148 hydrate で `setLocked(settings.lockEnabled)`）。
- 非表示の経過時間を timestamp 差分で判定（:233-272）。理由は背景タイマーがモバイルで間引かれるため（コメント :223-232）。値は 'immediate' / 1 / 5 / 15 分。sessionStorage には `hiddenAt` の時刻だけ（:26）。
- 前景アイドルタイマー（pointerdown/keydown/touchstart でリセット, :284-310）。
- スイッチャー目隠し: blur＋visibilitychange で `switcherHidden`（:236-237, 247-248）。ベストエフォート。限界を設定文言で明記（threat model :47-54: iOS では間に合わない場合あり）。

### 生体認証
- OS 任せ。方式（Face ID か パスコードか）はアプリから強制不可（threat model :41）。PRF 拡張による端末内暗号化は「将来拡張・DEK二重ラップ構成だけ設計」（:32-37）、S-3 で実機確認待ち。iOS 18.0-18.3 の PRF データ喪失バグ注意（:34）。

### テスト
- LockAuthenticator を props 注入し、`fakeAuthenticator.ts` で差替え。webauthn.test.ts / LockSetup / LockSettings / Locked / AppShell / Settings の各 test。バックアップは packages/backup-format/test/backup-format.test.ts。

### 既知課題/判断
- 実機未検証: S-1（iPhone上のArgon2id速度）、S-2（standalone PWA でオフライン WebAuthn）、S-3（PRF）、S-4（スイッチャー）。
- 判断ログ: ~/Dropbox/うさみみデザイン/AI/Fable5/fable5-decisions_ver.11.md, sonnet-opus-decisions_ver.2.md（今回は設計文書のみ精読）。

## 2. Kiri の現状（spiritual-diary-wt-a, branch agent/ios-shell-a）
- 保存: `src/lib/storage.js` が同期 `getItem/setItem/removeItem` を提供。Web=localStorage、iOS=起動時に Preferences からメモリへロードし、書き込みはメモリ即時＋Preferences に write-through（storage.js:80-94, 183-194）。対象キー5つ（:22-28）: history / profile / chat / analysis-cache / consent。呼び出し側は完全同期（history.js:35,46 / analysisCache.js:54,66 / consent.js:8,18 / backup.js:71）。
- バックアップ: D-09 第一段階=バージョン付き **平文JSON** エクスポート/インポート（backup.js:17-24, ファイル名 kiri-backup-*.json）。D-09 第二段階=Preferences へ移して iCloud バックアップに乗せる（DECISIONS.md:57-65）。→ **Preferences は UserDefaults で平文、iCloud 端末バックアップ対象**。
- 分析: プロフィール（生年月日含む）＋日記をサーバー API（Claude）へ送信。サーバー保存ゼロ（D-18, DECISIONS.md:153-）。端末側 analysisCache は当日・最大10件、キーは入力の SHA-256（日記本文は平文キーでないが、**値の分析結果は平文**）。
- iOS 殻: Capacitor 8.5.2、plugins は preferences/filesystem/share/haptics/splash-screen/status-bar（package.json:23-30）。D-12: 審査 4.2（薄い WebView）対策としてネイティブ統合を入れる方針 → Face ID ロックは“ネイティブ統合”の実績として好相性。Info.plist に NSFaceIDUsageDescription は **まだ無い**（grep 0件）。

## 3. 適合度評価
### 方式選択（推奨の順）
- 案A: UIゲート（ここにのこす式）
  - Web: WebAuthn platform authenticator（Face ID/Touch ID/端末パスコード）。実装コスト小。ただし localStorage は平文のまま（DevTools で読める）。
  - iOS: Capacitor 生体認証プラグインで Face ID/パスコードを要求。Preferences は平文のまま（脱獄/バックアップ解析は守れない）。
  - 良い点: 忘れてもデータ喪失しない、D-09/バックアップ互換、同期 storage shim を壊さない。
  - 守れる範囲: 「家族・同僚が画面を見る」まで。ここにのこすと同じ“正直な宣言”が必要。
- 案B: パスフレーズによる端末内暗号化（at-rest）
  - 新規設計。鍵導出（Argon2id/PBKDF2→KEK）＋DEKラップ（ここにのこす§5の構成を再利用可能）。
  - 影響大: storage.js は同期 API 前提（getItem は同期、全呼び出し箇所が同期）。暗号は非同期（SubtleCrypto は async）。→ 回避策: **解除時に一度だけ全キーを復号してメモリ(createMemoryStorage)へ載せ、書き込みは暗号化して write-through**。iOS の native storage 構造（メモリ+write-through）が既にこの形なので親和性は高く、Web 側も同様のメモリ層に寄せればよい（getStorage の同期性は維持）。
  - 解除前に参照されるキー（consent、設定）は平文のままか、別キーに分離が必要。
  - 暗号化すべき: history, profile（生年月日）, chat, analysis-cache。consent は不要。
  - 忘れ物リスク: 合言葉を忘れる＝**全データ喪失**（運営は復旧不可。サーバー保存ゼロ＝D-18 により復元手段なし）。要・強い警告UIと“回復キー”（ここにのこす同様に再発行不可）。
- 案C（折衷・推奨候補）: ゲート（案A）をまず出し、将来 DEK 二重ラップ（パスフレーズ＋生体/Keychain）へ拡張できる構造だけ先に確保。iOS は Keychain（secure storage）に DEK を置き、生体で解除、Web は PRF 拡張が使えれば同様、無理ならゲートのみ。ここにのこすの“将来拡張”設計と同じ思想。

### 要変更点まとめ
1. storage 層: 同期 shim は維持。案Bなら「ロック解除→復号→メモリ展開」のフェーズを `initStorage` の後ろに追加。ロック中は getStorage() が空/ダミーを返すこと（画面に出さない）。
2. バックアップ export（D-09）: ロック有効でも平文JSONが出せてしまう。ゲート方式なら「エクスポート直前に再認証」、強化するなら暗号化エクスポート（ここにのこす packages/backup-format の考え方。ただしあれは写真向けのチャンク形式で重い、日記JSONは単一 AES-GCM で十分）。インポートも暗号化ファイル/平文の両対応が要る。
3. 分析キャッシュ: 案Bでは暗号化対象に含める（分析結果に日記由来の文章が入るため）。ゲートのみなら変更なし。
4. サーバー送信: 暗号化しても分析時には平文をAPIへ送る（D-18、サーバー保存ゼロ）。ユーザーへ誤解させない文言が必要（「端末内のデータを守る」であって通信内容ではない）。
5. iOS スイッチャー:
   - Web/PWA は制御不可（ベストエフォートのオーバーレイのみ）。
   - Capacitor ならネイティブ privacy screen が確実。候補: `@capacitor/privacy-screen` 2.0.1（公式, 2026-09-28, peer @capacitor/core >=8）、`@capacitor-community/privacy-screen` 8.0.0（2026-09-28）、`@capgo/capacitor-privacy-screen` 8.3.11（2026-10-08）。公式版を第一候補（説明: app switcher / 離脱時の情報秘匿）。
6. Face ID（iOS 殻）候補（npm view 実測、全て peer Capacitor 8 対応を確認できたもの）:
   - `@capgo/capacitor-native-biometric` 8.8.0（modified 2026-10-08, peer >=8）。資格情報を Keychain に保存する機能もあるが、公開直後の版は避けて2週間経過版を選ぶ（Kiri の版選定方針）。
   - `@aparajita/capacitor-biometric-auth` 10.0.0（2026-02-09）。説明は「Capacitor 7+」。Face ID/Touch ID＋端末認証フォールバック、Capacitor 8 動作は要実機確認（peerDependencies の記載は無し）。
   - `capacitor-native-biometric` 4.2.2 は 2023 年停止＝不可。
   - 鍵保管なら `@aparajita/capacitor-secure-storage` 8.0.1（2026-09-23, Keychain）や `capacitor-secure-storage-plugin` 0.13.0（peer >=8）。案B/Cで DEK を Keychain に置くときに使う。
   - Info.plist に NSFaceIDUsageDescription 追加が必須。
7. Web 版: WebAuthn を使う場合、rpId=kiri.kugainc.com にバインド（credential は origin 固定、`localhost`・プレビューURLでは別物になる）。Cloudflare Workers 配下でも問題なし。非対応環境のフォールバックは「利用できません」と正直表示（ここにのこす方針）。**Kiri は独自PINを作らない**かどうかを要決定（ここにのこすはPIN不採用だが、Kiri ユーザーは「パスワード」を期待している可能性）。

### リスク
- 案Bの合言葉忘れ＝全損。D-09「既存データを消さない」・D-18「サーバー保存ゼロ」と衝突する運用（復旧不能）。iCloud バックアップ（Preferences）にも暗号文が乗るので、端末機種変更時に鍵がないと復元不可。
- D-09 第一段階の既存ユーザー: 既存の平文 localStorage/Preferences を暗号化へ **移行** する設計（失敗時ロールバック、storage.js の“移行済みの印”パターンが流用可）が必要。
- WebAuthn ゲートは「暗号化」と誤解されやすい → 文言規律（ここにのこすの原則を踏襲）。
- Web版の iOS Safari は ITP で 7 日未使用データ削除（D-09 の背景）→ ロック以前にデータ喪失リスクがある。
- 失敗回数制限が無い点: 案Aは OS 任せで可。案Bは Argon2id/PBKDF2 のコストが唯一の防御（オフライン総当たり可能）→ 合言葉最小長、iPhone 実機で KDF 速度確認（ここにのこす S-1 と同じ未検証項目）。
- 自動ロックの副作用: 日記入力中に離脱→ロック→下書き消失。Kiri の entryDraft（sessionStorage）との整合を取る。

### App Store 観点
- ガイドライン 4.2（最低限の機能）: Face ID＋privacy screen＋Preferences/Keychain 統合は D-12 の“ネイティブ統合”を強化する。
- 5.1.1（データ収集とプライバシー）: 生体情報はOS内で完結し、アプリは結果のみ受領 → プライバシー栄養表示は「生体データ収集なし」で整合。NSFaceIDUsageDescription 文言は必須。
- 暗号化に関する輸出規制（ITSAppUsesNonExemptEncryption）: 標準暗号(AES-GCM/PBKDF2)の自前利用でも該当申告が必要になる。案Bを採用するなら Info.plist 申告と米国輸出規制の確認をする（現状 HTTPS のみなら免除可の可能性）。
- 「パスワード忘れ時の復旧不能」は審査では問題にならないが、ユーザーに明示する文言が必要（ここにのこす common.json:327 に類似文言あり）。

## 4. 推奨（く！ちゃん意見・決定はひとみうさ）
1. 第1弾: 案A（ゲート）。Web=WebAuthn、iOS=生体プラグイン＋公式 privacy-screen。storage.js は触らない。起動時ロック・自動ロック・エクスポート前再認証。
2. 将来: 案C（DEK を Keychain/PRF で包む）への道を空けておく（データ形式に version を持たせる）。
3. ひとみうさに確認したい点: 「パスワード」の期待は“他人に見られない”か“解析されても読めない”か。後者なら案B（忘れたら全損）の合意が必要。
