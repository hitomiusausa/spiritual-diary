import { afterEach, describe, expect, it } from "vitest";
import { isNativePlatform } from "@/lib/native";

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
