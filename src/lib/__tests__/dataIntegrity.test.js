import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStorage, getStorage, initStorage, resetStorageForTests, retryStorageWrites } from "../storage";
import { HISTORY_STORAGE_KEY, MAX_HISTORY_ITEMS, PROFILE_STORAGE_KEY, loadHistory, loadProfile, saveHistory, saveProfile, deleteHistoryItem } from "../history";
import { CHAT_HISTORY_STORAGE_KEY, loadChatHistory, saveChatHistory } from "../chatHistory";
import { getDataIssues } from "../dataIntegrity";
import { buildBackup, buildRecoveryBackup, parseBackup, applyBackup } from "../backup";

const envelope = (history = [], profile = null, chat = []) => ({ app: "spiritual-diary", schemaVersion: 1, history, profile, chat });
const record = (id, date = "2026-01-01T00:00:00Z") => ({ id, createdAt: date, entry: { event: `entry-${id}` }, result: { deepMessage: "text" } });

afterEach(() => { resetStorageForTests(); delete globalThis.window; });

describe("B-01 Web failed write rescue", () => {
  it("exports the unsaved new reading while leaving the durable original untouched", async () => {
    const original = JSON.stringify([record("old")]);
    const local = createMemoryStorage({ [HISTORY_STORAGE_KEY]: original });
    const set = local.setItem;
    let fail = true;
    local.setItem = (key, value) => { if (fail) throw new Error("quota"); set(key, value); };
    globalThis.window = { localStorage: local };
    await initStorage();
    expect(() => saveHistory(getStorage(), record("new"))).toThrow("device storage write failed");
    expect(local.getItem(HISTORY_STORAGE_KEY)).toBe(original);
    expect(buildBackup(getStorage()).history.map((item) => item.id)).toEqual(["new", "old"]);
    fail = false;
    await retryStorageWrites();
    expect(JSON.parse(local.getItem(HISTORY_STORAGE_KEY)).map((item) => item.id)).toEqual(["new", "old"]);
  });
});

describe("B-04 quarantine preserves originals", () => {
  it("renders a safe history subset and blocks mutations that would discard the bad original", () => {
    const raw = JSON.stringify([null, { id: "bad", entry: { event: { unsafe: true } } }, { id: "legacy", futureField: { keep: true } }]);
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: raw });
    expect(loadHistory(storage)).toEqual([{ id: "legacy", futureField: { keep: true } }]);
    expect(() => saveHistory(storage, { id: "new" })).toThrow("needs recovery");
    expect(() => deleteHistoryItem(storage, "legacy")).toThrow("needs recovery");
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
    expect(getDataIssues(storage)).toEqual([{ key: HISTORY_STORAGE_KEY, reason: "invalid_records" }]);
    expect(() => buildBackup(storage)).toThrow("needs recovery");
    const rescued = buildRecoveryBackup(storage);
    expect(rescued.raw[HISTORY_STORAGE_KEY]).toBe(raw);
    expect(Object.keys(rescued.raw).sort()).toEqual([HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY, CHAT_HISTORY_STORAGE_KEY].sort());
    expect(() => parseBackup(JSON.stringify(rescued))).toThrow();
  });

  it("does not automatically replace a malformed profile with empty state", () => {
    const raw = JSON.stringify({ birthDate: 123, nickname: { bad: true } });
    const storage = createMemoryStorage({ [PROFILE_STORAGE_KEY]: raw });
    expect(loadProfile(storage)).toBeNull();
    expect(() => saveProfile(storage, { birthDate: "", nickname: "" })).toThrow("needs recovery");
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(raw);
    expect(buildRecoveryBackup(storage).raw[PROFILE_STORAGE_KEY]).toBe(raw);
  });

  it("accepts partial date selection and old optional fields, without truncating text", () => {
    const storage = createMemoryStorage();
    saveProfile(storage, { birthDate: "1990--", nickname: "あ".repeat(41) });
    expect(loadProfile(storage).nickname).toHaveLength(41);
    saveProfile(storage, { birthDate: "1990-04-01", nickname: "name" });
    const legacy = { id: "legacy", entry: { emoji: "😊", event: "あ".repeat(2000) }, extra: { preserve: true } };
    saveHistory(storage, legacy);
    expect(parseBackup(JSON.stringify(buildBackup(storage))).history).toEqual([legacy]);
  });

  it.each([
    { id: "bad", createdAt: "not-a-date" },
    { id: "bad", userProfile: { birthDate: "1990-02-31" } },
    { id: "bad", result: { deepMessage: {} } },
    { id: {}, entry: {} },
    { id: "bad", entry: { event: "x".repeat(100001) } },
  ])("rejects malformed imported records before any destination write", (bad) => {
    const old = JSON.stringify([record("old")]);
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: old });
    expect(() => parseBackup(JSON.stringify(envelope([bad])))).toThrow();
    expect(() => applyBackup(storage, { history: [record("new"), bad], profile: null, chat: [] })).toThrow();
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(old);
  });

  it("keeps an invalid existing destination unchanged on import", () => {
    const raw = "{broken";
    const storage = createMemoryStorage({ [PROFILE_STORAGE_KEY]: raw });
    expect(() => applyBackup(storage, { history: [record("new")], profile: { birthDate: "1990-04-01" }, chat: [] })).toThrow("needs recovery");
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(raw);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("does not truncate existing long chat content on a subsequent save", () => {
    const previous = { role: "user", content: "あ".repeat(2000) };
    const storage = createMemoryStorage({ [CHAT_HISTORY_STORAGE_KEY]: JSON.stringify([previous]) });
    saveChatHistory(storage, [...loadChatHistory(storage), { role: "assistant", content: "reply" }]);
    expect(loadChatHistory(storage)[0]).toEqual(previous);
  });
});

describe("B-02 non-destructive merge", () => {
  it("keeps every existing ID at capacity and reports the skipped unique import", () => {
    const existing = Array.from({ length: MAX_HISTORY_ITEMS }, (_, i) => record(`e${i}`));
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(existing) });
    const summary = applyBackup(storage, { history: [record("new", "2026-11-06T00:00:00Z")], profile: null, chat: [] });
    expect(summary).toMatchObject({ historyAdded: 0, historySkipped: 1, historyTotal: MAX_HISTORY_ITEMS });
    expect(loadHistory(storage)).toEqual(existing);
  });

  it("deduplicates within imports and fills only the empty slot", () => {
    const existing = Array.from({ length: MAX_HISTORY_ITEMS - 1 }, (_, i) => record(`e${i}`));
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(existing) });
    const imported = [record("e0"), record("a", "2026-11-06T00:00:00Z"), record("a"), record("b")];
    const summary = applyBackup(storage, { history: imported, profile: null, chat: [] });
    expect(summary).toMatchObject({ historyAdded: 1, historySkipped: 1, historyDuplicates: 2, historyTotal: MAX_HISTORY_ITEMS });
    expect(loadHistory(storage).filter((item) => item.id.startsWith("e"))).toEqual(existing);
    expect(loadHistory(storage).some((item) => item.id === "a")).toBe(true);
  });

  it("preflights invalid chat after a valid history plan without partial writes", () => {
    const storage = createMemoryStorage();
    expect(() => applyBackup(storage, { history: [record("new")], profile: null, chat: [{ role: "user", content: {} }] })).toThrow();
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });
});
