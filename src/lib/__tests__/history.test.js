import { describe, expect, it } from "vitest";
import {
  HISTORY_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  clearHistory,
  deleteHistoryItem,
  loadHistory,
  saveHistory,
  loadProfile,
  saveProfile,
  isSameReading,
} from "@/lib/history";

function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

describe("history storage", () => {
  it("stores newest records first and caps the list", () => {
    const store = storage();
    saveHistory(store, { id: "old" });
    saveHistory(store, { id: "new" });
    expect(loadHistory(store).map((item) => item.id)).toEqual(["new", "old"]);
    expect(JSON.parse(store.getItem(HISTORY_STORAGE_KEY))).toHaveLength(2);
  });

  it("deletes one record or clears all records", () => {
    const store = storage();
    saveHistory(store, { id: "a" });
    saveHistory(store, { id: "b" });
    expect(deleteHistoryItem(store, "a").map((item) => item.id)).toEqual(["b"]);
    expect(clearHistory(store)).toEqual([]);
    expect(loadHistory(store)).toEqual([]);
  });

  it("fails closed when stored data is malformed", () => {
    const store = storage();
    store.setItem(HISTORY_STORAGE_KEY, "not-json");
    expect(loadHistory(store)).toEqual([]);
  });

  it("persists only the basic profile fields", () => {
    const store = storage();
    saveProfile(store, { nickname: "みお", birthDate: "1990-02-03", birthTime: "08:10", gender: "female", secret: "ignored" });
    expect(loadProfile(store)).toEqual({ nickname: "みお", birthDate: "1990-02-03", birthTime: "08:10", gender: "female" });
    expect(store.getItem(PROFILE_STORAGE_KEY)).not.toContain("secret");
  });
});

describe("isSameReading (re-showing a cached reading must not duplicate history)", () => {
  const base = {
    id: "a",
    createdAt: "2026-10-09T01:00:00.000Z",
    userProfile: { birthDate: "1990-04-15", birthTime: "", gender: "female", nickname: "うさ" },
    entry: { emoji: "calm", mood: "おだやか", type: "past", event: "散歩した", intuition: "霧" },
    result: { deepMessage: "深い", innerMessage: "内", actionAdvice: "助言", themeScores: null, support: false, saju: null },
  };

  it("is true for the same profile, entry and Kiri text even with a new id and time", () => {
    expect(isSameReading(base, { ...base, id: "b", createdAt: "2026-10-09T05:00:00.000Z" })).toBe(true);
  });

  it("is false when the entry differs", () => {
    expect(isSameReading(base, { ...base, id: "b", entry: { ...base.entry, intuition: "霧2" } })).toBe(false);
    expect(isSameReading(base, { ...base, id: "b", entry: { ...base.entry, mood: "うれしい" } })).toBe(false);
  });

  it("is false when Kiri's words differ (a new reading)", () => {
    expect(isSameReading(base, { ...base, id: "b", result: { ...base.result, deepMessage: "別" } })).toBe(false);
  });

  it("is false when the profile differs", () => {
    expect(isSameReading(base, { ...base, id: "b", userProfile: { ...base.userProfile, birthTime: "08:00" } })).toBe(false);
  });

  it("is false on a different JST day", () => {
    expect(isSameReading(base, { ...base, id: "b", createdAt: "2026-10-09T16:00:00.000Z" })).toBe(false);
  });

  it("is false when either side is missing", () => {
    expect(isSameReading(null, base)).toBe(false);
    expect(isSameReading(base, undefined)).toBe(false);
  });
});
