// アプリのロックの結線（OS 認証の呼び出し・再認証・オン/オフ）。React から切り離して vitest で確かめる（監査 P2-6）。
// SpiritualDiary.jsx は createLockController を 1 つ作り、状態は reduceLock（appLock.js）に dispatch する。
// - OS 認証の実行中や、再認証から共有シートを出すまでの間に背景へ回ったら（notifyHide）、その操作は続けない
//   （戻ったときにロック画面の上へ共有シートが出たり、ロックが外れたりしないように。監査 P1-1）。
// - shieldDuringAuth: 目隠しプラグインの不具合への旧回避策（認証の間だけ目隠しを外す）。プラグインを直したので既定は false。

import {
  LOCK_AUTH_REASONS,
  REAUTH_SETTLE_MS,
  autoAuthFailEvent,
  enableOutcome,
  needsReauth,
  privacyScreenWanted,
  reauthOutcome,
} from "./lockUi";

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createLockController({
  dispatch,
  getLockState,
  getSettings,
  authenticate,
  setPrivacyScreen,
  wait = defaultWait,
  shieldDuringAuth = false,
}) {
  // 背景をはさんだかどうかを見張っている操作の数（認証＋共有シートを出すまでの待ち）。
  let watching = 0;
  let interrupted = false;
  let authInFlight = false;

  const watch = () => {
    if (watching === 0) interrupted = false;
    watching += 1;
  };
  const unwatch = () => {
    watching = Math.max(0, watching - 1);
  };

  // OS 認証を 1 回求める。戻り値に interrupted（認証中に背景へ回った）を足す。
  async function runLockAuth(reason) {
    dispatch({ type: "authStart" });
    authInFlight = true;
    watch();
    const shielded = shieldDuringAuth && privacyScreenWanted(getSettings());
    try {
      if (shielded) await setPrivacyScreen(false);
      const result = await authenticate({ reason });
      return { ...result, interrupted };
    } finally {
      authInFlight = false;
      unwatch();
      if (shielded && privacyScreenWanted(getSettings())) setPrivacyScreen(true);
    }
  }

  // 背景へ回った（pause）。認証を外していたなら目隠しをすぐ戻す。
  function notifyHide() {
    if (watching > 0) interrupted = true;
    if (shieldDuringAuth && authInFlight && privacyScreenWanted(getSettings())) setPrivacyScreen(true);
  }

  async function unlock({ automatic = false } = {}) {
    const result = await runLockAuth(LOCK_AUTH_REASONS.unlock);
    if (result.ok) dispatch({ type: "authSuccess" });
    else dispatch(automatic ? autoAuthFailEvent(result.code) : { type: "authFail", code: result.code });
    return result;
  }

  // 書き出し・ロックのオフの前の再認証（Ruling 11）。ロックがオフなら確認しない。
  // 戻り値: { proceed, failOpen, notice }
  async function confirmWithLock(reason) {
    if (!needsReauth(getLockState())) return { proceed: true, failOpen: false, notice: null };
    watch();
    try {
      const result = await runLockAuth(reason);
      const outcome = reauthOutcome(result);
      // 認証中フラグを戻す。パスコード未設定などはフェイルオープン（理由の帯を出す）、それ以外は静かに戻す。
      if (result.ok) dispatch({ type: "authSuccess" });
      else dispatch(outcome.failOpen ? { type: "authFail", code: result.code } : { type: "authFail", code: "userCancel" });
      if (!outcome.proceed) return outcome;
      // OS の認証画面が閉じきってから続ける（すぐに共有シートを出すと失敗することがある。T-L5）。
      await wait(REAUTH_SETTLE_MS);
      // 認証中・待ちの間に背景へ回った、またはロックされたなら続けない（ロック画面の上に共有シートを出さない）。
      if (interrupted || getLockState()?.locked) return { proceed: false, failOpen: false, notice: null };
      return outcome;
    } finally {
      unwatch();
    }
  }

  // ロックのオン/オフ。戻り値: { change: "enable" | "disable" | null, notice }
  async function toggleLock(currentlyEnabled) {
    if (!currentlyEnabled) {
      const result = await runLockAuth(LOCK_AUTH_REASONS.enable);
      // 認証中フラグだけ戻す（ロックはまだオフなので、ロック画面は出ない）。
      dispatch({ type: "authFail", code: "userCancel" });
      const { enable, notice } = enableOutcome(result);
      return { change: enable ? "enable" : null, notice };
    }
    const { proceed, notice } = await confirmWithLock(LOCK_AUTH_REASONS.disable);
    return { change: proceed ? "disable" : null, notice };
  }

  return { runLockAuth, notifyHide, unlock, confirmWithLock, toggleLock };
}
