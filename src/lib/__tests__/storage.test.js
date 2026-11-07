import { afterEach, describe, expect, it } from "vitest";
import {
  MIGRATION_MARKER_KEY,
  NATIVE_STORAGE_KEYS,
  createMemoryStorage,
  flushStorageWrites,
  getStorage,
  initStorage,
  resetStorageForTests,
  getStorageStatus,
  retryStorageWrites,
  subscribeStorageStatus,
} from "@/lib/storage";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "@/lib/history";
import { CHAT_HISTORY_STORAGE_KEY } from "@/lib/chatHistory";
import { ANALYSIS_CACHE_STORAGE_KEY } from "@/lib/analysisCache";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";
import { LOCK_STORAGE_KEY } from "@/lib/appLock";

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
    getStorage().setItem("x", "1");
    expect(local.getItem("x")).toBe("1");
  });

  it("initStorage resolves immediately and keeps returning localStorage", async () => {
    const local = createMemoryStorage();
    globalThis.window = { localStorage: local };
    await expect(initStorage()).resolves.toBeUndefined();
    getStorage().setItem("x", "1");
    expect(local.getItem("x")).toBe("1");
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
  [LOCK_STORAGE_KEY]: '{"version":1,"enabled":true,"autoLockMinutes":5,"hideInSwitcher":true,"enabledAt":null}',
};

describe("native storage keys", () => {
  it("persists every key the app writes, including the AI consent (ledger L-2) and the app lock", () => {
    expect([...NATIVE_STORAGE_KEYS].sort()).toEqual(Object.keys(ALL_KEYS).sort());
    expect(NATIVE_STORAGE_KEYS).toContain("spiritual-diary.consent.v1");
    expect(NATIVE_STORAGE_KEYS).toContain("spiritual-diary.lock.v1");
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
    await expect(flushStorageWrites()).rejects.toMatchObject({ code: "storage_write_failed", failedKeys: ["x"] });
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

  it("stops hydration when a copy fails, preserves originals, and retries", async () => {
    const local = spyStorage(ALL_KEYS);
    const failing = createPreferencesMock({}, { failSetFor: [HISTORY_STORAGE_KEY] });
    nativeWindow(local);
    await expect(initStorage({ preferences: failing })).rejects.toMatchObject({ code: "storage_init_failed" });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBeNull();
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
    getStorage().setItem("x", "1");
    expect(local.getItem("x")).toBe("1");
  });
});

describe("initStorage when Preferences is unavailable on native", () => {
  it("rejects without reviving old localStorage and keeps early writes pending", async () => {
    const local = spyStorage({ [HISTORY_STORAGE_KEY]: "h" });
    nativeWindow(local);
    getStorage().setItem(CONSENT_STORAGE_KEY, "c");
    const preferences = {
      keys: async () => {
        throw new Error("plugin missing");
      },
    };
    await expect(initStorage({ preferences })).rejects.toMatchObject({ code: "storage_init_failed" });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(getStorage().getItem(CONSENT_STORAGE_KEY)).toBe("c");
  });
});

describe("B-01 durable completion and latest-intent retry", () => {
  it("notifies a write failure, retries the latest intent, and survives restart", async () => {
    const failSetFor = [HISTORY_STORAGE_KEY];
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}", [HISTORY_STORAGE_KEY]: "old" }, { failSetFor });
    nativeWindow(spyStorage());
    const changes = [];
    const unsubscribe = subscribeStorageStatus((state) => changes.push(state));
    await initStorage({ preferences });
    const stable = getStorageStatus();
    expect(getStorageStatus()).toBe(stable);
    getStorage().setItem(HISTORY_STORAGE_KEY, "newer");
    await expect(flushStorageWrites()).rejects.toMatchObject({ failedKeys: [HISTORY_STORAGE_KEY] });
    expect(getStorageStatus()).toMatchObject({ phase: "ready", mode: "native", failedKeys: [HISTORY_STORAGE_KEY] });
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("old");
    getStorage().setItem(HISTORY_STORAGE_KEY, "latest");
    await expect(flushStorageWrites()).rejects.toMatchObject({ code: "storage_write_failed" });
    failSetFor.splice(0);
    await retryStorageWrites();
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("latest");
    expect(getStorageStatus().failedKeys).toEqual([]);
    expect(changes.some((state) => state.pendingKeys.includes(HISTORY_STORAGE_KEY))).toBe(true);
    expect(JSON.stringify(changes)).not.toContain("newer");
    unsubscribe();
    resetStorageForTests();
    await initStorage({ preferences, native: true });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("latest");
  });

  it("does not poison the chain or retry an obsolete failed value", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}" });
    const original = preferences.set;
    preferences.set = async (options) => {
      if (options.value === "bad") throw new Error("sensitive upstream detail");
      return original(options);
    };
    await initStorage({ native: true, preferences });
    getStorage().setItem("x", "bad");
    getStorage().setItem("x", "good");
    await flushStorageWrites();
    await retryStorageWrites();
    expect(preferences.store.get("x")).toBe("good");
    expect(getStorageStatus().failedKeys).toEqual([]);
  });

  it("exposes remove failure and lets a key-scoped flush ignore an optional cache failure", async () => {
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}", [HISTORY_STORAGE_KEY]: "old" });
    let fail = true;
    preferences.remove = async ({ key }) => { if (fail) throw new Error("remove failed"); preferences.store.delete(key); };
    await initStorage({ native: true, preferences });
    getStorage().removeItem(HISTORY_STORAGE_KEY);
    await expect(flushStorageWrites()).rejects.toMatchObject({ failedKeys: [HISTORY_STORAGE_KEY] });
    await expect(flushStorageWrites({ keys: [CONSENT_STORAGE_KEY] })).resolves.toBeUndefined();
    expect(preferences.store.has(HISTORY_STORAGE_KEY)).toBe(true);
    fail = false;
    await retryStorageWrites();
    expect(preferences.store.has(HISTORY_STORAGE_KEY)).toBe(false);
  });

  it("reports Web quota failure without exposing the raw exception and retries", async () => {
    const local = createMemoryStorage();
    const set = local.setItem;
    let fail = true;
    local.setItem = (key, value) => { if (fail) throw new Error("private diary detail"); set(key, value); };
    globalThis.window = { localStorage: local };
    await initStorage();
    expect(() => getStorage().setItem("x", "latest")).toThrow("device storage write failed");
    await expect(flushStorageWrites()).rejects.toMatchObject({ failedKeys: ["x"] });
    fail = false;
    await retryStorageWrites();
    expect(local.getItem("x")).toBe("latest");
    expect(getStorageStatus().failedKeys).toEqual([]);
  });

  it("never claims the Web memory fallback is durable, even on retry while blocked", async () => {
    const local = createMemoryStorage();
    let blocked = true;
    globalThis.window = { get localStorage() { if (blocked) throw new Error(); return local; } };
    await initStorage();
    getStorage().setItem("x", "work");
    expect(getStorage().getItem("x")).toBe("work");
    expect(getStorageStatus().mode).toBe("memory");
    await expect(retryStorageWrites()).rejects.toMatchObject({ code: "storage_write_failed" });
    blocked = false;
    await retryStorageWrites();
    expect(getStorageStatus().mode).toBe("web");
    expect(getStorage().getItem("x")).toBe("work");
  });
});

