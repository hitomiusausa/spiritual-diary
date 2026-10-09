// アプリのロック（iOS のみ）の純粋ロジック。設計 kiri-lock-design.md の Ruling 6・7・9 とオーナー決定（2026-10-09）。
// - これは OS 認証のゲートで、保存データの暗号化ではない（Ruling 1・12）。
// - 設定はストレージの 1 キーだけ（端末ごとの設定なのでバックアップには含めない。consent と同じ扱い）。
// - locked はメモリ（React state）だけ。ロックがオンなら起動のたびに locked=true から始める。
// - 自動ロックは「背景に回っていた時間」だけで判定する（前景の無操作タイマーは置かない）。
// - Face ID・パスコードの画面は resignActive しか起こさず、pause/resume（hide/show）は起きない。だから OS 認証の
//   実行中に届いた hide は「認証画面のまま本当に背景へ回った」合図として記録し、show で判定する（監査 P1-1）。
//   その認証がたとえ成功で返っても、背景をはさんだ成功ではロックを外さない（interrupted）。
// - 「すぐに」は hide の時点でロックする（切り替え画面と復帰の最初のフレームをロック画面にするため。監査 P1-2）。

export const LOCK_STORAGE_KEY = "spiritual-diary.lock.v1";
export const LOCK_SETTINGS_VERSION = 1;
// 自動ロックまでの分数。0 =「すぐに」。
export const AUTO_LOCK_CHOICES = Object.freeze([0, 1, 5, 15]);
// 既定は 5 分（オーナー決定 Q4）。
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
const MS_PER_MINUTE = 60_000;

export const DEFAULT_LOCK_SETTINGS = Object.freeze({
  version: LOCK_SETTINGS_VERSION,
  enabled: false,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  hideInSwitcher: true,
  enabledAt: null,
});

function normalizeMinutes(value) {
  return AUTO_LOCK_CHOICES.includes(value) ? value : DEFAULT_AUTO_LOCK_MINUTES;
}

function normalizeSettings(raw) {
  const enabled = raw?.enabled === true;
  return {
    version: LOCK_SETTINGS_VERSION,
    enabled,
    autoLockMinutes: normalizeMinutes(raw?.autoLockMinutes),
    hideInSwitcher: raw?.hideInSwitcher !== false,
    enabledAt: enabled && typeof raw?.enabledAt === "string" ? raw.enabledAt : null,
  };
}

// 壊れた JSON・形の違う値・未知の version・読み取り例外は、すべて既定（ロックはオフ）に戻す。
export function loadLockSettings(storage) {
  let parsed;
  try {
    const raw = storage?.getItem(LOCK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOCK_SETTINGS };
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_LOCK_SETTINGS };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== LOCK_SETTINGS_VERSION) {
    return { ...DEFAULT_LOCK_SETTINGS };
  }
  return normalizeSettings(parsed);
}

