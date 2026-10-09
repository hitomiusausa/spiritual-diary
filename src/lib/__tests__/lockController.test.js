import { describe, expect, it, vi } from "vitest";
import { initialLockState, reduceLock } from "@/lib/appLock";
import { createLockController } from "@/lib/lockController";
import { LOCK_AUTH_REASONS, REAUTH_SETTLE_MS } from "@/lib/lockUi";

const ON = { enabled: true, autoLockMinutes: 5, hideInSwitcher: true };

// reduceLock を本物で回す小さな器（React の useReducer の代わり）。
function harness({ settings = ON, authResults = [{ ok: true }], unlocked = true, shieldDuringAuth = false } = {}) {
  let state = reduceLock(initialLockState, { type: "boot", settings });
  if (unlocked) state = reduceLock(state, { type: "authSuccess" });
  const events = [];
  const dispatch = vi.fn((event) => {
    events.push(event.type);
    state = reduceLock(state, event);
  });
  const calls = [];
  let pendingAuth = null;
  const authenticate = vi.fn(({ reason }) => {
    calls.push(["auth", reason]);
    const next = authResults.shift() ?? { ok: true };
    if (next === "pending") {
      return new Promise((resolve) => {
        pendingAuth = resolve;
      });
    }
    return Promise.resolve(next);
  });
  const setPrivacyScreen = vi.fn(async (on) => {
    calls.push(["privacy", on]);
    return true;
  });
  const waits = [];
  const wait = vi.fn((ms) => {
    waits.push(ms);
    return Promise.resolve();
  });
  const controller = createLockController({
    dispatch,
    getLockState: () => state,
    getSettings: () => settings,
    authenticate,
    setPrivacyScreen,
    wait,
    shieldDuringAuth,
  });
  return {
    controller,
    dispatch,
    authenticate,
    setPrivacyScreen,
    calls,
    events,
    waits,
    get state() {
      return state;
    },
    resolveAuth: (result) => pendingAuth(result),
    hide: (now) => {
      controller.notifyHide();
      dispatch({ type: "hide", now });
    },
    show: (now) => dispatch({ type: "show", now }),
  };
}

describe("unlock", () => {
  it("unlocks on success", async () => {
    const h = harness({ unlocked: false });
    expect(h.state.locked).toBe(true);
    await h.controller.unlock();
    expect(h.authenticate).toHaveBeenCalledWith({ reason: LOCK_AUTH_REASONS.unlock });
    expect(h.state).toMatchObject({ locked: false, authenticating: false });
  });

  it("stays locked and silent when the automatic first attempt is cancelled", async () => {
    const h = harness({ unlocked: false, authResults: [{ ok: false, code: "notInteractive" }] });
    await h.controller.unlock({ automatic: true });
    expect(h.state).toMatchObject({ locked: true, message: null });
  });

  it("shows the failure when a tapped attempt fails", async () => {
    const h = harness({ unlocked: false, authResults: [{ ok: false, code: "authenticationFailed" }] });
    await h.controller.unlock();
    expect(h.state.locked).toBe(true);
    expect(h.state.message).toContain("認証できませんでした");
  });

  it("does not unlock when the app went to the background during the sheet", async () => {
    const h = harness({ unlocked: false, authResults: ["pending"] });
    const done = h.controller.unlock();
    h.hide(1000);
    h.resolveAuth({ ok: true });
    await done;
    expect(h.state.locked).toBe(true);
  });
});

