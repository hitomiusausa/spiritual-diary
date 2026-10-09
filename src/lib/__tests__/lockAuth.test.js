import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCK_AUTH_OPTIONS,
  authenticateForLock,
  checkLockAvailability,
  resetLockAuthForTests,
} from "@/lib/lockAuth";
import { capacitorLikeProxy, withTimeout } from "./capacitorProxy";

class FakeBiometryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function biometricModule({ check, authenticate } = {}) {
  const BiometricAuth = capacitorLikeProxy("BiometricAuth", {
    checkBiometry: vi.fn(
      check ??
        (async () => ({
          isAvailable: true,
          deviceIsSecure: true,
          biometryType: 2,
          biometryTypes: [2],
          reason: "",
          code: "",
        })),
    ),
    authenticate: vi.fn(authenticate ?? (async () => {})),
  });
  return { BiometricAuth, BiometryType: { none: 0, touchId: 1, faceId: 2 } };
}

afterEach(() => {
  resetLockAuthForTests();
  delete globalThis.window;
});

describe("checkLockAvailability", () => {
  it("reports unavailable on the web without importing the plugin", async () => {
    const load = vi.fn();
    await expect(checkLockAvailability({ native: false, load })).resolves.toEqual({
      available: false,
      biometryAvailable: false,
      deviceIsSecure: false,
      biometryType: "none",
      reason: "notNative",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("reports Face ID on a secured device", async () => {
    const mod = biometricModule();
    await expect(checkLockAvailability({ native: true, load: async () => mod })).resolves.toEqual({
      available: true,
      biometryAvailable: true,
      deviceIsSecure: true,
      biometryType: "faceId",
      reason: null,
    });
  });

  it("is available with only a passcode (no biometry enrolled)", async () => {
    const mod = biometricModule({
      check: async () => ({ isAvailable: false, deviceIsSecure: true, biometryType: 0, code: "biometryNotEnrolled" }),
    });
    await expect(checkLockAvailability({ native: true, load: async () => mod })).resolves.toEqual({
      available: true,
      biometryAvailable: false,
      deviceIsSecure: true,
      biometryType: "none",
      reason: null,
    });
  });

  it("maps Touch ID and is unavailable without any device security", async () => {
    const touch = biometricModule({
      check: async () => ({ isAvailable: true, deviceIsSecure: true, biometryType: 1 }),
    });
    expect((await checkLockAvailability({ native: true, load: async () => touch })).biometryType).toBe("touchId");
    const insecure = biometricModule({
      check: async () => ({ isAvailable: false, deviceIsSecure: false, biometryType: 0, code: "passcodeNotSet" }),
    });
    expect((await checkLockAvailability({ native: true, load: async () => insecure })).available).toBe(false);
  });

  it("reports unavailable when the plugin fails to load or throws, with the reason", async () => {
    const failingLoad = async () => {
      throw new Error("missing");
    };
    expect(await checkLockAvailability({ native: true, load: failingLoad })).toMatchObject({
      available: false,
      reason: "pluginUnavailable",
    });
    const throwing = biometricModule({
      check: async () => {
        throw new Error("boom");
      },
    });
    expect(await checkLockAvailability({ native: true, load: async () => throwing })).toMatchObject({
      available: false,
      reason: "pluginUnavailable",
    });
  });

  it("names the missing device passcode as the reason", async () => {
    const insecure = biometricModule({
      check: async () => ({ isAvailable: false, deviceIsSecure: false, biometryType: 0 }),
    });
    expect(await checkLockAvailability({ native: true, load: async () => insecure })).toMatchObject({
      available: false,
      reason: "passcodeNotSet",
    });
    expect((await checkLockAvailability({ native: true, load: async () => biometricModule() })).reason).toBeNull();
  });
});

describe("authenticateForLock", () => {
  it("does nothing on the web and never reports success there", async () => {
    const load = vi.fn();
    await expect(authenticateForLock({ native: false, load })).resolves.toEqual({ ok: false, code: "notNative" });
    expect(load).not.toHaveBeenCalled();
  });

  it("asks the OS with the device-passcode fallback (Ruling 3/4)", async () => {
    const mod = biometricModule();
    await expect(authenticateForLock({ native: true, load: async () => mod })).resolves.toEqual({ ok: true });
    expect(mod.BiometricAuth.authenticate).toHaveBeenCalledWith({
      ...LOCK_AUTH_OPTIONS,
      allowDeviceCredential: true,
      iosFallbackTitle: "パスコードを使う",
      cancelTitle: "あとで",
    });
    expect(LOCK_AUTH_OPTIONS.reason).toBeTruthy();
  });

  it("uses a custom reason when given", async () => {
    const mod = biometricModule();
    await authenticateForLock({ reason: "書き出しの前に確認します", native: true, load: async () => mod });
    expect(mod.BiometricAuth.authenticate.mock.calls[0][0].reason).toBe("書き出しの前に確認します");
  });

  it.each(["userCancel", "biometryLockout", "passcodeNotSet", "authenticationFailed", "noDeviceCredential"])(
    "passes the BiometryError code %s through",
    async (code) => {
      const mod = biometricModule({
        authenticate: async () => {
          throw new FakeBiometryError("x", code);
        },
      });
      await expect(authenticateForLock({ native: true, load: async () => mod })).resolves.toEqual({ ok: false, code });
    },
  );

  it("reports 'unknown' for unexpected errors", async () => {
    const plain = biometricModule({
      authenticate: async () => {
        throw new Error("plain");
      },
    });
    await expect(authenticateForLock({ native: true, load: async () => plain })).resolves.toEqual({
      ok: false,
      code: "unknown",
    });
  });

  // 監査 P1-3: プラグインが読み込めない・ネイティブ側に登録されていない（cap sync 漏れ）は、unknown と分ける。
  it("reports 'pluginUnavailable' when the plugin cannot load or is not implemented natively", async () => {
    for (const nativeCode of ["UNIMPLEMENTED", "UNAVAILABLE"]) {
      const missing = biometricModule({
        authenticate: async () => {
          throw new FakeBiometryError("x", nativeCode);
        },
      });
      resetLockAuthForTests();
      await expect(authenticateForLock({ native: true, load: async () => missing })).resolves.toEqual({
        ok: false,
        code: "pluginUnavailable",
      });
    }
    resetLockAuthForTests();
    await expect(
      authenticateForLock({
        native: true,
        load: async () => {
          throw new Error("missing");
        },
      }),
    ).resolves.toEqual({ ok: false, code: "pluginUnavailable" });
  });

  it("shares one OS prompt between overlapping calls", async () => {
    let finish;
    const mod = biometricModule({ authenticate: () => new Promise((resolve) => (finish = resolve)) });
    const load = async () => mod;
    const first = authenticateForLock({ native: true, load });
    const second = authenticateForLock({ native: true, load });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(mod.BiometricAuth.authenticate).toHaveBeenCalledTimes(1);
    // 終わった後の呼び出しは、新しく OS に求める。
    const third = authenticateForLock({ native: true, load });
    await vi.waitFor(() => expect(mod.BiometricAuth.authenticate).toHaveBeenCalledTimes(2));
    finish();
    await expect(third).resolves.toEqual({ ok: true });
  });

  it("does not log the reason or error details", async () => {
    const spies = ["log", "warn", "error"].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const mod = biometricModule({
      authenticate: async () => {
        throw new FakeBiometryError("secret detail", "authenticationFailed");
      },
    });
    await authenticateForLock({ reason: "secret reason", native: true, load: async () => mod });
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(call.join(" ")).not.toMatch(/secret/);
      spy.mockRestore();
    }
  });
});

describe("default loader (real module path, Capacitor proxy)", () => {
  it("loads @aparajita/capacitor-biometric-auth without hanging on the proxy", async () => {
    vi.resetModules();
    const mod = biometricModule();
    vi.doMock("@aparajita/capacitor-biometric-auth", () => mod);
    const fresh = await import("@/lib/lockAuth");
    expect(await withTimeout(fresh.checkLockAvailability({ native: true }))).toMatchObject({ available: true });
    expect(await withTimeout(fresh.authenticateForLock({ native: true }))).toEqual({ ok: true });
    vi.doUnmock("@aparajita/capacitor-biometric-auth");
  });
});
