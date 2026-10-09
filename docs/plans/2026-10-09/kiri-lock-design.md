# Kiri アプリロック 設計書（任意機能・案の裁定）

作成: 2026-10-09 / 裁定者: Fable 5.1（設計のみ。コード・リポは未変更）
入力: `scratchpad/kiri-lock-brief.md`、Kiri `CLAUDE.md`／`DECISIONS.md`（D-09・D-12・D-14・D-18）、`scratchpad/kiri-phase2-design.md`、ここにのこす `docs/SECURITY_THREAT_MODEL.md`／`app/src/app/LockContext.tsx`／`app/src/lib/lock/webauthn.ts`／`packages/backup-format`。
オーナーの要望: 「パスワード設定できたらいいよね。個人的な記録や生年月日を記入するから、プライバシーを気にする人がいそう。『ここにのこす』と同じ仕組みが使えると思う」。審美・方向の決定はひとみうさ。

---

## 0. 調査で確かめた事実（ブリーフとの差分を含む）

1. **ここにのこすの「あんしんロック」は暗号化ではなく UI ゲート**（`SECURITY_THREAT_MODEL.md §3`、`BUILD_STATUS.md §5`）。合言葉・PIN は意図的に無い。流用できるのは「起動時は常にロック／背景に回っていた時間の差分で自動ロック／切り替え画面の目隠し／非対応時は正直に『利用できません』」という**考え方とロジック**。コードは TS+React の PWA 用（WebAuthn）なので、Kiri iOS ではそのまま使えない（Kiri の器は Capacitor。生体は OS の LocalAuthentication を使うのが正道）。
2. **Kiri の端末データはすべて平文**: Web=localStorage、iOS=Preferences（UserDefaults、iCloud バックアップ対象）。同期シム `src/lib/storage.js` の 5 キー（history / profile / chat / analysis-cache / consent）。呼び出し側は完全同期。
3. **バックアップは平文 JSON**（`src/lib/backup.js`、`kiri-backup-YYYY-MM-DD.json`）。iOS ではシェアシート経由で"ファイル"・AirDrop・iCloud Drive へ出る（`backupShare.js`）。生年月日と日記本文が含まれる。**ロックの有無に関係なく、いちばん外へ出やすい形はこれ**。
4. `ios/App/App/Info.plist` に `NSFaceIDUsageDescription` も `ITSAppUsesNonExemptEncryption` も無い。`PrivacyInfo.xcprivacy`（プライバシーマニフェスト）も無い（Phase 4 で要対応だが本設計の範囲外）。
5. **プラグインの公開日（npm `time` を実測）**:
   - `@capacitor/privacy-screen` **2.0.1 = 2026-02-11 公開**。ブリーフの「2026-09-28」は registry の `modified`（メタデータ更新）であって公開日ではない → **2週間ルールを満たす**。`@capacitor-community/privacy-screen` 8.0.0 も同様（公開 2026-04-28）。
   - `@aparajita/capacitor-biometric-auth` 10.0.0 = 2026-02-09。説明文は「Capacitor 7+」だが `dependencies` は `@capacitor/core ^8.0.2`／`@capacitor/ios ^8.0.2`／`@capacitor/app ^8.0.0`／`@capacitor/android ^8.0.2`（peer ではなく通常依存）。`Package.swift` 同梱（SPM 可）。Swift 側は `NSFaceIDUsageDescription` 欠落をクラッシュ前に検出し、`allowDeviceCredential: true` で `LAPolicy.deviceOwnerAuthentication`（Face ID → 端末パスコードのフォールバック）になる。エラーは `userCancel / biometryLockout / passcodeNotSet / biometryNotEnrolled …` の型付き。
   - `@capgo/capacitor-native-biometric` 8.6.11 = 2026-09-19（20日経過・peer のみ）。`verifyIdentity({ useFallback, maxAttempts })`＋Keychain 保存 API 付き。ただし 9/12〜10/8 に 8 版リリースという更新頻度（固定すれば問題ないが追随コストが高い）。
   - `@capacitor/app` 8.1.1 = 2026-07-15（`pause`/`resume`/`appStateChange`。SPM 可）。8.1.2 は 10/02 で 2 週間未満。
   - `@aparajita/capacitor-secure-storage` 8.0.1 = 2026-09-23（Keychain。案 C の「将来の鍵置き場」候補。今回は使わない）。
6. Node 24 の vitest（node 環境）で `crypto.subtle.deriveBits` が使える → 暗号化バックアップのテストは追加依存なしで書ける。
7. ここにのこすの実機スパイク S-1（KDF 速度）・S-2（standalone PWA のオフライン WebAuthn）・S-4（スイッチャー目隠しが間に合うか）は**いずれも未記入**。Web 版 WebAuthn ゲートを Kiri に入れるなら、同じ未検証を引き継ぐ。

---

## 1. 脅威モデルと 3 つの選択肢

### 守りたい資産
生年月日・出生時刻・性別・ニックネーム（profile）／日記本文と気分（history）／Kiri の読み解き（history・analysis-cache）／会話ログ（chat、Phase 3 以降）／バックアップ JSON。

### 選択肢