// 現在の設定に next を重ねて保存し、保存した値を返す。オンにした時刻（enabledAt）はオンの間は保つ。
export function saveLockSettings(storage, next, now = new Date()) {
  const previous = loadLockSettings(storage);
  const merged = normalizeSettings({ ...previous, ...next, enabledAt: previous.enabledAt });
  if (merged.enabled && !previous.enabled) merged.enabledAt = now.toISOString();
  storage?.setItem(LOCK_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

// 背景にいた時間が設定値以上ならロックする。時計が戻っていたら安全側（ロック）に倒す。
export function shouldRelock({ hiddenAt, now, autoLockMinutes }) {
  if (hiddenAt === null || hiddenAt === undefined) return false;
  const hidden = Number(hiddenAt);
  const current = Number(now);
  if (!Number.isFinite(hidden) || !Number.isFinite(current)) return false;
  const elapsed = current - hidden;
  if (elapsed < 0) return true;
  return elapsed >= normalizeMinutes(autoLockMinutes) * MS_PER_MINUTE;
}

const MESSAGE_RETRY = "認証できませんでした。もう一度お試しください。";
const MESSAGE_LOCKOUT = "Face ID が一時的に使えません。端末のパスコードで開けます。";
const MESSAGE_FAIL_OPEN = "端末のパスコードが設定されていないため、アプリのロックは一時的に外れています。";
const MESSAGE_GENERIC = "開けませんでした。もう一度お試しください。";

// 認証失敗コード（@aparajita/capacitor-biometric-auth の BiometryErrorType）→ 挙動と文言（Ruling 9）。
// 試行回数制限は OS に任せる。端末のパスコード未設定だけはフェイルオープン（自分の記録に入れなくなる事故を防ぐ）。
const FAILURES = {
  userCancel: { action: "stay", message: null },
  appCancel: { action: "stay", message: null },
  systemCancel: { action: "stay", message: null },
  authenticationFailed: { action: "stay", message: MESSAGE_RETRY },
  userFallback: { action: "stay", message: MESSAGE_RETRY },
  biometryNotEnrolled: { action: "stay", message: MESSAGE_RETRY },
  biometryNotAvailable: { action: "stay", message: MESSAGE_RETRY },
  biometryLockout: { action: "stay", message: MESSAGE_LOCKOUT },
  passcodeNotSet: { action: "open", message: MESSAGE_FAIL_OPEN },
  noDeviceCredential: { action: "open", message: MESSAGE_FAIL_OPEN },
};

export function describeAuthFailure(code) {
  const known = Object.hasOwn(FAILURES, code) ? FAILURES[code] : null;
  return { ...(known ?? { action: "stay", message: MESSAGE_GENERIC }) };
}

export const initialLockState = Object.freeze({
  enabled: false,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  locked: false,
  authenticating: false,
  hiddenAt: null,
  // OS 認証の実行中に背景へ回ったか（その認証の成功ではロックを外さない）。
  interrupted: false,
  message: null,
  failOpen: false,
});

// events:
//   { type: "boot", settings }      起動時。enabled なら必ず locked=true から始める。
//   { type: "configure", settings } 設定の変更。開いている画面はロックしない（オフならロックを外す）。
//   { type: "hide", now }           背景へ（iOS: pause）。
//   { type: "show", now }           前景へ（iOS: resume）。経過時間でロック判定。
//   { type: "authStart" } / { type: "authSuccess" } / { type: "authFail", code }
//   { type: "disable" }             ロックをオフにした（再認証の後）。
export function reduceLock(state, event) {
  switch (event?.type) {
    case "boot": {
      const settings = normalizeSettings(event.settings);
      return {
        ...initialLockState,
        enabled: settings.enabled,
        autoLockMinutes: settings.autoLockMinutes,
        locked: settings.enabled,
      };
    }
    case "configure": {
      const settings = normalizeSettings(event.settings);
      if (!settings.enabled) return reduceLock(state, { type: "disable" });
      return { ...state, enabled: true, autoLockMinutes: settings.autoLockMinutes };
    }
    case "hide": {
      if (!state.enabled) return state;
      // ロック画面にいて認証もしていないなら、記録するものは無い。
      if (state.locked && !state.authenticating) return state;
      // 2 回目の hide（届き方の重複）では、早い方の時刻を残す（安全側）。
      const hiddenAt = state.hiddenAt === null ? Number(event.now) : Math.min(state.hiddenAt, Number(event.now));
      const next = { ...state, hiddenAt, interrupted: state.authenticating || state.interrupted };
      if (state.autoLockMinutes === 0) return { ...next, locked: true, message: null, failOpen: false };
      return next;
    }
    case "show": {
      if (state.hiddenAt === null) return state;
      const relock =
        state.enabled &&
        shouldRelock({ hiddenAt: state.hiddenAt, now: event.now, autoLockMinutes: state.autoLockMinutes });
      return relock
        ? { ...state, hiddenAt: null, locked: true, message: null, failOpen: false }
        : { ...state, hiddenAt: null };
    }
    case "authStart":
      return { ...state, authenticating: true, interrupted: false, message: null };
    case "authSuccess":
      // 背景をはさんだ成功では、ロックの状態を変えない（背景にいた時間の判定は show に任せる）。
      if (state.interrupted) return { ...state, authenticating: false, interrupted: false, message: null };
      return {
        ...state,
        authenticating: false,
        interrupted: false,
        locked: false,
        hiddenAt: null,
        message: null,
        failOpen: false,
      };
    case "authFail": {
      const { action, message } = describeAuthFailure(event.code);
      if (action === "open") {
        return { ...state, authenticating: false, interrupted: false, locked: false, failOpen: true, message };
      }
      return { ...state, authenticating: false, interrupted: false, message };
    }
    case "disable":
      return {
        ...state,
        enabled: false,
        locked: false,
        authenticating: false,
        interrupted: false,
        hiddenAt: null,
        message: null,
        failOpen: false,
      };
    default:
      return state;
  }
}