describe("B-05 failed native hydration", () => {
  it("keeps Preferences authoritative when one read fails and retries without stale resurrection", async () => {
    const local = spyStorage({ [HISTORY_STORAGE_KEY]: "stale-deleted" });
    const preferences = createPreferencesMock({ [MIGRATION_MARKER_KEY]: "{}", [HISTORY_STORAGE_KEY]: "newest" });
    const get = preferences.get;
    let fail = true;
    preferences.get = async (options) => { if (fail && options.key === PROFILE_STORAGE_KEY) throw new Error(); return get(options); };
    nativeWindow(local);
    getStorage().setItem(CONSENT_STORAGE_KEY, "pending-consent");
    await expect(initStorage({ preferences })).rejects.toMatchObject({ code: "storage_init_failed" });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(getStorageStatus().phase).toBe("error");
    expect(local.writes).toEqual([]);
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("newest");
    fail = false;
    await initStorage({ preferences });
    await flushStorageWrites();
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("newest");
    expect(preferences.store.get(CONSENT_STORAGE_KEY)).toBe("pending-consent");
  });

  it("stops on migration-marker failure and retries without rewriting existing Preferences", async () => {
    const failSetFor = [MIGRATION_MARKER_KEY];
    const preferences = createPreferencesMock({ [HISTORY_STORAGE_KEY]: "newest" }, { failSetFor });
    nativeWindow(spyStorage({ [HISTORY_STORAGE_KEY]: "old" }));
    await expect(initStorage({ preferences })).rejects.toMatchObject({ code: "storage_init_failed" });
    expect(preferences.store.get(HISTORY_STORAGE_KEY)).toBe("newest");
    failSetFor.splice(0);
    await initStorage({ preferences });
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("newest");
  });
});