| | (a) 覗き見防止のロック画面（ゲート） | (b) 端末内暗号化（合言葉由来の鍵） | (c) ゲート ＋ 暗号化バックアップ書き出し |
|---|---|---|---|
| 仕組み | 起動・復帰時に OS 認証（Face ID／Touch ID／端末パスコード）を通すまで画面を出さない。切り替え画面は OS 目隠し | history/profile/chat/cache を AES-GCM で保存。鍵は合言葉から導出（PBKDF2/Argon2id）。解除時に全キーを復号してメモリへ | (a) に加え、バックアップ JSON を任意の合言葉で AES-GCM 暗号化して書き出せる |
| 保存データ | **平文のまま**（変更なし） | 暗号文。`storage.js` を「解除→復号→メモリ展開→書き込みは暗号化 write-through」へ改造。consent と設定は平文に分離 | 端末内は平文のまま。ファイルだけ暗号文 |
| 忘れた時 | 忘れるものが無い（OS 認証） | **合言葉忘れ＝全損**。サーバー保存ゼロ（D-18）なので運営も復旧不能 → **D-09「既存データを消さない」と正面衝突** | そのファイルだけ開けない。端末の元データは無傷 → D-09 と矛盾しない |
| 工数 | 小〜中（プラグイン 2 つ＋UI） | 大（保存層・移行・全画面の復号待ち・鍵管理・Web 側も同じ改造） | 中（(a)＋暗号ライブラリなしの Web Crypto 実装＋書き出し/読み込み UI） |

### 何から守れるか（正直な表）

| 脅威 | (a) ゲート | (b) 端末内暗号化 | (c) ゲート＋暗号化バックアップ |
|---|---|---|---|
| 肩越しの覗き見・画面を見せる場面 | ◎ | ◎（＋ゲートが要る） | ◎ |
| 家族・同僚に端末を貸す（解除済み端末） | ◎（自動ロック後） | ◎ | ◎ |
| 解除済みのまま紛失・置き忘れ | ○ 自動ロックまでの猶予は無防備。端末自体の自動ロックも効く | ○ 同じ猶予 | ○ |
| ロック済み端末の紛失 | OS のファイル保護が既に効く（パスコードあり前提）。アプリ側で足すものは無い | 二重の鍵になる | (a) と同じ |
| iCloud バックアップからの読み出し | × 平文で乗る（Apple 側の暗号化のみ） | ◎ | × 端末内は平文のまま |
| バックアップ JSON の漏えい（AirDrop 誤送信・iCloud Drive 共有・USB） | × 平文 | △ 書き出し時に平文へ戻すなら × | ◎（合言葉を付けた場合） |
| フルアクセスの技術者・フォレンジック・DevTools | × | ○（合言葉の強さと KDF コスト次第） | × |
| 運営者・サーバー | 構造的に安全（D-18。サーバーには何も無い） | 同左 | 同左 |
| AI 送信（分析時） | 平文で送る（変わらない） | 平文で送る（**暗号化しても通信は守れない**。誤解を招く文言に注意） | 同左 |

### 結論（裁定の要約）
- 「パスワード」という言葉でオーナーが想定しているのは、おそらく「他の人に見られない」（左 2 行）。これは (a) で満たせ、忘れ物リスクがゼロで、D-09 と衝突しない。
- Kiri の現実的な漏えい経路の筆頭は**平文バックアップ JSON**。ここは (c) の「任意の合言葉」で塞げる（忘れてもそのファイルだけ）。
- (b) は守れる範囲が広い代わりに「忘れたら全損」。無料お試し＋日記という性質（気軽に書く・たまに開く）と相性が悪く、D-09/D-18 の下では採れない。将来やるなら「DEK を Keychain（生体で解錠）と合言葉で二重に包む」案 C' として、データ形式に version を持たせておくだけに留める。

---

## 2. 裁定（Ruling）

書式: **決定 — 理由 — 外れた時の代償**

### Ruling 1: 方式は (c)。第 1 便＝iOS のゲート、第 2 便＝暗号化バックアップ書き出し。端末内暗号化 (b) は採らない
- **決定**: iOS アプリに「アプリのロック」（OS 認証ゲート＋切り替え画面の目隠し＋自動ロック）を入れる。別便で「バックアップに合言葉を付ける（任意）」を入れる。端末内データは平文のまま、`storage.js` は触らない（キーを 1 つ足すだけ）。
- **理由**: §1 の表。ゲートは忘れ物リスクゼロで D-09 を守れ、4.2 対策（D-12）の「ネイティブ統合」実績にもなる。暗号化バックアップは Kiri 固有の最大の漏えい経路を塞ぎ、元データに触らないので D-09 と両立する。
- **代償**: 「端末を解析されても読めない」は満たさない。設定画面とポリシーで「表示を制限する機能で、保存データの暗号化ではありません」と明記する（ここにのこすの文言規律を踏襲）。

### Ruling 2: Web 版（kiri.kugainc.com）には今回ロックを出さない
- **決定**: Web はロック無し。設定にもロック項目を出さない（ネイティブ判定で非表示）。WebAuthn ゲートは「後日・任意」（T-L10）として設計だけ残す。
- **理由**: D-14 で Web は無料お試し、D-09 の背景どおり iOS Safari は 7 日未使用で localStorage ごと消える（ロック以前にデータが残らない前提）。WebAuthn の資格情報は origin 固定で、ここにのこすの S-2（standalone PWA でのオフライン動作）が未検証。Web の DevTools は誰でも開けるので、ゲートの効果がもっとも薄い環境でもある。
- **代償**: Web で「ロックが無い」と言われる可能性。その時は T-L10（ここにのこすの `webauthn.ts` を JS に移植。rpId=`kiri.kugainc.com`、非対応時は「利用できません」）を単独便で出す。

