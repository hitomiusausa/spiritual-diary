// 起動時のアプリのロック（iOS のみ）。設計 Ruling 6・8、監査 P2-6・P2-7。
// - prepareLockBoot: ストレージ復元の直後・画面を決める前に呼ぶ。ロックがオンなら端末の認証方法も先に調べる
//   （スプラッシュの裏で済ませ、ロック画面のボタンが「パスコードでひらく」→「Face IDでひらく」と変わって見えないように）。
// - commitBoot: ロックの判定を画面（step）より先に、await をはさまず同じ同期処理の中で反映する（同じ描画に乗る）。

import { loadLockSettings } from "./appLock";

// 端末の認証方法を待つ上限。過ぎたらボタンは中立の文言で出し、後から分かった時点で差し替える。
export const LOCK_BOOT_AVAILABILITY_TIMEOUT_MS = 1500;

export async function prepareLockBoot({ native, storage, checkAvailability, timeoutMs = LOCK_BOOT_AVAILABILITY_TIMEOUT_MS }) {
  if (!native) return null;
  const settings = loadLockSettings(storage);
  if (!settings.enabled) return { settings, availability: null };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const availability = await Promise.race([Promise.resolve(checkAvailability()).catch(() => null), timeout]);
    return { settings, availability };
  } finally {
    clearTimeout(timer);
  }
}

// apply: { setLockNative, setLockSettings, setLockAvailability, dispatchLock, setStep, setProfileHydrated }
export function commitBoot({ lock, step, apply }) {
  if (lock) {
    apply.setLockNative(true);
    apply.setLockSettings(lock.settings);
    if (lock.availability) apply.setLockAvailability(lock.availability);
    apply.dispatchLock({ type: "boot", settings: lock.settings });
    if (lock.availability) apply.dispatchLock({ type: "availability", availability: lock.availability });
  }
  apply.setStep(step);
  apply.setProfileHydrated(true);
}