describe("confirmWithLock (re-auth before export / turning off)", () => {
  it("does not ask while the lock is off", async () => {
    const h = harness({ settings: { enabled: false, autoLockMinutes: 5 } });
    await expect(h.controller.confirmWithLock(LOCK_AUTH_REASONS.export)).resolves.toEqual({
      proceed: true,
      failOpen: false,
      notice: null,
    });
    expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.waits).toEqual([]);
  });

  it("proceeds after success and waits for the OS sheet to close before continuing", async () => {
    const h = harness();
    const outcome = await h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome).toMatchObject({ proceed: true });
    expect(h.waits).toEqual([REAUTH_SETTLE_MS]);
    expect(h.state).toMatchObject({ locked: false, authenticating: false });
  });

  it("stops quietly on cancel without waiting", async () => {
    const h = harness({ authResults: [{ ok: false, code: "userCancel" }] });
    const outcome = await h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome).toEqual({ proceed: false, failOpen: false, notice: null });
    expect(h.waits).toEqual([]);
    expect(h.state).toMatchObject({ locked: false, authenticating: false, message: null });
  });

  it("refuses with a notice on failure, without locking the open app", async () => {
    const h = harness({ authResults: [{ ok: false, code: "authenticationFailed" }] });
    const outcome = await h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome.proceed).toBe(false);
    expect(outcome.notice).toBeTruthy();
    expect(h.state.locked).toBe(false);
  });

  it("fails open (with the banner) when the device has no passcode", async () => {
    const h = harness({ authResults: [{ ok: false, code: "passcodeNotSet" }] });
    const outcome = await h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome).toMatchObject({ proceed: true, failOpen: true });
    expect(h.state.failOpen).toBe(true);
  });

  // 監査 P1-1: Face ID の画面のままホームへ → 戻ると、書き出しを続けずにロックされている。
  it("does not export when the app went to the background during the sheet, and relocks per the setting", async () => {
    const h = harness({ authResults: ["pending"] });
    const done = h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    h.hide(0);
    h.resolveAuth({ ok: false, code: "systemCancel" });
    const outcome = await done;
    expect(outcome.proceed).toBe(false);
    h.show(6 * 60_000);
    expect(h.state.locked).toBe(true);
  });

  it("does not export when the sheet succeeded but the app was sent to the background meanwhile", async () => {
    const h = harness({ authResults: ["pending"] });
    const done = h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    h.hide(0);
    h.resolveAuth({ ok: true });
    const outcome = await done;
    expect(outcome.proceed).toBe(false);
    h.show(6 * 60_000);
    expect(h.state.locked).toBe(true);
  });

  it("does not export when the app was hidden during the settle wait", async () => {
    const h = harness();
    const origWait = h.waits;
    const controller = createLockController({
      dispatch: h.dispatch,
      getLockState: () => h.state,
      getSettings: () => ON,
      authenticate: async () => ({ ok: true }),
      setPrivacyScreen: async () => true,
      wait: async () => {
        origWait.push("hidden");
        controller.notifyHide();
      },
    });
    const outcome = await controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome.proceed).toBe(false);
  });

  it("does not export when the app got locked before the share sheet", async () => {
    const h = harness({ settings: { ...ON, autoLockMinutes: 0 } });
    const controller = createLockController({
      dispatch: h.dispatch,
      getLockState: () => h.state,
      getSettings: () => ({ ...ON, autoLockMinutes: 0 }),
      authenticate: async () => ({ ok: true }),
      setPrivacyScreen: async () => true,
      wait: async () => {
        h.dispatch({ type: "hide", now: 0 }); // 'すぐに' locks at hide
      },
    });
    const outcome = await controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(outcome.proceed).toBe(false);
  });

  it("keeps the switcher blur on during the OS sheet (the plugin is patched; no workaround)", async () => {
    const h = harness();
    await h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    expect(h.setPrivacyScreen).not.toHaveBeenCalled();
  });

  it("with the old workaround, lifts the blur only for the sheet and restores it at once on hide", async () => {
    const h = harness({ shieldDuringAuth: true, authResults: ["pending"] });
    const done = h.controller.confirmWithLock(LOCK_AUTH_REASONS.export);
    await Promise.resolve();
    expect(h.calls).toContainEqual(["privacy", false]);
    h.hide(0);
    expect(h.calls.at(-1)).toEqual(["privacy", true]);
    h.resolveAuth({ ok: false, code: "systemCancel" });
    await done;
    expect(h.calls.at(-1)).toEqual(["privacy", true]);
  });
});

describe("toggleLock", () => {
  it("turns on only after a successful check, and leaves the open app unlocked", async () => {
    const h = harness({ settings: { enabled: false, autoLockMinutes: 5 } });
    await expect(h.controller.toggleLock(false)).resolves.toEqual({ change: "enable", notice: null });
    expect(h.authenticate).toHaveBeenCalledWith({ reason: LOCK_AUTH_REASONS.enable });
    expect(h.state).toMatchObject({ locked: false, authenticating: false });
  });

  it("does not turn on when the device has no passcode", async () => {
    const h = harness({ settings: { enabled: false, autoLockMinutes: 5 }, authResults: [{ ok: false, code: "passcodeNotSet" }] });
    const result = await h.controller.toggleLock(false);
    expect(result.change).toBeNull();
    expect(result.notice).toBe("端末のパスコードを設定すると使えます。");
  });

  it("turns off only after re-auth", async () => {
    const h = harness();
    await expect(h.controller.toggleLock(true)).resolves.toEqual({ change: "disable", notice: null });
    expect(h.authenticate).toHaveBeenCalledWith({ reason: LOCK_AUTH_REASONS.disable });
  });

  it("keeps the lock on when the re-auth is cancelled", async () => {
    const h = harness({ authResults: [{ ok: false, code: "userCancel" }] });
    await expect(h.controller.toggleLock(true)).resolves.toEqual({ change: null, notice: null });
  });

  it("keeps the lock on when the app went to the background during the re-auth", async () => {
    const h = harness({ authResults: ["pending"] });
    const done = h.controller.toggleLock(true);
    h.hide(0);
    h.resolveAuth({ ok: true });
    await expect(done).resolves.toEqual({ change: null, notice: null });
  });
});
