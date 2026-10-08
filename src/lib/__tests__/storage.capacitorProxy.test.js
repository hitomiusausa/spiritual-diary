import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorage, initStorage, resetStorageForTests } from "@/lib/storage";
import { PROFILE_STORAGE_KEY } from "@/lib/history";

// Capacitor の registerPlugin が返す Proxy を再現する: 未知のプロパティはすべて「ネイティブメソッド呼び出し」になり、
// 実装されていなければ reject する。`then` も例外ではないので、async 関数からそのまま返したり await したりすると
// Promise の解決手順が Preferences.then(resolve, reject) を呼び、resolve されないまま止まる
// （iOS シミュレータで起動が白紙のまま止まった実例。T13 検収）。
const stored = new Map([[PROFILE_STORAGE_KEY, '{"birthDate":"1990-04-15"}']]);
const methods = {
  keys: async () => ({ keys: [...stored.keys()] }),
  get: async ({ key }) => ({ value: stored.has(key) ? stored.get(key) : null }),
  set: async ({ key, value }) => {
    stored.set(key, value);
  },
  remove: async ({ key }) => {
    stored.delete(key);
  },
};
const capacitorLikeProxy = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop in methods) return methods[prop];
      return () => Promise.reject(new Error(`"Preferences.${String(prop)}()" is not implemented on ios`));
    },
  },
);

vi.mock("@capacitor/preferences", () => ({ Preferences: capacitorLikeProxy }));

afterEach(() => {
  resetStorageForTests();
  delete globalThis.window;
});

describe("initStorage with the real Capacitor plugin proxy", () => {
  it("does not hang on the proxy's implicit `then` and loads Preferences", async () => {
    globalThis.window = { localStorage: null };
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), 500));
    const outcome = await Promise.race([initStorage({ native: true }).then(() => "resolved"), timeout]);
    expect(outcome).toBe("resolved");
    expect(getStorage().getItem(PROFILE_STORAGE_KEY)).toBe('{"birthDate":"1990-04-15"}');
  });
});
