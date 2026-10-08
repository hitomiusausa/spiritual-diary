import { describe, expect, it } from "vitest";
import { ENTRY_DRAFT_KEY, ENTRY_DRAFT_TTL_MS, saveEntryDraft, takeEntryDraft } from "@/lib/entryDraft";
import { createMemoryStorage } from "@/lib/storage";

const entry = { emoji: "😊", mood: "", type: "past", event: "長めに書いた出来事", intuition: "ひとこと" };

describe("entryDraft（同意画面からポリシーを読みに行く間の書きかけ）", () => {
  it("保存して取り出すと同じ内容が返り、取り出したら消える", () => {
    const s = createMemoryStorage();
    const now = new Date("2026-10-09T01:00:00Z");
    saveEntryDraft(s, entry, now);
    expect(takeEntryDraft(s, now)).toEqual(entry);
    expect(s.getItem(ENTRY_DRAFT_KEY)).toBeNull();
    expect(takeEntryDraft(s, now)).toBeNull();
  });

  it("何も書いていなければ保存しない", () => {
    const s = createMemoryStorage();
    saveEntryDraft(s, { ...entry, event: "", intuition: "" });
    expect(s.getItem(ENTRY_DRAFT_KEY)).toBeNull();
  });

  it("古い下書きは捨てる", () => {
    const s = createMemoryStorage();
    const saved = new Date("2026-10-09T01:00:00Z");
    saveEntryDraft(s, entry, saved);
    expect(takeEntryDraft(s, new Date(saved.getTime() + ENTRY_DRAFT_TTL_MS + 1))).toBeNull();
    expect(s.getItem(ENTRY_DRAFT_KEY)).toBeNull();
  });

  it("壊れたデータ・保存先なしでも例外にしない", () => {
    expect(takeEntryDraft(createMemoryStorage({ [ENTRY_DRAFT_KEY]: "{oops" }))).toBeNull();
    expect(takeEntryDraft(createMemoryStorage({ [ENTRY_DRAFT_KEY]: JSON.stringify({ savedAt: Date.now(), entry: "x" }) }))).toBeNull();
    expect(takeEntryDraft(null)).toBeNull();
    expect(() => saveEntryDraft(null, entry)).not.toThrow();
  });

  it("文字列以外の欄は取り込まない", () => {
    const s = createMemoryStorage({
      [ENTRY_DRAFT_KEY]: JSON.stringify({ savedAt: Date.now(), entry: { event: "書いた", intuition: 3, extra: "x" } }),
    });
    expect(takeEntryDraft(s)).toEqual({ event: "書いた" });
  });
});
