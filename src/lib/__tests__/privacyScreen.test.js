import { describe, expect, it, vi } from "vitest";
import { PRIVACY_SCREEN_CONFIG, setPrivacyScreen } from "@/lib/privacyScreen";
import { capacitorLikeProxy, withTimeout } from "./capacitorProxy";

function privacyModule({ enable, disable } = {}) {
  const PrivacyScreen = capacitorLikeProxy("PrivacyScreen", {
    enable: vi.fn(enable ?? (async () => ({ success: true }))),
    disable: vi.fn(disable ?? (async () => ({ success: true }))),
  });
  return { PrivacyScreen };
}

describe("setPrivacyScreen", () => {
  it("is a no-op on the web", async () => {
    const load = vi.fn();
    await expect(setPrivacyScreen(true, { native: false, load })).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("enables the dark blur on native (Ruling 5)", async () => {
    const mod = privacyModule();
    await expect(setPrivacyScreen(true, { native: true, load: async () => mod })).resolves.toBe(true);
    expect(PRIVACY_SCREEN_CONFIG).toEqual({ ios: { blurEffect: "dark" } });
    expect(mod.PrivacyScreen.enable).toHaveBeenCalledWith({ ios: { blurEffect: "dark" } });
    expect(mod.PrivacyScreen.disable).not.toHaveBeenCalled();
  });

  it("disables it on native", async () => {
    const mod = privacyModule();
    await expect(setPrivacyScreen(false, { native: true, load: async () => mod })).resolves.toBe(true);
    expect(mod.PrivacyScreen.disable).toHaveBeenCalledTimes(1);
    expect(mod.PrivacyScreen.enable).not.toHaveBeenCalled();
  });

  it("reports failure without throwing", async () => {
    const failing = privacyModule({
      enable: async () => {
        throw new Error("x");
      },
    });
    await expect(setPrivacyScreen(true, { native: true, load: async () => failing })).resolves.toBe(false);
    const unsuccessful = privacyModule({ disable: async () => ({ success: false }) });
    await expect(setPrivacyScreen(false, { native: true, load: async () => unsuccessful })).resolves.toBe(false);
    await expect(
      setPrivacyScreen(true, {
        native: true,
        load: async () => {
          throw new Error("missing");
        },
      }),
    ).resolves.toBe(false);
  });

  it("loads @capacitor/privacy-screen by default without hanging on the proxy", async () => {
    vi.resetModules();
    const mod = privacyModule();
    vi.doMock("@capacitor/privacy-screen", () => mod);
    const fresh = await import("@/lib/privacyScreen");
    expect(await withTimeout(fresh.setPrivacyScreen(true, { native: true }))).toBe(true);
    vi.doUnmock("@capacitor/privacy-screen");
  });
});