describe("Web recovery overlay and unseen originals", () => {
  it("exposes a failed latest write for backup rescue while keeping the old durable copy", async () => {
    const local = createMemoryStorage({ [HISTORY_STORAGE_KEY]: "old" });
    const originalSet = local.setItem;
    let fail = true;
    local.setItem = (key, value) => { if (fail) throw new Error(); originalSet(key, value); };
    globalThis.window = { localStorage: local };
    await initStorage();
    expect(() => getStorage().setItem(HISTORY_STORAGE_KEY, "latest")).toThrow();
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("latest");
    expect(local.getItem(HISTORY_STORAGE_KEY)).toBe("old");
    fail = false;
    await retryStorageWrites();
    expect(local.getItem(HISTORY_STORAGE_KEY)).toBe("latest");
    originalSet(HISTORY_STORAGE_KEY, "external-after-success");
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("external-after-success");
  });

  it("retains the user's failed deletion as a retryable overlay", async () => {
    const local = createMemoryStorage({ x: "old" });
    const originalRemove = local.removeItem;
    let fail = true;
    local.removeItem = (key) => { if (fail) throw new Error(); originalRemove(key); };
    globalThis.window = { localStorage: local };
    await initStorage();
    expect(() => getStorage().removeItem("x")).toThrow();
    expect(getStorage().getItem("x")).toBeNull();
    expect(local.getItem("x")).toBe("old");
    fail = false;
    await retryStorageWrites();
    expect(local.getItem("x")).toBeNull();
  });

  it("preflights memory recovery before replacing unseen original history/profile", async () => {
    const local = createMemoryStorage({ [HISTORY_STORAGE_KEY]: "original-history", [PROFILE_STORAGE_KEY]: "original-profile" });
    let blocked = true;
    globalThis.window = { get localStorage() { if (blocked) throw new Error(); return local; } };
    await initStorage();
    getStorage().setItem(HISTORY_STORAGE_KEY, "session-history");
    getStorage().setItem(PROFILE_STORAGE_KEY, "session-profile");
    getStorage().setItem("new-only", "session-value");
    blocked = false;
    await expect(retryStorageWrites()).rejects.toMatchObject({ code: "storage_recovery_conflict", conflictKeys: [HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY] });
    expect(getStorageStatus().mode).toBe("memory");
    expect(getStorage().getItem(HISTORY_STORAGE_KEY)).toBe("session-history");
    expect(local.getItem(HISTORY_STORAGE_KEY)).toBe("original-history");
    expect(local.getItem(PROFILE_STORAGE_KEY)).toBe("original-profile");
    expect(local.getItem("new-only")).toBeNull();
  });

  it("keeps a memory-session delete pending when recovery finds an unseen original", async () => {
    const local = createMemoryStorage({ x: "unseen-original" });
    let blocked = true;
    globalThis.window = { get localStorage() { if (blocked) throw new Error(); return local; } };
    await initStorage();
    getStorage().setItem("x", "session-value");
    getStorage().removeItem("x");
    blocked = false;
    await expect(retryStorageWrites()).rejects.toMatchObject({ code: "storage_recovery_conflict", conflictKeys: ["x"] });
    expect(local.getItem("x")).toBe("unseen-original");
    expect(getStorage().getItem("x")).toBeNull();
    // Simulates an explicit external reconciliation after both copies were rescued.
    local.removeItem("x");
    await retryStorageWrites();
    expect(getStorageStatus().mode).toBe("web");
    expect(getStorage().getItem("x")).toBeNull();
  });
});
