import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStorage, resetStorageForTests } from "../storage";
import {
  HISTORY_QUARANTINE_KEY, HISTORY_STORAGE_KEY, hasQuarantinedHistory, loadHistory, loadHistoryQuarantine,
  saveHistory, saveHistoryKeepingUnreadable,
} from "../history";
import { getDataIssues } from "../dataIntegrity";
import { buildBackup, buildRecoveryBackup, parseBackup } from "../backup";
import { clearAllRecords, hasAnyRecords } from "../deleteAll";

// R2-03: 壊れた1件があっても、新しい読み解きの保存を止めない。原本は消さずに別の場所へ保管する（D-39 の「破損原本は自動で捨てない」を守る）。
const record = (id) => ({ id, createdAt: "2026-11-14T12:00:00Z", entry: { event: `entry-${id}` }, result: { deepMessage: "text" } });
const BAD = JSON.stringify([record("old"), { id: "bad", entry: { event: { unsafe: true } } }]);
const flushOk = async () => {};

afterEach(() => { resetStorageForTests(); });

describe("R2-03 読み込めない記録があるときの保存", () => {
  it("原本を保管場所へ写してから、読める記録＋新しい記録で保存を続ける", async () => {
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: BAD });
    loadHistory(storage);
    expect(() => saveHistory(storage, record("new"))).toThrow("needs recovery");

    const saved = await saveHistoryKeepingUnreadable(storage, record("new"), { flush: flushOk, now: new Date("2026-11-14T13:00:00Z") });
    expect(saved.quarantined).toBe(true);
    expect(saved.history.map((item) => item.id)).toEqual(["new", "old"]);
    expect(loadHistory(storage).map((item) => item.id)).toEqual(["new", "old"]);
    expect(getDataIssues(storage)).toEqual([]);
    expect(loadHistoryQuarantine(storage)).toEqual([{ quarantinedAt: "2026-11-14T13:00:00.000Z", reason: "invalid_records", raw: BAD }]);

    // 次の保存はふつうに通り、保管した原本はそのまま
    const next = await saveHistoryKeepingUnreadable(storage, record("next"), { flush: flushOk });
    expect(next.quarantined).toBe(false);
    expect(loadHistoryQuarantine(storage)).toHaveLength(1);
  });

  it("保管の書き込みが端末へ届かなければ、元の記録を書き換えない", async () => {
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: BAD });
    loadHistory(storage);
    const flush = async ({ keys }) => { if (keys.includes(HISTORY_QUARANTINE_KEY)) throw new Error("device storage write failed"); };
    await expect(saveHistoryKeepingUnreadable(storage, record("new"), { flush })).rejects.toThrow("device storage write failed");
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(BAD);
  });

  it("読み込み自体に失敗した（中身が分からない）ときは写さず、保存も止めたまま", async () => {
    const storage = createMemoryStorage();
    storage.getItem = (key) => { if (key === HISTORY_STORAGE_KEY) throw new Error("read failed"); return null; };
    loadHistory(storage);
    await expect(saveHistoryKeepingUnreadable(storage, record("new"), { flush: flushOk })).rejects.toThrow("needs recovery");
  });

  it("保管場所そのものが読めないときは上書きしない", async () => {
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: BAD, [HISTORY_QUARANTINE_KEY]: "{broken" });
    loadHistory(storage);
    await expect(saveHistoryKeepingUnreadable(storage, record("new"), { flush: flushOk })).rejects.toThrow("needs recovery");
    expect(storage.getItem(HISTORY_QUARANTINE_KEY)).toBe("{broken");
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(BAD);
  });

  it("書き出しに保管した原本が入り、読み込みでは取り込まない", async () => {
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: BAD });
    loadHistory(storage);
    await saveHistoryKeepingUnreadable(storage, record("new"), { flush: flushOk });
    const backup = buildBackup(storage);
    expect(backup.unreadableHistory.map((entry) => entry.raw)).toEqual([BAD]);
    expect(parseBackup(JSON.stringify(backup)).history.map((item) => item.id)).toEqual(["new", "old"]);
    expect(buildRecoveryBackup(storage).raw[HISTORY_QUARANTINE_KEY]).toContain("unsafe");
  });

  it("「すべて削除」は保管した原本も消す", async () => {
    const storage = createMemoryStorage({ [HISTORY_STORAGE_KEY]: BAD });
    loadHistory(storage);
    await saveHistoryKeepingUnreadable(storage, record("new"), { flush: flushOk });
    expect(hasQuarantinedHistory(storage)).toBe(true);
    expect(hasAnyRecords([], storage)).toBe(true);
    clearAllRecords(storage);
    expect(hasQuarantinedHistory(storage)).toBe(false);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });
});
