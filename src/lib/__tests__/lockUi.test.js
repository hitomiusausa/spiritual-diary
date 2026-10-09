import { describe, expect, it } from "vitest";
import { initialLockState, reduceLock } from "@/lib/appLock";
import {
  AUTO_LOCK_OPTIONS,
  LOCK_AUTH_REASONS,
  LOCK_SETTINGS_NOTE,
  autoAuthFailEvent,
  enableOutcome,
  lockScreenView,
  lockToggleDescription,
  needsReauth,
  privacyScreenWanted,
  reauthOutcome,
  shouldOfferLockSettings,
  unlockMethod,
} from "@/lib/lockUi";

const FORBIDDEN = /暗号化|パスワード/;

describe("unlockMethod (button label by biometry type)", () => {
  it("names Face ID, Touch ID or the device passcode", () => {
    expect(unlockMethod("faceId")).toEqual({ kind: "faceId", label: "Face IDでひらく" });
    expect(unlockMethod("touchId")).toEqual({ kind: "touchId", label: "Touch IDでひらく" });
    expect(unlockMethod("none")).toEqual({ kind: "passcode", label: "パスコードでひらく" });
    expect(unlockMethod(undefined)).toEqual({ kind: "passcode", label: "パスコードでひらく" });
  });
});

describe("lockScreenView", () => {
  const locked = reduceLock(initialLockState, { type: "boot", settings: { version: 1, enabled: true } });

  it("is idle with a single unlock button right after boot", () => {
    expect(lockScreenView(locked, "faceId")).toEqual({
      mode: "idle",
      busy: false,
      primaryLabel: "Face IDでひらく",
      method: "faceId",
      showPasscode: false,
      message: null,
      detail: null,
    });
  });

  it("is busy while the OS sheet is up", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authStart" }), "faceId");
    expect(view.busy).toBe(true);
    expect(view.mode).toBe("idle");
  });

  it("stays idle (no failure message) when the person cancels", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "userCancel" }), "faceId");
    expect(view.mode).toBe("idle");
    expect(view.message).toBeNull();
  });

  it("shows the failure state with retry and a passcode button after a failed attempt", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "authenticationFailed" }), "faceId");
    expect(view).toMatchObject({
      mode: "failed",
      primaryLabel: "もう一度",
      showPasscode: true,
      message: "認証できませんでした。",
      detail: "もう一度お試しください。",
    });
  });

  it("explains a lockout in two lines (the OS will ask for the passcode next)", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "biometryLockout" }), "faceId");
    expect(view.mode).toBe("failed");
    expect(view.message).toBe("Face ID が一時的に使えません。");
    expect(view.detail).toBe("端末のパスコードで開けます。");
  });

  it("says Touch ID on Touch ID devices", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "biometryLockout" }), "touchId");
    expect(view.message).toBe("Touch ID が一時的に使えません。");
  });

  it("does not offer a separate passcode button when the passcode is already the method", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "authenticationFailed" }), "none");
    expect(view.showPasscode).toBe(false);
  });

  it("never uses the forbidden words", () => {
    for (const code of ["authenticationFailed", "biometryLockout", "unknown", "passcodeNotSet"]) {
      const view = lockScreenView(reduceLock(locked, { type: "authFail", code }), "faceId");
      expect(`${view.primaryLabel}${view.message ?? ""}${view.detail ?? ""}`).not.toMatch(FORBIDDEN);
    }
  });
});

