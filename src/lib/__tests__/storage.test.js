import { afterEach, describe, expect, it } from "vitest";
import {
  MIGRATION_MARKER_KEY,
  NATIVE_STORAGE_KEYS,
  createMemoryStorage,
  flushStorageWrites,
  getStorage,
  initStorage,
  resetStorageForTests,
} from "@/lib/storage";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "@/lib/history";
import { CHAT_HISTORY_STORAGE_KEY } from "@/lib/chatHistory";
import { ANALYSIS_CACHE_STORAGE_KEY } from "@/lib/analysisCache";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

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

// ---- T10: iOS (Capacitor) ネイティブ保存（Ruling 5） ----

function createPreferencesMock(initial = {}, { failSetFor = [], delayMs = 0 } = {}) {
  const store = new Map(Object.entries(initial));
  const log = [];
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  return {
    store,
    log,
    async get({ key }) {
      log.push(["get", key]);
      return { value: store.has(key) ? store.get(key) : null };
    },
    async set({ key, value }) {
      log.push(["set", key, value]);
      await wait();
      if (failSetFor.includes(key)) throw new Error(`set failed: ${key}`);
      store.set(key, value);
    },
    async remove({ key }) {
      log.push(["remove", key]);
      await wait();
      store.delete(key);
    },
    async keys() {
      log.push(["keys"]);
      return { keys: [...store.keys()] };
    },
  };
}

function spyStorage(initial = {}) {
  const s = createMemoryStorage(initial);
  const writes = [];
  return {
    writes,
    getItem: (k) => s.getItem(k),
    setItem: (k, v) => {
      writes.push(["set", k]);
      s.setItem(k, v);
    },
    removeItem: (k) => {
      writes.push(["remove", k]);
      s.removeItem(k);
    },
  };
}

function nativeWindow(localStorage) {
  globalThis.window = { Capacitor: { isNativePlatform: () => true }, localStorage };
}

const ALL_KEYS = {
  [HISTORY_STORAGE_KEY]: '[{"id":"h1"}]',
  [PROFILE_STORAGE_KEY]: '{"birthDate":"1990-05-15"}',
  [CHAT_HISTORY_STORAGE_KEY]: '[{"role":"user","content":"a"}]',
  [ANALYSIS_CACHE_STORAGE_KEY]: '{"k":{}}',
  [CONSENT_STORAGE_KEY]: '{"version":1,"acceptedAt":"2026-10-09T00:00:00.000Z"}',
};

describe("native storage keys", () => {
  it("persists every key the app writes, including the AI consent (ledger L-2)", () => {
    expect([...NATIVE_STORAGE_KEYS].sort()).toEqual(Object.keys(ALL_KEYS).sort());
    expect(NATIVE_STORAGE_KEYS).toContain("spiritual-diary.consent.v1");
    expect(NATIVE_STORAGE_KEYS).not.toContain(MIGRATION_MARKER_KEY);
  });
});

