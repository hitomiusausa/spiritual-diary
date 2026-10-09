import { describe, expect, it } from "vitest";
import { initialLockState, reduceLock } from "@/lib/appLock";
import { lockScreenView, unlockMethod } from "@/lib/lockUi";

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