### Ruling 3: 独自の PIN／パスワードは作らない。フォールバックは端末のパスコード
- **決定**: 認証は `allowDeviceCredential: true`（`LAPolicy.deviceOwnerAuthentication`）。Face ID／Touch ID が使えなければ OS が端末パスコードを求める。**端末にパスコードが無い端末ではロックをオンにできない**（「端末のパスコードを設定すると使えます」と案内）。
- **理由**: 独自 PIN は DevTools／再インストールで迂回でき「守られている」と誤認させる（ここにのこす `SECURITY_THREAT_MODEL.md §4`）。端末パスコードは OS の試行制限・遅延・消去ポリシーが既に効いていて、アプリ側で作り直す理由が無い。「パスワード」というオーナーの言葉は、設定の名前を「アプリのロック（Face ID・パスコード）」にすることで受け止める。
- **代償**: 「アプリだけ別のパスワードにしたい」要望には応えない。家族と端末パスコードを共有している人には効かない（文言で明示）。

### Ruling 4: 生体プラグインは `@aparajita/capacitor-biometric-auth` 10.0.0、`@capacitor/app` 8.1.1 を明示固定
- **決定**: `package.json` に `"@aparajita/capacitor-biometric-auth": "10.0.0"` と `"@capacitor/app": "8.1.1"`（caret 無し）。`cap sync ios` で `CapApp-SPM/Package.swift` に 2 つ追加されることを確認する。`checkBiometry()` → `authenticate({ reason, allowDeviceCredential: true, iosFallbackTitle: 'パスコードを使う', cancelTitle: 'あとで' })`。
- **理由**: 公開 2026-02-09（8 か月）。API が「認証だけ」に絞られ、`NSFaceIDUsageDescription` 欠落の事前検出、`BiometryErrorType` の型付きエラー、`addResumeListener`（背景中に生体設定が変わった時の再チェック）が揃う。`@capacitor/app` は同プラグインの依存で入るので、2 週間未満の 8.1.2 に流れないよう **こちらで 8.1.1 を固定**（`^8.0.0` は 8.1.1 に dedupe される）。`pause`/`resume` は Ruling 7 の自動ロックにも使う。
- **代償**: `@capacitor/android` が transitive で node_modules に入る（iOS ビルドには無関係。`npm audit --omit=dev` で 0 件を確認する）。代替は `@capgo/capacitor-native-biometric` 8.6.11（peer のみ・Keychain API 付き）。将来 案 C' で Keychain が要る時に乗り換えを再検討する。

### Ruling 5: 目隠しは `@capacitor/privacy-screen` 2.0.1（公式）。ロックがオンの時だけ有効
- **決定**: `PrivacyScreen.enable({ ios: { blurEffect: 'dark' } })` をロック設定オン時と起動時（設定がオンなら）に呼び、オフ時は `disable()`。設定に「アプリ切り替え画面で記録を隠す」トグル（既定オン、ロックがオンの時だけ表示）。
- **理由**: 公開 2026-02-11 で 2 週間ルール OK（§0-5）。公式・peer `>=8`・SPM 同梱。iOS 側は `willResignActive` で blur を被せるので、PWA 版の「オーバーレイが間に合わない」問題（S-4）が構造的に起きない。
- **代償**: Face ID のシステム画面が出る瞬間も blur が被る（ロック画面の上なので実害なし）。Control Center や通知を引き下げた瞬間も blur になる（OS の挙動。設定文言に「切り替え時に画面がぼかされます」と書く）。

### Ruling 6: ロック状態はメモリだけ。設定はストレージの新キー 1 つ。起動時は常にロック
- **決定**:
  - 設定キー `spiritual-diary.lock.v1` = `{ version: 1, enabled: boolean, autoLockMinutes: 0 | 1 | 5 | 15, hideInSwitcher: boolean, enabledAt }`。`NATIVE_STORAGE_KEYS` に追加（Preferences 永続・一度きり移行の対象。**バックアップ JSON には含めない**＝consent と同じ扱い）。
  - `locked` フラグは React state のみ。`enabled` なら**起動のたびに locked=true から始める**。`hiddenAt`（背景に回った時刻）だけ sessionStorage（ここにのこす `HIDDEN_AT_KEY` と同じ理由）。
- **理由**: ここにのこす `LockContext.tsx` の確定設計。Preferences は iCloud バックアップ対象なので、機種変更後もロック設定が復元され、新しい端末の Face ID でそのまま開ける（WebAuthn のように資格情報が端末に縛られない）。
- **代償**: 強制終了→再起動のたびに認証が要る（これは仕様）。

### Ruling 7: 自動ロックは「背景に回っていた時間」だけで判定。前景の無操作タイマーは置かない
- **決定**: 選択肢は「すぐに／1分後／5分後／15分後」、**既定は「すぐに」（推奨。Q4）**。iOS は `@capacitor/app` の `pause`（`didEnterBackground`）で `hiddenAt` を記録、`resume`（`willEnterForeground`）で差分 ≥ 設定値ならロック。`appStateChange`（`resignActive`）は使わない。
- **理由**: モバイルの背景タイマーは間引かれるので timestamp 差分が正（ここにのこすの実測コメント）。`resignActive` を使うと Control Center・通知・Face ID 自身のシステム画面で「すぐに」が発火して誤ロックする。前景アイドルは、長い読み解きを黙読している最中にロックが落ちる副作用があり、端末自体の自動ロック（30 秒〜数分）が同じ場面を既に守っている。
- **代償**: 画面を点けたまま机に置いた端末は、端末の自動ロックまで無防備（OS 任せ）。