describe("settings glue (T-L4)", () => {
  it("offers the lock settings only in the iOS app, when the device can authenticate (or the lock is already on)", () => {
    const yes = { available: true, deviceIsSecure: true, biometryType: "faceId" };
    const no = { available: false, deviceIsSecure: false, biometryType: "none" };
    expect(shouldOfferLockSettings({ native: false, availability: yes, enabled: false })).toBe(false);
    expect(shouldOfferLockSettings({ native: false, availability: yes, enabled: true })).toBe(false);
    expect(shouldOfferLockSettings({ native: true, availability: null, enabled: false })).toBe(false);
    expect(shouldOfferLockSettings({ native: true, availability: no, enabled: false })).toBe(false);
    expect(shouldOfferLockSettings({ native: true, availability: yes, enabled: false })).toBe(true);
    // パスコードを外した後でも、オフにできるよう項目は残す
    expect(shouldOfferLockSettings({ native: true, availability: no, enabled: true })).toBe(true);
  });

  it("wants the switcher blur only when the lock is on and hiding is on", () => {
    expect(privacyScreenWanted({ enabled: true, hideInSwitcher: true })).toBe(true);
    expect(privacyScreenWanted({ enabled: true, hideInSwitcher: false })).toBe(false);
    expect(privacyScreenWanted({ enabled: false, hideInSwitcher: true })).toBe(false);
    expect(privacyScreenWanted(null)).toBe(false);
  });

  it("lists the four auto-lock choices in order with short labels", () => {
    expect(AUTO_LOCK_OPTIONS).toEqual([
      { value: 0, label: "すぐに" },
      { value: 1, label: "1分" },
      { value: 5, label: "5分" },
      { value: 15, label: "15分" },
    ]);
  });

  it("describes the toggle by what the device can do", () => {
    expect(lockToggleDescription("faceId")).toBe("Face ID・端末のパスコードで、アプリを開くときに確認します。");
    expect(lockToggleDescription("touchId")).toBe("Touch ID・端末のパスコードで、アプリを開くときに確認します。");
    expect(lockToggleDescription("none")).toBe("端末のパスコードで、アプリを開くときに確認します。");
  });

  it("lets the automatic first attempt fail silently when the person or the OS cancels", () => {
    for (const code of ["userCancel", "appCancel", "systemCancel", "notInteractive"]) {
      const event = autoAuthFailEvent(code);
      const state = reduceLock({ ...initialLockState, enabled: true, locked: true, authenticating: true }, event);
      expect(state.locked).toBe(true);
      expect(state.authenticating).toBe(false);
      expect(state.message).toBeNull();
    }
    expect(autoAuthFailEvent("authenticationFailed")).toEqual({ type: "authFail", code: "authenticationFailed" });
    expect(autoAuthFailEvent("passcodeNotSet")).toEqual({ type: "authFail", code: "passcodeNotSet" });
  });
});

describe("re-authentication before export and before turning the lock off", () => {
  it("is required only while the lock is on", () => {
    expect(needsReauth({ ...initialLockState, enabled: true })).toBe(true);
    expect(needsReauth(initialLockState)).toBe(false);
  });

  it("proceeds on success", () => {
    expect(reauthOutcome({ ok: true })).toEqual({ proceed: true, failOpen: false, notice: null });
  });

  it("does nothing on cancel, without a notice", () => {
    expect(reauthOutcome({ ok: false, code: "userCancel" })).toEqual({ proceed: false, failOpen: false, notice: null });
  });

  it("refuses with a retry notice on failure", () => {
    const outcome = reauthOutcome({ ok: false, code: "authenticationFailed" });
    expect(outcome.proceed).toBe(false);
    expect(outcome.notice).toBe("確認できませんでした。もう一度お試しください。");
  });

  it("fails open when the device has no passcode (the lock cannot work there anyway)", () => {
    for (const code of ["passcodeNotSet", "noDeviceCredential"]) {
      const outcome = reauthOutcome({ ok: false, code });
      expect(outcome).toMatchObject({ proceed: true, failOpen: true });
    }
  });

  it("never runs outside the app", () => {
    expect(reauthOutcome({ ok: false, code: "notNative" }).proceed).toBe(false);
  });
});

describe("turning the lock on", () => {
  it("turns on only after a successful check", () => {
    expect(enableOutcome({ ok: true })).toEqual({ enable: true, notice: null });
    expect(enableOutcome({ ok: false, code: "userCancel" })).toEqual({ enable: false, notice: null });
    expect(enableOutcome({ ok: false, code: "authenticationFailed" })).toEqual({
      enable: false,
      notice: "確認できませんでした。もう一度お試しください。",
    });
  });

  it("explains that a device passcode is needed", () => {
    for (const code of ["passcodeNotSet", "noDeviceCredential"]) {
      expect(enableOutcome({ ok: false, code })).toEqual({
        enable: false,
        notice: "端末のパスコードを設定すると使えます。",
      });
    }
  });

  it("keeps all settings copy free of the forbidden words", () => {
    const texts = [
      ...AUTO_LOCK_OPTIONS.map((option) => option.label),
      ...["faceId", "touchId", "none"].map(lockToggleDescription),
      LOCK_SETTINGS_NOTE,
      enableOutcome({ ok: false, code: "passcodeNotSet" }).notice,
      reauthOutcome({ ok: false, code: "authenticationFailed" }).notice,
      ...Object.values(LOCK_AUTH_REASONS),
    ];
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
  });
});
