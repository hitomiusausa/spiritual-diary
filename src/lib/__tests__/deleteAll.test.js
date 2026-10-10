import { describe, expect, it } from "vitest";
import { ANALYSIS_CACHE_STORAGE_KEY } from "@/lib/analysisCache";
import { CHAT_HISTORY_STORAGE_KEY } from "@/lib/chatHistory";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "@/lib/history";
import { clearAllRecords, hasAnyRecords } from "@/lib/deleteAll";
import { createMemoryStorage } from "@/lib/storage";

const seeded = (extra = {}) =>
  createMemoryStorage({
    [HISTORY_STORAGE_KEY]: JSON.stringify([{ id: "a", createdAt: "2026-10-10T00:00:00Z", entry: {}, result: {} }]),
    [CHAT_HISTORY_STORAGE_KEY]: JSON.stringify([{ role: "user", content: "こんにちは" }]),
    [ANALYSIS_CACHE_STORAGE_KEY]: JSON.stringify({ x: 1 }),
    [PROFILE_STORAGE_KEY]: JSON.stringify({ nickname: "ひとみ" }),
    [CONSENT_STORAGE_KEY]: JSON.stringify({ version: 1 }),
    ...extra,
  });

describe("「すべて削除」（最近の記録。F-B2）", () => {
  it("日記の記録・端末の読み解き・会話をすべて消し、プロフィールと同意は残す", () => {
    const storage = seeded();
    expect(clearAllRecords(storage)).toEqual([]);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CHAT_HISTORY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(ANALYSIS_CACHE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull();
  });

  it("日記の記録が0件でも、会話があれば「すべて削除」を出す", () => {
    expect(hasAnyRecords([], createMemoryStorage({ [CHAT_HISTORY_STORAGE_KEY]: JSON.stringify([{ role: "assistant", content: "……" }]) }))).toBe(true);
    expect(hasAnyRecords([{ id: "a" }], createMemoryStorage())).toBe(true);
    expect(hasAnyRecords([], createMemoryStorage())).toBe(false);
  });
});