### Ruling 8: ロック画面はオーバーレイ（アンマウントしない）。起動時は `step` を決める前にロックを判定し、スプラッシュはロック画面の描画後に隠す
- **決定**:
  - `SpiritualDiary.jsx` の起動 effect: `await initStorage()` → `loadLockSettings(getStorage())` → `enabled` なら `setLocked(true)` → それから `setStep(initialStep)`。`profileHydrated` を立てる位置は変えない（スプラッシュは「ロック画面 or 復元した画面」が描画されてから `hideSplash()`）。
  - ロック中は最上位に `LockScreen`（`fixed inset-0 z-[90]`、夜色の不透明な背景、Kiri の名前、「端末の認証で開く」ボタン、小さな「相談窓口」リンク）を描画し、アプリ本体のルート要素に `inert` を付ける。本体は**アンマウントしない**。
  - ロック画面が現れたら自動で `authenticate()` を 1 回呼ぶ（キャンセルされたらボタン待ち）。認証中フラグを立て、その間の `pause/resume` は無視する。
- **理由**: オーバーレイなら日記の下書き（React state の `entry`）・読み解き中の fetch・開いている結果がそのまま残り、解除後に続きから書ける（ブリーフのリスク「離脱→ロック→下書き消失」を構造で回避）。`inert` で VoiceOver・タブ移動・検索から下の内容を隠す。既存のモーダル z-index（設定 50／履歴 60／削除確認 70／同意 80）より上に置く。
- **代償**: DOM には本体が残るので、DevTools で読める（Web 版には出さないので実害は小）。`step === 'boot'` の背景だけ描く既存挙動の上にロック判定を差し込むので、起動 effect の順序テストを必ず書く。

### Ruling 9: 失敗・ロックアウト時の挙動は OS 任せ。「パスコード未設定」だけはフェイルオープン
- **決定**（`BiometryErrorType` → 挙動）:

| エラー | 挙動 | 文言（草案） |
|---|---|---|
| `userCancel` / `appCancel` / `systemCancel` | ロックのまま。ボタンで再試行 | （何も出さない。ボタンだけ） |
| `authenticationFailed` / `userFallback` | ロックのまま。再試行 | 「認証できませんでした。もう一度お試しください。」 |
| `biometryLockout` | ロックのまま。再試行すると OS がパスコードを求める | 「Face ID が一時的に使えません。端末のパスコードで開けます。」 |
| `biometryNotEnrolled` / `biometryNotAvailable` | OS がパスコードを求めるので通常どおり | — |
| `passcodeNotSet` / `noDeviceCredential` | **ロックを解除して通す**（フェイルオープン）。設定のトグルは「オン（端末のパスコード未設定のため一時的に無効）」表示 | 「端末のパスコードが設定されていないため、アプリのロックは一時的に外れています。」 |
| `invalidContext` / `notInteractive` / 想定外 | ロックのまま。再試行ボタン＋相談先として /support | 「開けませんでした。もう一度お試しください。」 |

- **理由**: 試行回数制限・遅延・消去は OS が持っている（Face ID 5 回→パスコード、パスコード 6 回失敗→遅延）。アプリ側に回数制限を作ると迂回可能な「見せかけ」になる。パスコードを解除できるのは端末のパスコードを知る人＝攻撃者 C 相当で、ゲートが守る対象（A）ではないので、フェイルオープンしても守備範囲は縮まず、D-09「自分のデータに入れなくなる」事故だけを防げる。
- **代償**: 「ロックをオンにしたのに開けた」と見える瞬間がある → 通知バナーで理由を出す（上表）。

### Ruling 10: 同意モーダル・相談窓口カードとの関係
- **決定**:
  - ロック画面は同意モーダル（z-80）・窓口カード・削除確認より上。起動時は `step` の前にロックを判定するので、起動直後にモーダルが開いている状態は作らない。
  - 読み解き中（`loading`）に自動ロックが落ちたら、結果（窓口カードを含む）はオーバーレイの下で描画され、解除後にそのまま見える。
  - 同意モーダルの「プライバシーポリシーを読む」は `/privacy` へページ遷移して `SpiritualDiary` がアンマウントされる → 戻ると起動扱いで再ロックされる。**これは受け入れる**（初回のみ・1 回の Face ID）。`/privacy`・`/terms`・`/support` は個人データを含まないのでロック対象外。
  - ロック画面に「相談窓口」への小さなリンク（`/support`、公開ページ）を置く。D-15 の「つらい時に突き放さない」をロック中にも守る。
- **理由**: モーダルの z 階層は既に固定されている。ポリシー往復の再ロックを避けるには解除時刻を sessionStorage に持つ必要があり、「ロック状態はメモリだけ」の原則を崩す価値が無い。
- **代償**: ポリシーを読んで戻ると 1 回余分に認証が要る。不評なら「同意モーダル内でポリシーを開く（モーダル内スクロール）」へ変更する方が筋が良い。

### Ruling 11: 再認証が要る操作は「バックアップの書き出し」と「ロックをオフにする」の 2 つ
- **決定**: ロックがオンのとき、書き出しボタンとロックのオフ操作の直前に `authenticate()` を挟む。成功したときだけ実行。読み込み・削除・同意の取り消しには挟まない。
- **理由**: 書き出しは端末外へ平文を出す唯一の操作。オフは守りを外す操作。削除は「見られたくない」方向で害が無く、読み込みは既存を消さない（`applyBackup` の id マージ）。
- **代償**: 書き出しに 1 タップ増える。自動ロック直後のロック画面→解除→設定→書き出しで連続 2 回認証になる場面がある（直前 30 秒以内の成功なら省略する猶予を `lockAuth.js` に持たせてよい。既定 0 秒＝省略しない）。

