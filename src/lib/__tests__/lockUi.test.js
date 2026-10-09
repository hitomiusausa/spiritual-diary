import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(unlockMethod(undefined)).toEqual({ kind: "pending", label: "端末の認証でひらく" });
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
      message: null,
      detail: null,
      note: null,
    });
  });

  // 監査 P2-7: 端末の対応が分かる前に「パスコードでひらく」と出して「Face IDでひらく」へ変わらないように。
  it("uses a neutral label until the device's method is known", () => {
    for (const unknown of [null, undefined]) {
      expect(lockScreenView(locked, unknown)).toMatchObject({ primaryLabel: "端末の認証でひらく", method: "pending" });
    }
    expect(lockScreenView(locked, "none")).toMatchObject({ primaryLabel: "パスコードでひらく", method: "passcode" });
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

  // 監査 P2-3: 2 つ目のボタン（端末のパスコードでひらく）は同じ OS の画面を呼び直すだけだった。
  // ボタンは 1 つにして正直な名前にし、パスコードは OS が出すことを小さく添える。
  it("shows one honest retry button and a note about the passcode after a failed attempt", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "authenticationFailed" }), "faceId");
    expect(view).toEqual({
      mode: "failed",
      busy: false,
      primaryLabel: "もう一度ためす",
      method: "faceId",
      message: "認証できませんでした。",
      detail: "もう一度お試しください。",
      note: "Face ID がうまくいかないときは、iOS が端末のパスコードの入力をたずねます。",
    });
    expect(view).not.toHaveProperty("showPasscode");
  });

  it("names Touch ID in the note on Touch ID devices", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "authenticationFailed" }), "touchId");
    expect(view.note).toBe("Touch ID がうまくいかないときは、iOS が端末のパスコードの入力をたずねます。");
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

  it("adds no passcode note when the passcode is already the method", () => {
    const view = lockScreenView(reduceLock(locked, { type: "authFail", code: "authenticationFailed" }), "none");
    expect(view.note).toBeNull();
  });

  it("never uses the forbidden words", () => {
    for (const code of ["authenticationFailed", "biometryLockout", "unknown", "passcodeNotSet"]) {
      const view = lockScreenView(reduceLock(locked, { type: "authFail", code }), "faceId");
      expect(`${view.primaryLabel}${view.message ?? ""}${view.detail ?? ""}${view.note ?? ""}`).not.toMatch(FORBIDDEN);
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

  it("fails open on re-auth when the OS authentication cannot be reached, and cannot be turned on then", () => {
    expect(reauthOutcome({ ok: false, code: "pluginUnavailable" })).toEqual({ proceed: true, failOpen: true, notice: null });
    expect(enableOutcome({ ok: false, code: "pluginUnavailable" })).toEqual({
      enable: false,
      notice: "いまはこの端末でアプリのロックを使えません。",
    });
  });

  it("keeps all settings copy free of the forbidden words", () => {
    const texts = [
      ...AUTO_LOCK_OPTIONS.map((option) => option.label),
      ...["faceId", "touchId", "none"].map(lockToggleDescription),
      LOCK_SETTINGS_NOTE,
      enableOutcome({ ok: false, code: "passcodeNotSet" }).notice,
      enableOutcome({ ok: false, code: "pluginUnavailable" }).notice,
      reauthOutcome({ ok: false, code: "authenticationFailed" }).notice,
      ...Object.values(LOCK_AUTH_REASONS),
    ];
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
  });
});

// 監査 P2-6: 文言の規律（Ruling 16）を、ロックについて書いたポリシーと FAQ、ロック画面のコンポーネントにも広げる。
// コメント（「暗号化ではない」と書いた設計メモ）は対象外にし、画面に出る文字だけを見る。
describe("wording rule on the pages that describe the lock", () => {
  const stripComments = (source) =>
    source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it.each(["src/app/privacy/page.js", "src/app/support/page.js", "src/components/LockScreen.jsx", "src/components/SpiritualDiary.jsx"])(
    "%s does not show the forbidden words",
    (file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(stripComments(source)).not.toMatch(FORBIDDEN);
    },
  );

  it("the policy and the FAQ actually talk about the lock (so the check is meaningful)", () => {
    for (const file of ["src/app/privacy/page.js", "src/app/support/page.js"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toContain("アプリのロック");
    }
  });
});

