import { describe, expect, it } from "vitest";
import {
  AUTO_LOCK_CHOICES,
  DEFAULT_AUTO_LOCK_MINUTES,
  DEFAULT_LOCK_SETTINGS,
  LOCK_SETTINGS_VERSION,
  LOCK_STORAGE_KEY,
  describeAuthFailure,
  initialLockState,
  loadLockSettings,
  reduceLock,
  saveLockSettings,
  shouldRelock,
} from "@/lib/appLock";
import { NATIVE_STORAGE_KEYS, createMemoryStorage } from "@/lib/storage";
import { applyBackup, buildBackup, parseBackup } from "@/lib/backup";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "@/lib/history";

const MINUTE = 60_000;
const T0 = Date.parse("2026-10-09T00:00:00.000Z");

describe("lock settings storage", () => {
  it("uses the agreed key and choices, with 5 minutes as the default (owner decision Q4)", () => {
    expect(LOCK_STORAGE_KEY).toBe("spiritual-diary.lock.v1");
    expect(AUTO_LOCK_CHOICES).toEqual([0, 1, 5, 15]);
    expect(DEFAULT_AUTO_LOCK_MINUTES).toBe(5);
    expect(DEFAULT_LOCK_SETTINGS).toEqual({
      version: LOCK_SETTINGS_VERSION,
      enabled: false,
      autoLockMinutes: 5,
      hideInSwitcher: true,
      enabledAt: null,
    });
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadLockSettings(createMemoryStorage())).toEqual(DEFAULT_LOCK_SETTINGS);
    expect(loadLockSettings(null)).toEqual(DEFAULT_LOCK_SETTINGS);
  });

  it("returns defaults for broken JSON, wrong shapes and unknown versions", () => {
    for (const raw of ["{", "null", "[]", '"x"', '{"version":2,"enabled":true}']) {
      const storage = createMemoryStorage({ [LOCK_STORAGE_KEY]: raw });
      expect(loadLockSettings(storage)).toEqual(DEFAULT_LOCK_SETTINGS);
    }
  });

  it("returns defaults when the storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadLockSettings(storage)).toEqual(DEFAULT_LOCK_SETTINGS);
  });

  it("normalizes an out-of-range auto-lock value to the default", () => {
    const storage = createMemoryStorage({
      [LOCK_STORAGE_KEY]: JSON.stringify({ version: 1, enabled: true, autoLockMinutes: 7, hideInSwitcher: false }),
    });
    expect(loadLockSettings(storage)).toMatchObject({ enabled: true, autoLockMinutes: 5, hideInSwitcher: false });
  });

  it("round-trips saved settings and stamps enabledAt when turned on", () => {
    const storage = createMemoryStorage();
    const saved = saveLockSettings(storage, { enabled: true, autoLockMinutes: 0 }, new Date(T0));
    expect(saved).toEqual({
      version: 1,
      enabled: true,
      autoLockMinutes: 0,
      hideInSwitcher: true,
      enabledAt: "2026-10-09T00:00:00.000Z",
    });
    expect(loadLockSettings(storage)).toEqual(saved);
  });

  it("keeps the original enabledAt while staying on, and clears it when turned off", () => {
    const storage = createMemoryStorage();
    saveLockSettings(storage, { enabled: true }, new Date(T0));
    const changed = saveLockSettings(storage, { enabled: true, autoLockMinutes: 15 }, new Date(T0 + MINUTE));
    expect(changed.enabledAt).toBe("2026-10-09T00:00:00.000Z");
    expect(changed.autoLockMinutes).toBe(15);
    const off = saveLockSettings(storage, { enabled: false }, new Date(T0 + 2 * MINUTE));
    expect(off.enabledAt).toBeNull();
    expect(off.autoLockMinutes).toBe(15);
  });

  it("is persisted on iOS (Preferences) like the consent", () => {
    expect(NATIVE_STORAGE_KEYS).toContain(LOCK_STORAGE_KEY);
  });
});