### Ruling 12: 分析キャッシュ・保存層・AI 送信は変更しない
- **決定**: `analysis-cache`／`history`／`profile`／`chat` の形式・保存先は不変。`storage.js` は `NATIVE_STORAGE_KEYS` に `spiritual-diary.lock.v1` を足すだけ。AI 送信は従来どおり平文（D-18 のサーバー保存ゼロは不変）。
- **理由**: ゲート方式の最大の利点（同期シムと D-09 を壊さない）。
- **代償**: 設定・ポリシーに「ロックは表示を制限する機能で、端末内の保存データや送信内容の暗号化ではありません」を必ず書く。

### Ruling 13: バックアップの合言葉保護（第 2 便・任意）は Web Crypto だけで実装。平文と暗号文の両方を読める
- **決定**:
  - 書き出し時に「合言葉で保護する（任意）」を選べる。合言葉は **15 文字以上**（ここにのこすと同じ。NFC 正規化→UTF-8）。
  - KDF: **PBKDF2-HMAC-SHA256 600,000 回・salt 16B**（Web Crypto ネイティブ。Argon2id は hash-wasm 依存と S-1 未検証を引き継ぐので採らない）。暗号: AES-256-GCM、iv 12B、AAD = 封筒ヘッダ（`app`/`schemaVersion`/`enc.v`）。
  - 封筒形式（JSON のまま。拡張子は変えない）:
    ```json
    { "app": "spiritual-diary", "schemaVersion": 1,
      "encrypted": { "v": 1, "kdf": { "alg": "pbkdf2-sha256", "iter": 600000, "salt": "<b64>" },
                     "cipher": "aes-256-gcm", "iv": "<b64>", "ct": "<b64>" } }
    ```
    `ct` の平文は従来の `buildBackup()` の JSON そのもの。`parseBackup()` は `encrypted` があれば合言葉を要求し、無ければ従来どおり。`kdf.alg` を持つので将来 Argon2id を追加できる（ここにのこすの version 設計を踏襲）。
  - 文言: 「合言葉は運営でも確認・再発行できません。忘れると、このファイルは開けなくなります（端末内の記録は消えません）。」
- **理由**: 日記 JSON は数百 KB なので単一 AES-GCM で十分（ここにのこすのチャンク STREAM は写真向け）。追加依存ゼロで、vitest（Node 24）でそのまま検証できる。
- **代償**: PBKDF2 600k はオフライン総当たりに対して Argon2id より弱い（だから 15 文字）。iPhone 実機での 600k の所要時間は未計測（T-L7 の検収で測る。1 秒超なら 310k へ下げる判断を記録する）。合言葉入力 UI が 2 画面増える。

### Ruling 14: Info.plist と輸出規制
- **決定**:
  - `NSFaceIDUsageDescription`（必須）: **「アプリのロックを解除し、あなたの記録を他の人に見られないように守るために使います。」**（Face ID のみ。Touch ID・パスコードには不要）。`CFBundleDevelopmentRegion` は `en` のままで日本語文字列を直接置く（アプリは日本語のみ）。
  - `ITSAppUsesNonExemptEncryption`: Phase 4 のアップロード時に設定。ゲートだけなら `false`（HTTPS のみ）。第 2 便（AES-GCM/PBKDF2 の自前利用）を入れた後は「標準暗号アルゴリズムの利用」として免除区分の自己分類（米 BIS への年次報告の要否）を Phase 4 の冒頭で確認し、結論を DECISIONS に残す。審査のブロッカーではない。
- **理由**: `NSFaceIDUsageDescription` が無いと Face ID 端末で `evaluatePolicy` がクラッシュする（aparajita はクラッシュ前に検出してエラーにするが、ロックは使えない）。
- **代償**: 文言はオーナー確認（Q4 と一緒に）。

### Ruling 15: アクセシビリティ
- **決定**: ロック画面は `role="dialog" aria-modal="true" aria-labelledby`、表示時に解除ボタンへフォーカス。本体は `inert`。ボタンは 44pt 以上、文言は VoiceOver で読める通常テキスト（アイコンのみ禁止）。`prefers-reduced-motion` で霧のアニメーションを止める（D-13 の既存規則）。Face ID の「注視が必要」設定は OS 側なので触れない。パスコード入力は OS の画面なので a11y は OS が担保。
- **理由**: `inert` 無しだと VoiceOver がオーバーレイ越しに日記本文を読み上げる。
- **代償**: `inert` は iOS 15.5+・Safari 15.5+ 対応（Capacitor 8 の最小 iOS 15.0 では 15.0〜15.4 で効かない）。フォールバックとして `aria-hidden="true"` も併記する。

### Ruling 16: 文言規律と設定 UI の置き場
- **決定**: 画面・ポリシー・ストア説明で「暗号化」「パスワード」を使わない。使う語は「アプリのロック」「端末の認証（Face ID・Touch ID・パスコード）」「合言葉」（バックアップのみ）。設定モーダル（`SettingsModal`）に「アプリのロック」セクションを**ネイティブかつ `checkBiometry().deviceIsSecure || isAvailable` のときだけ**出す。Web・非対応端末では出さない（ここにのこすの「利用できません」はトグルを出した上での表示だったが、Kiri は設定項目自体を出さない方が静か）。
- **理由**: ここにのこす `BUILD_STATUS.md §5`「文言で『暗号化』と言わない」。
- **代償**: 「パスワード機能はありますか」という問い合わせには /support の FAQ で答える（T-L8）。