describe("initStorage on native (Preferences)", () => {
  it("loads all known keys from Preferences into memory for synchronous reads", async () => {
    const preferences = createPreferencesMock({ ...ALL_KEYS, [MIGRATION_MARKER_KEY]: "{}" });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    const s = getStorage();
    for (const [key, value] of Object.entries(ALL_KEYS)) expect(s.getItem(key)).toBe(value);
    expect(s.getItem("missing")).toBeNull();
  });

  it("also loads keys that exist in Preferences but are not in the known list", async () => {
    const preferences = createPreferencesMock({ "spiritual-diary.future.v1": "x", [MIGRATION_MARKER_KEY]: "{}" });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    expect(getStorage().getItem("spiritual-diary.future.v1")).toBe("x");
  });

  it("writes through on setItem/removeItem while reads stay synchronous", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}", [CONSENT_STORAGE_KEY]: "c" });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    const s = getStorage();
    s.setItem(PROFILE_STORAGE_KEY, "p1");
    expect(s.getItem(PROFILE_STORAGE_KEY)).toBe("p1");
    s.removeItem(CONSENT_STORAGE_KEY);
    expect(s.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    await flushStorageWrites();
    expect(preferences.store.get(PROFILE_STORAGE_KEY)).toBe("p1");
    expect(preferences.store.has(CONSENT_STORAGE_KEY)).toBe(false);
  });

  it("stores values as strings like localStorage does", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}" });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    getStorage().setItem("n", 5);
    expect(getStorage().getItem("n")).toBe("5");
    await flushStorageWrites();
    expect(preferences.store.get("n")).toBe("5");
  });

  it("serializes writes per key so the last value wins", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}" }, { delayMs: 5 });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    const s = getStorage();
    s.setItem(HISTORY_STORAGE_KEY, "a");
    s.setItem(HISTORY_STORAGE_KEY, "b");
    s.removeItem(HISTORY_STORAGE_KEY);
    s.setItem(HISTORY_STORAGE_KEY, "c");
    await flushStorageWrites();
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("c");
    const ops = preferences.log.filter(([op, key]) => key === HISTORY_STORAGE_KEY && op !== "get");
    expect(ops.map(([op, , v]) => (op === "set" ? v : "remove"))).toEqual(["a", "b", "remove", "c"]);
  });

  it("keeps the in-memory value and carries on when a write-through fails", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}" }, { failSetFor: ["x"] });
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    getStorage().setItem("x", "1");
    getStorage().setItem("y", "2");
    await expect(flushStorageWrites()).resolves.toBeUndefined();
    expect(getStorage().getItem("x")).toBe("1");
    expect(preferences.store.get("y")).toBe("2");
  });

  it("returns the same promise for concurrent initStorage calls (loads once)", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}" });
    nativeWindow(spyStorage());
    const a = initStorage({ preferences });
    const b = initStorage({ preferences });
    expect(a).toBe(b);
    await a;
    expect(preferences.log.filter(([op]) => op === "keys")).toHaveLength(1);
  });
});

