import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStorage, getStorage, initStorage, resetStorageForTests } from "@/lib/storage";

afterEach(() => {
  resetStorageForTests();
  delete globalThis.window;
});

describe("createMemoryStorage", () => {
  it("behaves like localStorage for get/set/remove", () => {
    const s = createMemoryStorage();
    expect(s.getItem("a")).toBeNull();
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
    s.setItem("a", 2);
    expect(s.getItem("a")).toBe("2");
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
  });

  it("can be seeded with initial entries", () => {
    const s = createMemoryStorage({ k: "v" });
    expect(s.getItem("k")).toBe("v");
  });
});

describe("getStorage / initStorage on the web", () => {
  it("falls back to window.localStorage when called before init", () => {
    const local = createMemoryStorage();
    globalThis.window = { localStorage: local };
    expect(getStorage()).toBe(local);
  });

  it("initStorage resolves immediately and keeps returning localStorage", async () => {
    const local = createMemoryStorage();
    globalThis.window = { localStorage: local };
    await expect(initStorage()).resolves.toBeUndefined();
    expect(getStorage()).toBe(local);
  });

  it("returns a memory shim when localStorage access throws", async () => {
    globalThis.window = {
      get localStorage() {
        throw new Error("blocked");
      },
    };
    await initStorage();
    const s = getStorage();
    s.setItem("x", "1");
    expect(s.getItem("x")).toBe("1");
    expect(getStorage()).toBe(s);
  });

  it("returns a memory shim without window (server render)", () => {
    const s = getStorage();
    s.setItem("x", "1");
    expect(s.getItem("x")).toBe("1");
  });
});
