import { describe, expect, it, vi } from "vitest";
import { LOCK_STORAGE_KEY } from "@/lib/appLock";
import { commitBoot, prepareLockBoot } from "@/lib/lockBoot";
import { createMemoryStorage } from "@/lib/storage";

const FACE = { available: true, biometryAvailable: true, deviceIsSecure: true, biometryType: "faceId", reason: null };

function storageWith(settings) {
  const storage = createMemoryStorage();
  if (settings) storage.setItem(LOCK_STORAGE_KEY, JSON.stringify({ version: 1, ...settings }));
  return storage;
}

describe("prepareLockBoot", () => {
  it("does nothing on the web", async () => {
    const checkAvailability = vi.fn();
    await expect(prepareLockBoot({ native: false, storage: storageWith({ enabled: true }), checkAvailability })).resolves.toBeNull();
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("reads the settings and, when the lock is on, learns the device's method before the first paint (P2-7)", async () => {
    const checkAvailability = vi.fn(async () => FACE);
    const plan = await prepareLockBoot({ native: true, storage: storageWith({ enabled: true, autoLockMinutes: 1 }), checkAvailability });
    expect(plan.settings).toMatchObject({ enabled: true, autoLockMinutes: 1 });
    expect(plan.availability).toEqual(FACE);
  });

  it("does not ask the device when the lock is off", async () => {
    const checkAvailability = vi.fn(async () => FACE);
    const plan = await prepareLockBoot({ native: true, storage: storageWith(null), checkAvailability });
    expect(plan).toMatchObject({ settings: { enabled: false }, availability: null });
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("gives up waiting for the device after the timeout (the lock still starts locked)", async () => {
    vi.useFakeTimers();
    try {
      const checkAvailability = () => new Promise(() => {});
      const pending = prepareLockBoot({ native: true, storage: storageWith({ enabled: true }), checkAvailability, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toMatchObject({ settings: { enabled: true }, availability: null });
    } finally {
      vi.useRealTimers();
    }
  });
});

// 設計 Ruling 8: ロックの判定は画面（step）を決める前に、同じ同期処理の中で反映する（同じ描画に乗る）。
describe("commitBoot (boot order)", () => {
  function recorder() {
    const calls = [];
    const fn = (name) => (value) => calls.push([name, value]);
    return {
      calls,
      apply: {
        setLockNative: fn("setLockNative"),
        setLockSettings: fn("setLockSettings"),
        setLockAvailability: fn("setLockAvailability"),
        dispatchLock: fn("dispatchLock"),
        setStep: fn("setStep"),
        setProfileHydrated: fn("setProfileHydrated"),
      },
    };
  }

  it("applies the lock before the step, synchronously, and hydrates last", () => {
    const { calls, apply } = recorder();
    const settings = { enabled: true, autoLockMinutes: 5 };
    const result = commitBoot({ lock: { settings, availability: FACE }, step: "input", apply });
    expect(result).toBeUndefined(); // not a promise: nothing can render in between
    expect(calls.map(([name]) => name)).toEqual([
      "setLockNative",
      "setLockSettings",
      "setLockAvailability",
      "dispatchLock",
      "dispatchLock",
      "setStep",
      "setProfileHydrated",
    ]);
    expect(calls[3][1]).toEqual({ type: "boot", settings });
    expect(calls[4][1]).toEqual({ type: "availability", availability: FACE });
    expect(calls.at(-2)).toEqual(["setStep", "input"]);
  });

  it("skips the availability when it is not known yet", () => {
    const { calls, apply } = recorder();
    commitBoot({ lock: { settings: { enabled: true }, availability: null }, step: "input", apply });
    expect(calls.map(([name]) => name)).toEqual(["setLockNative", "setLockSettings", "dispatchLock", "setStep", "setProfileHydrated"]);
  });

  it("touches no lock state on the web", () => {
    const { calls, apply } = recorder();
    commitBoot({ lock: null, step: "profile", apply });
    expect(calls).toEqual([
      ["setStep", "profile"],
      ["setProfileHydrated", true],
    ]);
  });
});