describe("backup never carries the lock settings (device-only, like consent)", () => {
  const lockValue = JSON.stringify({ version: 1, enabled: true, autoLockMinutes: 0, hideInSwitcher: true });

  it("buildBackup does not export the lock key", () => {
    const storage = createMemoryStorage({
      [LOCK_STORAGE_KEY]: lockValue,
      [HISTORY_STORAGE_KEY]: JSON.stringify([{ id: "a", createdAt: "2026-10-01T00:00:00.000Z" }]),
    });
    const json = JSON.stringify(buildBackup(storage));
    expect(json).not.toContain("spiritual-diary.lock");
    expect(json).not.toContain("autoLockMinutes");
  });

  it("importing a backup that smuggles lock settings leaves the device setting untouched", () => {
    const storage = createMemoryStorage({ [LOCK_STORAGE_KEY]: lockValue });
    const text = JSON.stringify({
      app: "spiritual-diary",
      schemaVersion: 1,
      profile: { birthDate: "1999-06-07" },
      history: [{ id: "b", createdAt: "2026-10-02T00:00:00.000Z" }],
      chat: [],
      [LOCK_STORAGE_KEY]: JSON.stringify({ version: 1, enabled: false }),
      lock: { version: 1, enabled: false },
    });
    const parsed = parseBackup(text);
    expect(Object.keys(parsed).sort()).toEqual(["chat", "history", "profile"]);
    applyBackup(storage, parsed);
    expect(storage.getItem(LOCK_STORAGE_KEY)).toBe(lockValue);
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toContain("1999-06-07");
  });

  it("importing into a device without a lock does not create one", () => {
    const storage = createMemoryStorage();
    applyBackup(
      storage,
      parseBackup(JSON.stringify({ app: "spiritual-diary", schemaVersion: 1, history: [], lock: { enabled: true } })),
    );
    expect(storage.getItem(LOCK_STORAGE_KEY)).toBeNull();
  });
});

describe("shouldRelock", () => {
  it("does not relock without a recorded hide time", () => {
    expect(shouldRelock({ hiddenAt: null, now: T0, autoLockMinutes: 0 })).toBe(false);
    expect(shouldRelock({ hiddenAt: undefined, now: T0, autoLockMinutes: 5 })).toBe(false);
  });

  it("relocks immediately for 'すぐに' (0 minutes)", () => {
    expect(shouldRelock({ hiddenAt: T0, now: T0, autoLockMinutes: 0 })).toBe(true);
  });

  it("uses a >= threshold: 59s stays open, 60s locks for 1 minute", () => {
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 59_000, autoLockMinutes: 1 })).toBe(false);
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 60_000, autoLockMinutes: 1 })).toBe(true);
  });

  it("uses 5 and 15 minute thresholds", () => {
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 5 * MINUTE - 1, autoLockMinutes: 5 })).toBe(false);
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 5 * MINUTE, autoLockMinutes: 5 })).toBe(true);
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 15 * MINUTE - 1, autoLockMinutes: 15 })).toBe(false);
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 15 * MINUTE, autoLockMinutes: 15 })).toBe(true);
  });

  it("accepts Date objects", () => {
    expect(shouldRelock({ hiddenAt: new Date(T0), now: new Date(T0 + 2 * MINUTE), autoLockMinutes: 1 })).toBe(true);
  });

  it("fails closed when the clock went backwards", () => {
    expect(shouldRelock({ hiddenAt: T0, now: T0 - 1000, autoLockMinutes: 15 })).toBe(true);
  });

  it("treats an unknown auto-lock value as the default 5 minutes", () => {
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 4 * MINUTE, autoLockMinutes: 99 })).toBe(false);
    expect(shouldRelock({ hiddenAt: T0, now: T0 + 5 * MINUTE, autoLockMinutes: 99 })).toBe(true);
  });
});

describe("describeAuthFailure (Ruling 9)", () => {
  it("stays locked silently on cancels", () => {
    for (const code of ["userCancel", "appCancel", "systemCancel"]) {
      expect(describeAuthFailure(code)).toEqual({ action: "stay", message: null });
    }
  });

  it("stays locked with a retry message on failed attempts", () => {
    for (const code of ["authenticationFailed", "userFallback"]) {
      expect(describeAuthFailure(code)).toEqual({
        action: "stay",
        message: "認証できませんでした。もう一度お試しください。",
      });
    }
  });

  it("explains biometry lockout", () => {
    expect(describeAuthFailure("biometryLockout")).toEqual({
      action: "stay",
      message: "Face ID が一時的に使えません。端末のパスコードで開けます。",
    });
  });

  it("fails open when the device has no passcode", () => {
    for (const code of ["passcodeNotSet", "noDeviceCredential"]) {
      const result = describeAuthFailure(code);
      expect(result.action).toBe("open");
      expect(result.message).toBe("端末のパスコードが設定されていないため、アプリのロックは一時的に外れています。");
    }
  });

  it("fails open for pluginUnavailable (D-09: never lock people out of their own records)", () => {
    expect(describeAuthFailure("pluginUnavailable").action).toBe("open");
  });

  it("stays locked with a generic message for anything else", () => {
    for (const code of ["invalidContext", "notInteractive", "unknown", "", undefined, "somethingNew"]) {
      expect(describeAuthFailure(code)).toEqual({ action: "stay", message: "開けませんでした。もう一度お試しください。" });
    }
  });

  it("never fails open for biometry-only problems (the OS falls back to the passcode)", () => {
    for (const code of ["biometryNotEnrolled", "biometryNotAvailable"]) {
      expect(describeAuthFailure(code).action).toBe("stay");
    }
  });
});