describe("one-time migration from WKWebView localStorage", () => {
  it("copies every known key into Preferences, marks it, and never deletes the source", async () => {
    const local = spyStorage(ALL_KEYS);
    const preferences = createPreferencesMock();
    nativeWindow(local);
    await initStorage({ preferences, now: new Date("2026-10-09T00:00:00.000Z") });

    for (const [key, value] of Object.entries(ALL_KEYS)) {
      expect(preferences.store.get(key)).toBe(value);
      expect(getStorage().getItem(key)).toBe(value);
      expect(local.getItem(key)).toBe(value);
    }
    expect(local.writes).toEqual([]);
    const marker = JSON.parse(preferences.store.get(MIGRATION_MARKER_KEY));
    expect(marker).toMatchObject({ version: 1, migratedAt: "2026-10-09T00:00:00.000Z" });
    expect([...marker.copiedKeys].sort()).toEqual(Object.keys(ALL_KEYS).sort());
  });

  it("is idempotent: once marked, localStorage is not read again", async () => {
    const local = spyStorage({ [HISTORY_STORAGE_KEY]: "old" });
    const preferences = createPreferencesMock();
    nativeWindow(local);
    await initStorage({ preferences });
    getStorage().setItem(HISTORY_STORAGE_KEY, "new");
    await flushStorageWrites();

    // 再起動: localStorage が後から変わっていても読まない
    resetStorageForTests();
    local.setItem(PROFILE_STORAGE_KEY, "stale-profile");
    nativeWindow(local);
    const setsBefore = preferences.log.filter(([op]) => op === "set").length;
    await initStorage({ preferences });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("new");
    expect(getStorage().getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(preferences.log.filter(([op]) => op === "set").length).toBe(setsBefore);
  });

  it("never overwrites data already in Preferences with older localStorage data", async () => {
    const local = spyStorage({ [HISTORY_STORAGE_KEY]: "from-local", [PROFILE_STORAGE_KEY]: "local-profile" });
    const preferences = createPreferencesMock({ [HISTORY_STORAGE_KEY]: "from-prefs" });
    nativeWindow(local);
    await initStorage({ preferences });
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("from-prefs");
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("from-prefs");
    expect(preferences.store.get(PROFILE_STORAGE_KEY)).toBe("local-profile");
    expect(JSON.parse(preferences.store.get(MIGRATION_MARKER_KEY)).copiedKeys).toEqual([PROFILE_STORAGE_KEY]);
  });

  it("starts empty and still marks when both Preferences and localStorage are empty", async () => {
    const preferences = createPreferencesMock();
    nativeWindow(spyStorage());
    await initStorage({ preferences });
    for (const key of NATIVE_STORAGE_KEYS) expect(getStorage().getItem(key)).toBeNull();
    expect(JSON.parse(preferences.store.get(MIGRATION_MARKER_KEY)).copiedKeys).toEqual([]);
  });

  it("does not migrate keys outside the known list", async () => {
    const preferences = createPreferencesMock();
    nativeWindow(spyStorage({ "some-other-site-key": "x" }));
    await initStorage({ preferences });
    expect(preferences.store.has("some-other-site-key")).toBe(false);
  });

  it("does not mark when a copy fails, keeps the data visible, and retries on the next launch", async () => {
    const local = spyStorage(ALL_KEYS);
    const failing = createPreferencesMock({}, { failSetFor: [HISTORY_STORAGE_KEY] });
    nativeWindow(local);
    await initStorage({ preferences: failing });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe(ALL_KEYS[HISTORY_STORAGE_KEY]);
    expect(failing.store.has(MIGRATION_MARKER_KEY)).toBe(false);
    expect(local.writes).toEqual([]);

    resetStorageForTests();
    const healthy = createPreferencesMock(Object.fromEntries(failing.store));
    nativeWindow(local);
    await initStorage({ preferences: healthy });
    expect(healthy.store.get(HISTORY_STORAGE_KEY)).toBe(ALL_KEYS[HISTORY_STORAGE_KEY]);
    expect(healthy.store.has(MIGRATION_MARKER_KEY)).toBe(true);
  });

  it("survives a localStorage that throws on access", async () => {
    const preferences = createPreferencesMock();
    globalThis.window = {
      Capacitor: { isNativePlatform: () => true },
      get localStorage() {
        throw new Error("blocked");
      },
    };
    await initStorage({ preferences });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(preferences.store.has(MIGRATION_MARKER_KEY)).toBe(true);
  });
});

describe("writes before initStorage finishes (audit P2-5)", () => {
  it("are not lost on native: they are replayed into Preferences and win over migrated data", async () => {
    const local = spyStorage({ [PROFILE_STORAGE_KEY]: "old-profile" });
    const preferences = createPreferencesMock();
    nativeWindow(local);
    const early = getStorage();
    early.setItem(PROFILE_STORAGE_KEY, "early-profile");
    early.setItem(CONSENT_STORAGE_KEY, "early-consent");
    expect(early.getItem(PROFILE_STORAGE_KEY)).toBe("early-profile");
    await initStorage({ preferences });
    await flushStorageWrites();
    expect(getStorage().getItem(PROFILE_STORAGE_KEY)).toBe("early-profile");
    expect(preferences.store.get(PROFILE_STORAGE_KEY)).toBe("early-profile");
    expect(preferences.store.get(CONSENT_STORAGE_KEY)).toBe("early-consent");
    expect(local.getItem(PROFILE_STORAGE_KEY)).toBe("old-profile");
  });

  it("replays an early removeItem too", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}", [CONSENT_STORAGE_KEY]: "c" });
    nativeWindow(spyStorage());
    getStorage().removeItem(CONSENT_STORAGE_KEY);
    await initStorage({ preferences });
    await flushStorageWrites();
    expect(getStorage().getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(preferences.store.has(CONSENT_STORAGE_KEY)).toBe(false);
  });

  it("server render gets a fresh, uncached memory store each time", () => {
    const a = getStorage();
    a.setItem("x", "1");
    const b = getStorage();
    expect(b).not.toBe(a);
    expect(b.getItem("x")).toBeNull();
    const local = createMemoryStorage();
    globalThis.window = { localStorage: local };
    expect(getStorage()).toBe(local);
  });
});

describe("initStorage when Preferences is unavailable on native", () => {
  it("falls back to localStorage without rejecting and keeps early writes", async () => {
    const local = spyStorage({ [HISTORY_STORAGE_KEY]: "h" });
    nativeWindow(local);
    getStorage().setItem(CONSENT_STORAGE_KEY, "c");
    const preferences = {
      keys: async () => {
        throw new Error("plugin missing");
      },
    };
    await expect(initStorage({ preferences })).resolves.toBeUndefined();
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("h");
    expect(getStorage().getItem(CONSENT_STORAGE_KEY)).toBe("c");
  });
});
