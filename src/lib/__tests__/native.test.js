import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NIGHT_COLOR,
  SPLASH_FALLBACK_MS,
  applyStatusBar,
  armSplashFallback,
  haptic,
  hideSplash,
  isNativePlatform,
  resetNativeForTests,
} from "@/lib/native";

afterEach(() => {
  delete globalThis.window;
});

describe("isNativePlatform", () => {
  it("is false without window (server render)", () => {
    expect(isNativePlatform()).toBe(false);
  });

  it("is false in a plain browser", () => {
    globalThis.window = {};
    expect(isNativePlatform()).toBe(false);
  });

  it("is false on the Capacitor web platform", () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => false } };
    expect(isNativePlatform()).toBe(false);
  });

  it("is true inside the native iOS shell", () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } };
    expect(isNativePlatform()).toBe(true);
  });

  it("is false when the bridge check throws", () => {
    globalThis.window = {
      Capacitor: {
        isNativePlatform: () => {
          throw new Error("x");
        },
      },
    };
    expect(isNativePlatform()).toBe(false);
  });
});

describe("haptic", () => {
  function hapticsModule() {
    const calls = [];
    const Haptics = {
      impact: vi.fn(async (o) => calls.push(["impact", o.style])),
      notification: vi.fn(async (o) => calls.push(["notification", o.type])),
      selectionStart: vi.fn(async () => calls.push(["selectionStart"])),
      selectionChanged: vi.fn(async () => calls.push(["selectionChanged"])),
      selectionEnd: vi.fn(async () => calls.push(["selectionEnd"])),
    };
    const mod = {
      Haptics,
      ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" },
      NotificationType: { Success: "SUCCESS" },
    };
    return { mod, calls, load: vi.fn(async () => mod) };
  }

  it("does nothing and imports nothing on the web", async () => {
    const { load } = hapticsModule();
    await haptic("analyze", { native: false, load });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ["analyze", [["impact", "LIGHT"]]],
    ["select", [["selectionStart"], ["selectionChanged"], ["selectionEnd"]]],
    ["success", [["notification", "SUCCESS"]]],
    ["delete", [["impact", "MEDIUM"]]],
  ])("maps %s to the designed feedback on native", async (kind, expected) => {
    const { load, calls } = hapticsModule();
    await haptic(kind, { native: true, load });
    expect(calls).toEqual(expected);
  });

  it("ignores unknown kinds and swallows plugin failures", async () => {
    const { load, calls } = hapticsModule();
    await haptic("nope", { native: true, load });
    expect(calls).toEqual([]);
    await expect(
      haptic("analyze", { native: true, load: async () => { throw new Error("no plugin"); } }),
    ).resolves.toBeUndefined();
  });
});

describe("applyStatusBar", () => {
  it("is a no-op on the web", async () => {
    const load = vi.fn();
    await applyStatusBar({ native: false, load });
    expect(load).not.toHaveBeenCalled();
  });

  it("sets light text (Style.Dark) over the night color on native, tolerating failures", async () => {
    const StatusBar = {
      setStyle: vi.fn(async () => {}),
      setBackgroundColor: vi.fn(async () => {
        throw new Error("not implemented on iOS");
      }),
    };
    await expect(
      applyStatusBar({ native: true, load: async () => ({ StatusBar, Style: { Dark: "DARK" } }) }),
    ).resolves.toBeUndefined();
    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(StatusBar.setBackgroundColor).toHaveBeenCalledWith({ color: NIGHT_COLOR });
  });
});

describe("splash screen", () => {
  afterEach(() => {
    resetNativeForTests();
    vi.useRealTimers();
  });

  it("is a no-op on the web", async () => {
    const load = vi.fn();
    await hideSplash({ native: false, load });
    expect(load).not.toHaveBeenCalled();
  });

  it("hides the splash once on native, even when called repeatedly", async () => {
    const hide = vi.fn(async () => {});
    const load = async () => ({ SplashScreen: { hide } });
    await hideSplash({ native: true, load });
    await hideSplash({ native: true, load });
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("retries on the next call if hiding failed", async () => {
    const hide = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const load = async () => ({ SplashScreen: { hide } });
    await expect(hideSplash({ native: true, load })).resolves.toBeUndefined();
    await hideSplash({ native: true, load });
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it("the fallback timer hides the splash if startup never finishes", async () => {
    vi.useFakeTimers();
    const hide = vi.fn(async () => {});
    armSplashFallback({ native: true, load: async () => ({ SplashScreen: { hide } }), ms: SPLASH_FALLBACK_MS });
    await vi.advanceTimersByTimeAsync(SPLASH_FALLBACK_MS - 1);
    expect(hide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("the fallback can be cancelled and arms nothing on the web", async () => {
    vi.useFakeTimers();
    const hide = vi.fn(async () => {});
    const cancel = armSplashFallback({ native: true, load: async () => ({ SplashScreen: { hide } }), ms: 100 });
    cancel();
    armSplashFallback({ native: false, load: async () => ({ SplashScreen: { hide } }), ms: 100 })();
    await vi.advanceTimersByTimeAsync(500);
    expect(hide).not.toHaveBeenCalled();
  });
});