describe("reduceLock", () => {
  const enabled = { enabled: true, autoLockMinutes: 5 };
  const boot = (settings = enabled) => reduceLock(initialLockState, { type: "boot", settings });

  it("starts unlocked when the lock is off", () => {
    const state = boot({ enabled: false, autoLockMinutes: 5 });
    expect(state.locked).toBe(false);
    expect(state.enabled).toBe(false);
  });

  it("always starts locked when the lock is on", () => {
    const state = boot();
    expect(state).toMatchObject({ enabled: true, locked: true, authenticating: false, hiddenAt: null });
  });

  it("normalizes boot settings", () => {
    expect(boot({ enabled: true, autoLockMinutes: 3 }).autoLockMinutes).toBe(5);
    expect(reduceLock(initialLockState, { type: "boot" }).locked).toBe(false);
  });

  it("unlocks on success and clears any message", () => {
    let state = boot();
    state = reduceLock(state, { type: "authStart" });
    expect(state.authenticating).toBe(true);
    state = reduceLock(state, { type: "authSuccess" });
    expect(state).toMatchObject({ locked: false, authenticating: false, message: null, failOpen: false });
  });

  it("relocks after the background time reaches the setting", () => {
    let state = reduceLock(boot(), { type: "authSuccess" });
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(state.hiddenAt).toBe(T0);
    const early = reduceLock(state, { type: "show", now: T0 + 5 * MINUTE - 1 });
    expect(early.locked).toBe(false);
    expect(early.hiddenAt).toBeNull();
    const late = reduceLock(state, { type: "show", now: T0 + 5 * MINUTE });
    expect(late.locked).toBe(true);
    expect(late.hiddenAt).toBeNull();
  });

  it("relocks on any hide with 'すぐに'", () => {
    let state = reduceLock(boot({ enabled: true, autoLockMinutes: 0 }), { type: "authSuccess" });
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "show", now: T0 });
    expect(state.locked).toBe(true);
  });

  // P1-1（監査 2026-10-09）: Face ID・パスコードの画面では pause/resume は起きない（resignActive だけ）。
  // だから認証中に届いた hide は「認証画面のまま本当に背景へ回った」合図で、記録して show で判定する。
  it("records hide during the OS authentication and relocks on show past the threshold", () => {
    let state = reduceLock(boot(), { type: "authSuccess" }); // 5 分
    state = reduceLock(state, { type: "authStart" }); // e.g. re-auth before export
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(state).toMatchObject({ hiddenAt: T0, interrupted: true, locked: false });
    state = reduceLock(state, { type: "authFail", code: "systemCancel" }); // the OS cancels the sheet
    expect(state.hiddenAt).toBe(T0);
    const late = reduceLock(state, { type: "show", now: T0 + 20 * MINUTE });
    expect(late.locked).toBe(true);
    const early = reduceLock(state, { type: "show", now: T0 + MINUTE });
    expect(early.locked).toBe(false);
  });

  it("judges show even while the OS authentication is still marked as running", () => {
    let state = reduceLock(boot(), { type: "authSuccess" });
    state = reduceLock(state, { type: "authStart" });
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "show", now: T0 + 20 * MINUTE });
    expect(state).toMatchObject({ locked: true, authenticating: true, hiddenAt: null });
    // the cancelled sheet reports back afterwards: still locked
    state = reduceLock(state, { type: "authFail", code: "systemCancel" });
    expect(state.locked).toBe(true);
  });

  it("does not let a success that was interrupted by going to the background undo the relock", () => {
    let state = reduceLock(boot(), { type: "authSuccess" });
    state = reduceLock(state, { type: "authStart" });
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "show", now: T0 + 20 * MINUTE });
    state = reduceLock(state, { type: "authSuccess" });
    expect(state).toMatchObject({ locked: true, authenticating: false, interrupted: false });
  });

  it("keeps the background time when an interrupted success arrives before show", () => {
    let state = reduceLock(boot(), { type: "authSuccess" });
    state = reduceLock(state, { type: "authStart" });
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "authSuccess" });
    expect(state).toMatchObject({ hiddenAt: T0, authenticating: false });
    expect(reduceLock(state, { type: "show", now: T0 + 20 * MINUTE }).locked).toBe(true);
  });

  it("keeps the earliest hide time when hide arrives twice", () => {
    let state = reduceLock(boot(), { type: "authSuccess" });
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "hide", now: T0 + 4 * MINUTE });
    expect(state.hiddenAt).toBe(T0);
  });

  // P1-2: 「すぐに」は背景へ回った時点でロックする（切り替え画面・復帰の最初のフレームをロック画面にするため）。
  it("locks right at hide with 'すぐに'", () => {
    let state = reduceLock(boot({ enabled: true, autoLockMinutes: 0 }), { type: "authSuccess" });
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(state.locked).toBe(true);
    state = reduceLock(state, { type: "show", now: T0 });
    expect(state).toMatchObject({ locked: true, hiddenAt: null });
  });

  it("locks at hide with 'すぐに' even during the OS authentication, and a late success keeps it locked", () => {
    let state = reduceLock(boot({ enabled: true, autoLockMinutes: 0 }), { type: "authSuccess" });
    state = reduceLock(state, { type: "authStart" });
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(state.locked).toBe(true);
    state = reduceLock(state, { type: "authSuccess" });
    expect(state.locked).toBe(true);
  });

  it("does not lock at hide for 1/5/15 minutes (decided on show)", () => {
    for (const minutes of [1, 5, 15]) {
      let state = reduceLock(boot({ enabled: true, autoLockMinutes: minutes }), { type: "authSuccess" });
      state = reduceLock(state, { type: "hide", now: T0 });
      expect(state.locked).toBe(false);
    }
  });

  it("records no background time on the lock screen itself unless the OS sheet is up", () => {
    const hidden = reduceLock(boot(), { type: "hide", now: T0 });
    expect(hidden).toMatchObject({ locked: true, hiddenAt: null, visible: false });
  });

  // シミュレータ再検収で判明: 「すぐに」は背景でロックするので、ロック画面の自動認証が背景で走って空振りし、
  // 戻っても Face ID が出なかった。自動認証は前景に戻ってから（visible）。
  it("tracks whether the app is in the foreground", () => {
    let state = reduceLock(boot({ enabled: true, autoLockMinutes: 0 }), { type: "authSuccess" });
    expect(state.visible).toBe(true);
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(state).toMatchObject({ locked: true, visible: false });
    state = reduceLock(state, { type: "show", now: T0 + 1000 });
    expect(state).toMatchObject({ locked: true, visible: true });
    const off = boot({ enabled: false, autoLockMinutes: 5 });
    expect(reduceLock(off, { type: "hide", now: T0 })).toBe(off);
  });

  it("does nothing on hide/show when the lock is off", () => {
    const state = boot({ enabled: false, autoLockMinutes: 0 });
    const hidden = reduceLock(state, { type: "hide", now: T0 });
    expect(hidden.hiddenAt).toBeNull();
    expect(reduceLock(hidden, { type: "show", now: T0 + 20 * MINUTE }).locked).toBe(false);
  });

  it("keeps the lock on a cancelled attempt without a message", () => {
    let state = reduceLock(boot(), { type: "authStart" });
    state = reduceLock(state, { type: "authFail", code: "userCancel" });
    expect(state).toMatchObject({ locked: true, authenticating: false, message: null, failOpen: false });
  });

  it("keeps the lock with a message on a failed attempt", () => {
    let state = reduceLock(boot(), { type: "authStart" });
    state = reduceLock(state, { type: "authFail", code: "authenticationFailed" });
    expect(state.locked).toBe(true);
    expect(state.message).toBe("認証できませんでした。もう一度お試しください。");
  });

  it("fails open with a notice when the device passcode is not set", () => {
    let state = reduceLock(boot(), { type: "authStart" });
    state = reduceLock(state, { type: "authFail", code: "passcodeNotSet" });
    expect(state).toMatchObject({ locked: false, authenticating: false, failOpen: true, enabled: true });
    expect(state.message).toContain("一時的に外れています");
  });

  // 監査 P1-3: 端末の認証を呼び出せない（プラグインの登録漏れなど）と、自分の記録に入れなくなる（D-09）→ フェイルオープン。
  it("fails open with its own notice when the OS authentication cannot be reached", () => {
    let state = reduceLock(boot(), { type: "authStart" });
    state = reduceLock(state, { type: "authFail", code: "pluginUnavailable" });
    expect(state).toMatchObject({ locked: false, failOpen: true, enabled: true });
    expect(state.message).toBe("端末の認証を呼び出せないため、アプリのロックは一時的に外れています。");
  });

  it("fails open when the availability check says the device cannot authenticate while locked", () => {
    const locked = boot();
    const noPlugin = reduceLock(locked, { type: "availability", availability: { available: false, reason: "pluginUnavailable" } });
    expect(noPlugin).toMatchObject({ locked: false, failOpen: true });
    expect(noPlugin.message).toContain("端末の認証を呼び出せない");
    const noPasscode = reduceLock(locked, { type: "availability", availability: { available: false, reason: "passcodeNotSet" } });
    expect(noPasscode).toMatchObject({ locked: false, failOpen: true });
    expect(noPasscode.message).toContain("端末のパスコードが設定されていない");
    const noReason = reduceLock(locked, { type: "availability", availability: { available: false } });
    expect(noReason).toMatchObject({ locked: false, failOpen: true });
  });

  it("ignores an available result, an unlocked app, or a lock that is off", () => {
    const locked = boot();
    expect(reduceLock(locked, { type: "availability", availability: { available: true } })).toBe(locked);
    expect(reduceLock(locked, { type: "availability", availability: null })).toBe(locked);
    const open = reduceLock(locked, { type: "authSuccess" });
    expect(reduceLock(open, { type: "availability", availability: { available: false } })).toBe(open);
    const off = boot({ enabled: false, autoLockMinutes: 5 });
    expect(reduceLock(off, { type: "availability", availability: { available: false } })).toBe(off);
  });

  // 監査 P2-7: 一度閉じたフェイルオープンの帯も、新しくフェイルオープンしたらもう一度出す（回数で見分ける）。
  it("counts each new fail-open so the banner can show again", () => {
    let state = boot();
    expect(state.failOpenSeq).toBe(0);
    state = reduceLock(reduceLock(state, { type: "authStart" }), { type: "authFail", code: "passcodeNotSet" });
    expect(state.failOpenSeq).toBe(1);
    state = reduceLock(state, { type: "hide", now: T0 });
    state = reduceLock(state, { type: "show", now: T0 + 20 * MINUTE });
    expect(state.locked).toBe(true);
    state = reduceLock(state, { type: "availability", availability: { available: false, reason: "passcodeNotSet" } });
    expect(state.failOpenSeq).toBe(2);
    const cancelled = reduceLock(reduceLock(state, { type: "authStart" }), { type: "authFail", code: "userCancel" });
    expect(cancelled.failOpenSeq).toBe(2);
    expect(reduceLock(state, { type: "boot", settings: { enabled: true } }).failOpenSeq).toBe(2);
  });

  it("disable turns everything off", () => {
    let state = reduceLock(boot(), { type: "hide", now: T0 });
    state = reduceLock(state, { type: "disable" });
    expect(state).toMatchObject({ enabled: false, locked: false, authenticating: false, hiddenAt: null, message: null });
  });

  it("configure applies new settings without locking the open app", () => {
    let state = boot({ enabled: false, autoLockMinutes: 5 });
    state = reduceLock(state, { type: "configure", settings: { enabled: true, autoLockMinutes: 1 } });
    expect(state).toMatchObject({ enabled: true, autoLockMinutes: 1, locked: false });
    state = reduceLock(state, { type: "hide", now: T0 });
    expect(reduceLock(state, { type: "show", now: T0 + MINUTE }).locked).toBe(true);
    const off = reduceLock(state, { type: "configure", settings: { enabled: false, autoLockMinutes: 1 } });
    expect(off).toMatchObject({ enabled: false, locked: false, hiddenAt: null });
  });

  it("returns the same state for unknown events", () => {
    const state = boot();
    expect(reduceLock(state, { type: "nope" })).toBe(state);
    expect(reduceLock(state, null)).toBe(state);
  });
});