### Ruling 17: フェーズ配置は「Phase 2.5」。第 1 便は最初の TestFlight ビルドに含める
- **決定**: Phase 2（iOS の器）のシミュレータ検収（Phase 2 設計書 T13）が終わってから着手し、Phase 3（RevenueCat）より前に入れる。第 1 便（ロック T-L1〜T-L6・T-L8 の一部）は最初の TestFlight に乗せる。第 2 便（暗号化バックアップ T-L7）は Phase 4 の提出前までにスリップ可。
- **理由**: プラグイン追加は `Package.swift`／`Info.plist` に触るので、Phase 2 の検収が済んだ安定点から差分を取るのが安全。4.2 対策の実績として最初の審査提出に含めたい。課金（Phase 3）はロックと独立で、同時に進めると `SpiritualDiary.jsx` の競合が増える。
- **代償**: Phase 2 の QA（`agent/ios-qa`）が長引けば TestFlight が後ろにずれる。

### Ruling 18: テストと検収
- **決定**: ロジックは `src/lib` の純粋関数に寄せ、vitest（node）で網羅。UI の結線はシミュレータ検収で固定（Xcode シミュレータは Features → Face ID → Enrolled／Matching Face／Non-matching Face で生体を模擬できる）。Web は Playwright 375/1280 で「設定にロック項目が出ない・既存フロー不変」を確認。
- **理由**: Phase 2 Ruling 12 と同じ流儀。
- **代償**: スイッチャーの blur と実機 Face ID の体感はシミュレータでは判定しきれない → 実機 1 台で T-L9 の該当項目を見る。

---

## 3. タスク分割（T-L0〜T-L10）

凡例: [Opus]=統合・データに関わる／[Sonnet]=仕様が閉じている／∥=並行可（触るファイルが重ならない）／→=逐次。
レーン: A=UI（`SpiritualDiary.jsx` を触る。必ず逐次） / C=ネイティブ・ライブラリ / B=暗号（純粋関数）。
順序: T-L0 → (T-L1 ∥ T-L2 ∥ T-L6) → T-L3 → T-L4 → T-L5 → (T-L7) → T-L8 → T-L9。T-L10 は任意。

### T-L0 [オーナー・手作業] 決定と環境
- §4 の Q1〜Q4 を決める。ロック画面の見た目は比較 HTML（2〜3 案）→合意→実装（CLAUDE.md の流儀）。
- シミュレータで Features → Face ID → Enrolled が出ることを確認（iOS 26 ランタイム。Phase 2 T0 で導入済みのはず）。
- 検証: `xcrun simctl list runtimes | grep iOS`。

### T-L1 [Sonnet] ロックの純粋ロジック `src/lib/appLock.js`（レーン C）
- 触る: `src/lib/appLock.js`（新）、`src/lib/__tests__/appLock.test.js`（新）、`src/lib/storage.js`（`NATIVE_STORAGE_KEYS` に `LOCK_STORAGE_KEY` 追加）、`src/lib/__tests__/storage.test.js`（キー数の期待値を更新）。
- 内容: `LOCK_STORAGE_KEY`、`AUTO_LOCK_CHOICES = [0,1,5,15]`、`loadLockSettings(storage)`（壊れた JSON→既定）、`saveLockSettings(storage, next)`、`shouldRelock({ hiddenAt, now, autoLockMinutes })`、`reduceLock(state, event)`（events: `boot(enabled)` / `hide(now)` / `show(now)` / `authStart` / `authSuccess` / `authFail(code)` / `disable`。`authStart` 中の `hide/show` は無視）、`describeAuthFailure(code)`（Ruling 9 の表→ `{ action: 'stay'|'open', message }`）。
- テスト: 既定値／保存・復元／`autoLockMinutes=0` は hide で即ロック／1 分設定で 59 秒→ロックしない・60 秒→ロック／認証中の hide を無視／`passcodeNotSet` は open／バックアップ JSON に含まれない（`buildBackup` にキーが無い）。
- 検証: `npm test && npm run lint`。∥ T-L2・T-L6。

### T-L2 [Sonnet] ネイティブ窓口 `src/lib/lockAuth.js`・`src/lib/privacyScreen.js`・`src/lib/appState.js`（レーン C）
- 触る: `package.json`（`@aparajita/capacitor-biometric-auth` 10.0.0・`@capacitor/app` 8.1.1・`@capacitor/privacy-screen` 2.0.1 を caret 無しで追加）、上記 3 ファイル（新）とテスト 3 本（新）、`ios/App/App/Info.plist`（`NSFaceIDUsageDescription`）。`npx cap sync ios` の結果 `ios/App/CapApp-SPM/Package.swift` に 3 パッケージが追加されるのを確認してコミット。
- 内容: `native.js` と同じ流儀（Web は no-op・動的 import・`load` を注入可能・値をログに出さない）。
  - `lockAuth.js`: `checkLockAvailability()` → `{ available, deviceIsSecure, biometryType }`、`authenticateForLock({ reason })` → `{ ok: true } | { ok: false, code }`（`BiometryError.code` をそのまま返す。想定外は `'unknown'`）。
  - `privacyScreen.js`: `setPrivacyScreen(enabled)`（`enable({ ios: { blurEffect: 'dark' } })` / `disable()`。失敗しても画面を止めない）。
  - `appState.js`: `subscribeAppVisibility({ onHide, onShow })` → ネイティブは `App.addListener('pause'|'resume')`、Web は `visibilitychange`。解除関数を返す。
