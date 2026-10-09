import { afterEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_MS, subscribeAppVisibility } from "@/lib/appState";
import { capacitorLikeProxy } from "./capacitorProxy";

function appModule() {
  const listeners = new Map();
  const removed = [];
  const App = capacitorLikeProxy("App", {
    addListener: vi.fn(async (event, fn) => {
      listeners.set(event, fn);
      // 実物の PluginListenerHandle は Proxy ではない素のオブジェクト（{ remove }）。
      return {
        remove: vi.fn(async () => {
          removed.push(event);
          listeners.delete(event);
        }),
      };
    }),
  });
  return { mod: { App }, App, listeners, removed };
}

function fakeDocument(state = "visible") {
  const listeners = new Set();
  return {
    visibilityState: state,
    addEventListener: vi.fn((type, fn) => {
      if (type === "visibilitychange") listeners.add(fn);
    }),
    removeEventListener: vi.fn((type, fn) => {
      if (type === "visibilitychange") listeners.delete(fn);
    }),
    fire(next) {
      this.visibilityState = next;
      for (const fn of [...listeners]) fn();
    },
    get count() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  delete globalThis.window;
});

describe("subscribeAppVisibility (native)", () => {
  it("maps pause/resume to onHide/onShow with timestamps", async () => {
    const { mod, App, listeners } = appModule();
    const onHide = vi.fn();
    const onShow = vi.fn();
    let t = 1000;
    subscribeAppVisibility({ onHide, onShow }, { native: true, load: async () => mod, now: () => t });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    expect(App.addListener.mock.calls.map((c) => c[0]).sort()).toEqual(["pause", "resume"]);
    listeners.get("pause")();
    t = 61_000;
    listeners.get("resume")();
    expect(onHide).toHaveBeenCalledWith(1000);
    expect(onShow).toHaveBeenCalledWith(61_000);
  });

  it("does not use appStateChange (resignActive would misfire on Control Center / Face ID)", async () => {
    const { mod, App, listeners } = appModule();
    subscribeAppVisibility({ onHide: () => {}, onShow: () => {} }, { native: true, load: async () => mod });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    expect(App.addListener.mock.calls.map((c) => c[0])).not.toContain("appStateChange");
  });

  it("removes both listeners on unsubscribe", async () => {
    const { mod, listeners, removed } = appModule();
    const unsubscribe = subscribeAppVisibility({ onHide: () => {}, onShow: () => {} }, { native: true, load: async () => mod });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    unsubscribe();
    await vi.waitFor(() => expect(removed.sort()).toEqual(["pause", "resume"]));
  });

  it("cleans up listeners that register after an early unsubscribe, and never calls back", async () => {
    const { mod, listeners, removed } = appModule();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const onHide = vi.fn();
    const unsubscribe = subscribeAppVisibility(
      { onHide, onShow: () => {} },
      { native: true, load: async () => (await gate, mod) },
    );
    unsubscribe();
    release();
    await vi.waitFor(() => expect(removed.sort()).toEqual(["pause", "resume"]));
    expect(listeners.size).toBe(0);
    expect(onHide).not.toHaveBeenCalled();
  });

  it("swallows a plugin load failure and still returns an unsubscribe", async () => {
    const unsubscribe = subscribeAppVisibility(
      { onHide: () => {}, onShow: () => {} },
      {
        native: true,
        load: async () => {
          throw new Error("missing");
        },
      },
    );
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("does not touch the document on native", async () => {
    const { mod } = appModule();
    const doc = fakeDocument();
    subscribeAppVisibility({ onHide: () => {}, onShow: () => {} }, { native: true, load: async () => mod, doc });
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });
});

// 監査 P1-2 補足: WKWebView の JS は背景で止められ、pause が復帰時にまとめて届くことがある。
// そのまま「届いた時刻」を使うと背景にいた時間がほぼ 0 になり、1・5・15 分の判定がロックしない側に倒れる。
// pause には時刻が付かない（@capacitor/app 8.1.1 は data: nil）ので、前景で回す心拍の最後の時刻を使う（安全側）。
function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setInterval: vi.fn((fn, ms) => {
      id += 1;
      timers.set(id, { fn, ms });
      return id;
    }),
    clearInterval: vi.fn((handle) => timers.delete(handle)),
    tick() {
      for (const { fn } of [...timers.values()]) fn();
    },
    get count() {
      return timers.size;
    },
  };
}

