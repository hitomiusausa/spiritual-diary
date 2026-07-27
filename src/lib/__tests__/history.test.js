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