- テスト: 偽プラグインで分岐（非ネイティブで import しない・エラー code のパススルー・enable/disable の呼び分け・購読解除）。
- 検証: `npm test && npm run lint && npm run build && npm audit --omit=dev`（0 件）。∥ T-L1・T-L6。

### T-L3 [Sonnet] ロック画面コンポーネント `src/components/LockScreen.jsx`（レーン A の前段・単独ファイル）
- 触る: `src/components/LockScreen.jsx`（新）。props: `{ onUnlock, busy, message, supportHref }`。D-13 のトークンのみ・Lucide `Lock`・`kiri-fog-orb` は弱め・`prefers-reduced-motion` 対応・`role="dialog"`・初期フォーカス。
- 見た目は T-L0 の合意案に従う。
- 検証: `npm run lint && npm run build`。Playwright で単体表示（開発用の `?lockPreview=1` は入れない。Storybook も無いので、T-L4 の統合後に確認）。→ T-L1 の後（文言関数を使う）。

### T-L4 [Opus] 統合: 起動ゲート・自動ロック・設定 UI・再認証（レーン A）
- 触る: `src/components/SpiritualDiary.jsx`（起動 effect に Ruling 8 の順序／`locked` state と `reduceLock`／`subscribeAppVisibility`／本体ルートに `inert`＋`aria-hidden`／`SettingsModal` に「アプリのロック」セクション（トグル・自動ロック選択・切り替え画面トグル）／書き出しとオフの前に `authenticateForLock`／フェイルオープン通知）、`src/lib/native.js`（必要なら `hideSplash` の呼び出し位置調整のみ）。
- 設定文言（草案。決定はオーナー）:
  > **アプリのロック** — Face ID・Touch ID・端末のパスコードで、アプリを開くときに確認します。他の人に記録を見られないようにする機能で、保存データの暗号化ではありません。
  > 自動ロックまでの時間: すぐに／1分後／5分後／15分後（アプリを閉じたり、ほかのアプリに切り替えたときから数えます）
  > アプリ切り替え画面で記録を隠す: オン
- テスト: `appLock` の reducer に寄せてあるので UI 側のユニットは増やさない。`npm test && npm run lint && npm run build`。Playwright 375/1280（Web）: 設定にロック項目が無い・既存フロー不変・コンソールエラー 0。
- → T-L1・T-L2・T-L3 の後。

### T-L5 [Opus] シミュレータ検収（第 1 便）
- 手順: `npm run ios:build && npx cap sync ios && npx cap open ios`。Face ID Enrolled で: ロックをオン（認証が走る）→ 完全終了→起動でロック画面→Matching Face で開く→日記入力の途中でホーム→すぐ戻る（「すぐに」なら再ロック・下書きが残る）→Non-matching を 2 回で「パスコードを使う」ボタン→設定で 1 分に変更→50 秒で戻る（ロックしない）→書き出しで再認証→オフで再認証→Face ID 未登録（Enrolled オフ）でパスコード画面→スイッチャーで blur（実機で再確認）。
- 記録: `xcrun simctl io booted screenshot` を scratchpad に。結果を HANDOVER へ。
- → T-L4 の後。

### T-L6 [Sonnet] 暗号化バックアップの純粋関数 `src/lib/backupCrypto.js`（レーン B）
- 触る: `src/lib/backupCrypto.js`（新）、`src/lib/__tests__/backupCrypto.test.js`（新）。
- 内容: `MIN_PASSPHRASE_CODEPOINTS = 15`、`PBKDF2_ITERATIONS = 600000`、`encryptBackupJson(json, passphrase, { subtle, random })` → 封筒、`decryptBackupJson(envelope, passphrase)` → json、`isEncryptedBackup(obj)`、`normalizePassphrase`（NFC）。エラーは種類を区別（`WrongPassphraseError` / `UnsupportedEncryptionError` / `TooShortPassphraseError`）。
- テスト: 往復一致／合言葉違いで `WrongPassphraseError`／`ct` 1 バイト改ざんで失敗／`kdf.alg` 未知で `Unsupported`／14 文字で拒否／NFC（濁点の結合文字）で同一視／salt・iv が毎回違う。
- 検証: `npm test`（Node 24 の Web Crypto）。∥ T-L1・T-L2（独立）。

### T-L7 [Opus] 暗号化バックアップの統合（第 2 便・レーン A）
- 触る: `src/lib/backup.js`（`parseBackup` を `async parseBackup(text, { askPassphrase })` に。平文は従来どおり・封筒なら復号）、`src/lib/__tests__/backup.test.js`（両対応）、`src/components/SpiritualDiary.jsx`（書き出し: 「合言葉で保護する（任意）」→入力 2 回→封筒を出す／読み込み: 封筒検出→合言葉入力→失敗文言）。ファイル名は `kiri-backup-YYYY-MM-DD.json` のまま。
- 検収: シミュレータで保護あり書き出し→"ファイル"保存→読み込み（正・誤合言葉）。**iPhone 実機で PBKDF2 600k の所要時間を測り**、1 秒超なら 310k へ下げて DECISIONS に記録。
- → T-L6・T-L4 の後。Phase 4 前までにスリップ可（Ruling 17）。

### T-L8 [Sonnet] ドキュメントと法務文言
- 触る: `DECISIONS.md`（D-2x「アプリのロックは OS 認証のゲートであり暗号化ではない／独自 PIN を作らない／プラグインと版／フェイルオープン条件」、D-2y「バックアップの合言葉保護の形式」）、`HANDOVER.md`、`src/app/privacy/page.js` 2 節（「iOS アプリではアプリのロックを設定できます。これは表示を制限する機能で、保存データの暗号化ではありません」）、`src/app/support/page.js` FAQ（「ロックを解除できない」「パスワードはありますか」「合言葉を忘れた」）、`.env.example`（変更なし）。
- 検証: `npm run build && npm run lint`。→ T-L4 の後（文言確定後）。