describe("subscribeAppVisibility (late pause, P1-2)", () => {
  it("uses the last heartbeat as the hide time when pause arrives long after JS stopped", async () => {
    const { mod, listeners } = appModule();
    const timers = fakeTimers();
    const onHide = vi.fn();
    let t = 0;
    subscribeAppVisibility({ onHide, onShow: () => {} }, { native: true, load: async () => mod, now: () => t, timers });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), HEARTBEAT_MS);
    t = 10_000;
    timers.tick(); // last sign of life before the web process was suspended
    t = 10_000 + 6 * 60_000; // pause delivered on return, 6 minutes later
    listeners.get("pause")();
    expect(onHide).toHaveBeenCalledWith(10_000);
  });

  it("uses the delivery time when JS was alive (normal pause)", async () => {
    const { mod, listeners } = appModule();
    const timers = fakeTimers();
    const onHide = vi.fn();
    let t = 0;
    subscribeAppVisibility({ onHide, onShow: () => {} }, { native: true, load: async () => mod, now: () => t, timers });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    t = 10_000;
    timers.tick();
    t = 10_000 + HEARTBEAT_MS + 100; // within two beats: JS was running
    listeners.get("pause")();
    expect(onHide).toHaveBeenCalledWith(10_000 + HEARTBEAT_MS + 100);
  });

  it("restarts the heartbeat clock on resume and stops it on unsubscribe", async () => {
    const { mod, listeners } = appModule();
    const timers = fakeTimers();
    const onHide = vi.fn();
    let t = 0;
    const unsubscribe = subscribeAppVisibility(
      { onHide, onShow: () => {} },
      { native: true, load: async () => mod, now: () => t, timers },
    );
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    t = 600_000;
    listeners.get("resume")();
    t = 601_000;
    listeners.get("pause")();
    expect(onHide).toHaveBeenCalledWith(601_000);
    unsubscribe();
    expect(timers.count).toBe(0);
  });
});

describe("subscribeAppVisibility (web)", () => {
  it("uses visibilitychange without importing the plugin", () => {
    const load = vi.fn();
    const doc = fakeDocument();
    const onHide = vi.fn();
    const onShow = vi.fn();
    let t = 5;
    const unsubscribe = subscribeAppVisibility({ onHide, onShow }, { native: false, load, doc, now: () => t });
    expect(load).not.toHaveBeenCalled();
    doc.fire("hidden");
    t = 9;
    doc.fire("visible");
    expect(onHide).toHaveBeenCalledWith(5);
    expect(onShow).toHaveBeenCalledWith(9);
    unsubscribe();
    expect(doc.count).toBe(0);
  });

  it("is a no-op without a document (server render)", () => {
    const unsubscribe = subscribeAppVisibility({ onHide: () => {}, onShow: () => {} }, { native: false, doc: null });
    expect(() => unsubscribe()).not.toThrow();
  });

  it("tolerates missing callbacks", () => {
    const doc = fakeDocument();
    subscribeAppVisibility({}, { native: false, doc });
    expect(() => doc.fire("hidden")).not.toThrow();
  });
});

describe("default loader (real module path)", () => {
  it("loads @capacitor/app by default", async () => {
    vi.resetModules();
    const { mod, listeners } = appModule();
    vi.doMock("@capacitor/app", () => mod);
    const fresh = await import("@/lib/appState");
    fresh.subscribeAppVisibility({ onHide: () => {}, onShow: () => {} }, { native: true });
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    vi.doUnmock("@capacitor/app");
  });
});
