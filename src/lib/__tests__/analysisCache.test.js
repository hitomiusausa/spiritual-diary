import { describe, it, expect } from "vitest";
import {
  ANALYSIS_CACHE_STORAGE_KEY,
  MAX_ANALYSIS_CACHE_ITEMS,
  analysisCacheKey,
  clearCachedAnalyses,
  loadCachedAnalysis,
  saveCachedAnalysis,
} from "../analysisCache";

const T0 = new Date(Date.UTC(2026, 9, 8, 3, 0, 0)); // 2026-10-08 12:00 JST
const NEXT_DAY = new Date(Date.UTC(2026, 9, 8, 15, 30, 0)); // 2026-10-09 00:30 JST
const INPUT = {
  userProfile: { birthDate: "1990-04-01", birthTime: "08:30", gender: "female", nickname: "みう" },
  biorhythm: { p: 10, e: -20, i: 30 },
  entry: { emoji: "😌", type: "past", event: "今日は母と海へ行った", intuition: "波の音" },
};
const PAYLOAD = { deepMessage: "みうさんの海が光る", support: false };

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function throwingStorage() {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
}

describe("analysisCacheKey", () => {
  it("SHA-256のhexで、日記本文やニックネームを含まない", async () => {
    const key = await analysisCacheKey(INPUT, T0);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await analysisCacheKey(INPUT, T0));
  });

  it("入力のどれかやJSTの日付が変わればキーも変わる", async () => {
    const base = await analysisCacheKey(INPUT, T0);
    expect(await analysisCacheKey({ ...INPUT, entry: { ...INPUT.entry, event: "別の日記" } }, T0)).not.toBe(base);
    expect(await analysisCacheKey({ ...INPUT, userProfile: { ...INPUT.userProfile, nickname: "うさ" } }, T0)).not.toBe(base);
    expect(await analysisCacheKey({ ...INPUT, biorhythm: { p: 11, e: -20, i: 30 } }, T0)).not.toBe(base);
    expect(await analysisCacheKey(INPUT, NEXT_DAY)).not.toBe(base);
  });

  it("結果に関係しない項目（気分メモなど）はキーに入れない", async () => {
    const withMood = { ...INPUT, entry: { ...INPUT.entry, mood: "少し眠い" } };
    expect(await analysisCacheKey(withMood, T0)).toBe(await analysisCacheKey(INPUT, T0));
  });

  it("Web Cryptoが使えなければnull（キャッシュなしで動く）", async () => {
    expect(await analysisCacheKey(INPUT, T0, null)).toBeNull();
  });
});

describe("saveCachedAnalysis / loadCachedAnalysis", () => {
  it("同じ日なら保存した結果を読める", async () => {
    const storage = memoryStorage();
    const key = await analysisCacheKey(INPUT, T0);
    expect(loadCachedAnalysis(storage, key, T0)).toBeNull();
    saveCachedAnalysis(storage, key, PAYLOAD, T0);
    expect(loadCachedAnalysis(storage, key, T0)).toEqual(PAYLOAD);
  });

  it("保存形式は { [hash]: { date, payload } } で、キーに平文を持たない", async () => {
    const storage = memoryStorage();
    const key = await analysisCacheKey(INPUT, T0);
    saveCachedAnalysis(storage, key, PAYLOAD, T0);
    const stored = JSON.parse(storage.data.get(ANALYSIS_CACHE_STORAGE_KEY));
    expect(Object.keys(stored)).toEqual([key]);
    expect(stored[key]).toEqual({ date: "2026-10-08", payload: PAYLOAD });
  });

  it("JSTの日付が変わると前日分は読めず、読み込み時に捨てる", async () => {
    const storage = memoryStorage();
    const key = await analysisCacheKey(INPUT, T0);
    saveCachedAnalysis(storage, key, PAYLOAD, T0);
    expect(loadCachedAnalysis(storage, key, NEXT_DAY)).toBeNull();
    expect(JSON.parse(storage.data.get(ANALYSIS_CACHE_STORAGE_KEY))).toEqual({});
  });

  it("保存時に今日以外のエントリを捨てる", () => {
    const storage = memoryStorage();
    saveCachedAnalysis(storage, "old", PAYLOAD, T0);
    saveCachedAnalysis(storage, "new", PAYLOAD, NEXT_DAY);
    expect(Object.keys(JSON.parse(storage.data.get(ANALYSIS_CACHE_STORAGE_KEY)))).toEqual(["new"]);
  });

  it(`上限${MAX_ANALYSIS_CACHE_ITEMS}件を超えたら古い順に削除する`, () => {
    const storage = memoryStorage();
    for (let index = 0; index <= MAX_ANALYSIS_CACHE_ITEMS; index += 1) {
      saveCachedAnalysis(storage, `k${index}`, { n: index }, T0);
    }
    const keys = Object.keys(JSON.parse(storage.data.get(ANALYSIS_CACHE_STORAGE_KEY)));
    expect(keys).toHaveLength(MAX_ANALYSIS_CACHE_ITEMS);
    expect(keys).not.toContain("k0");
    expect(keys).toContain(`k${MAX_ANALYSIS_CACHE_ITEMS}`);
  });

  it("壊れた保存値やlocalStorageの例外ではキャッシュなしで動く", () => {
    expect(loadCachedAnalysis(memoryStorage({ [ANALYSIS_CACHE_STORAGE_KEY]: "{broken" }), "k", T0)).toBeNull();
    expect(loadCachedAnalysis(memoryStorage({ [ANALYSIS_CACHE_STORAGE_KEY]: "[]" }), "k", T0)).toBeNull();
    expect(loadCachedAnalysis(throwingStorage(), "k", T0)).toBeNull();
    expect(() => saveCachedAnalysis(throwingStorage(), "k", PAYLOAD, T0)).not.toThrow();
    expect(loadCachedAnalysis(undefined, "k", T0)).toBeNull();
    expect(loadCachedAnalysis(memoryStorage(), null, T0)).toBeNull();
  });

  it("履歴など他のlocalStorageキーには触れない", () => {
    const storage = memoryStorage({ "spiritual-diary.history.v1": "[1]" });
    saveCachedAnalysis(storage, "k", PAYLOAD, T0);
    expect(storage.data.get("spiritual-diary.history.v1")).toBe("[1]");
  });
});

describe("clearCachedAnalyses", () => {
  it("端末キャッシュを丸ごと消し、他のキーには触れない", () => {
    const storage = memoryStorage({ "spiritual-diary.history.v1": "[1]" });
    saveCachedAnalysis(storage, "k", PAYLOAD, T0);
    clearCachedAnalyses(storage);
    expect(storage.data.has(ANALYSIS_CACHE_STORAGE_KEY)).toBe(false);
    expect(loadCachedAnalysis(storage, "k", T0)).toBeNull();
    expect(storage.data.get("spiritual-diary.history.v1")).toBe("[1]");
  });

  it("localStorageの例外や未指定でも例外を投げない", () => {
    expect(() => clearCachedAnalyses({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(() => clearCachedAnalyses(undefined)).not.toThrow();
  });
});