### T-L9 [Opus] 実機検収と監査
- 実機 1 台: Face ID 実動・スイッチャー blur・背景 1 分→復帰・Preferences 復元（再インストール後にロック設定が残り、新端末でも開けることは iCloud 復元の機会があれば確認）・`npm audit --omit=dev` 0 件・`git diff --stat ios/`。
- 監査 A/B（Phase 2 と同じ流儀）: 「ロック中に本体の文字が読める経路が無いか（`inert`・VoiceOver）」「書き出しとオフが認証無しで通る経路が無いか」。

### T-L10 [Sonnet・任意] Web 版 WebAuthn ゲート（Q2 で採用時のみ）
- ここにのこす `app/src/lib/lock/webauthn.ts` を `src/lib/lockAuthWeb.js` へ移植（rpId=`window.location.hostname`、`userVerification: 'required'`、`authenticatorAttachment: 'platform'`、credentialId を `spiritual-diary.lock.v1` に保存）。`lockAuth.js` の Web 分岐を差し替えるだけで UI は共通。非対応時は設定項目を出さない。
- 代償の再掲: origin 固定・ITP 7 日削除・DevTools で迂回可。

---

## 4. ひとみうさに決めてほしいこと（最大 4）

1. **「パスワード」で守りたいのはどちら？**
   (a) 他の人に画面を見られないようにする（アプリを開くとき Face ID やパスコードで確認。忘れる心配なし）
   (b) 端末やバックアップを解析されても読めないようにする（自分で決めた合言葉で暗号化。**忘れたら記録は二度と戻らない**）
   → **推奨 (a)**。Kiri は気軽に書く日記で、取り戻せない全損は「記録を消さない」約束（D-09）と合わない。(b) 相当は「バックアップにだけ合言葉」で部分的に満たす（Q3）。

2. **Web 版（kiri.kugainc.com）にもロックを付ける？**
   → **推奨: 今回はアプリだけ**。Web はお試し版で、Safari は 7 日使わないと記録自体が消える。ブラウザのロックは誰でも開ける開発者ツールで迂回できてしまい、効果がいちばん薄い。要望が出たら後から足せる（T-L10）。

3. **バックアップのファイルに「合言葉」をかけられるようにする？（任意機能・15 文字以上）**
   合言葉を忘れると**そのファイルだけ**開けなくなる（端末の記録は消えない）。AirDrop の誤送信や iCloud Drive の共有ミスで日記と生年月日が漏れるのを防げる。
   → **推奨: 付ける。ただしロックの後の別便**（審査提出前まで）。

4. **自動ロックの既定値と、ロック画面の見た目**
   既定は「すぐに」（アプリを閉じたら次に開くとき確認）／「1分後」のどちらが良い？ ロック画面は「夜色＋Kiri の名前＋『端末の認証で開く』ボタン＋小さな相談窓口リンク」を 2〜3 案の比較 HTML で出す。Face ID の許可文「アプリのロックを解除し、あなたの記録を他の人に見られないように守るために使います。」もここで確認。
   → **推奨: 既定「すぐに」**（下書きは消えないので、コストは Face ID を一度見るだけ）。

---

## 5. 付録

### A. 保存形式
- `spiritual-diary.lock.v1`: `{ "version": 1, "enabled": true, "autoLockMinutes": 0, "hideInSwitcher": true, "enabledAt": "2026-10-09T00:00:00.000Z" }`（Preferences 永続・バックアップ非対象）
- sessionStorage `spiritual-diary.lock.hiddenAt`: 背景に回った時刻（ms）。数値 1 つだけ。

### B. ロック画面の文言（草案）
- 見出し: 「Kiri」／本文: 「ロックを解除するまで、記録は表示されません」／ボタン: 「端末の認証で開く」／リンク: 「相談窓口」（/support）。
- 失敗時は Ruling 9 の表。

### C. 変更しないもの（明記）
`src/lib/history.js`・`analysisCache.js`・`chatHistory.js`・`consent.js`・`backup.js`（第 1 便）・`storage.js` の同期 API・AI 送信の中身・D-18 のサーバー側・Web 本番の挙動。

### D. 将来拡張 C'（設計のみ・着手しない）
ランダム DEK でデータを暗号化し、DEK を「合言葉由来 KEK」と「Keychain（生体でアクセス制御）」で二重ラップ。`@aparajita/capacitor-secure-storage` 8.0.1 か capgo の Keychain API が候補。バックアップ封筒の `kdf.alg` と `encrypted.v` はこのための version。

## オーナー決定（2026-10-09 ひとみうさ）
- Q1: 守る対象 = (a) 他人に見られないこと（OS認証ゲート）。端末内暗号化はしない。
- Q2: Web版にロックはつけない（T-L10 不要）。
- Q3: バックアップの合言葉暗号化は**今はつけない**（第2便は保留。データ形式versionの確保だけは任意）。
- Q4: 自動ロックの既定は **5分**（選択肢 すぐに/1/5/15分 は維持）。ロック画面の見た目は比較HTML→合意→実装。
- ロック画面の見た目: **A 静かな扉**（scratchpad/lock/compare.html のA。自動ロックは4分割セグメント、既定5分）。2026-10-09 ひとみうさ選択。
