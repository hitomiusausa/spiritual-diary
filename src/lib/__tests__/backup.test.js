import { describe, it, expect, beforeEach } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  buildBackup,
  parseBackup,
  mergeHistories,
  applyBackup,
} from "../backup";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY, MAX_HISTORY_ITEMS } from "../history";
import { CHAT_HISTORY_STORAGE_KEY } from "../chatHistory";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

const record = (id, createdAt) => ({
  id,
  createdAt,
  userProfile: { birthDate: "1999-06-07" },
  entry: { event: `event-${id}` },
  result: { deepMessage: "m" },
});

describe("buildBackup", () => {
  it("3キーの内容とスキーマバージョンを含む", () => {
    const storage = memoryStorage({
      [HISTORY_STORAGE_KEY]: JSON.stringify([record("a", "2026-07-01T00:00:00.000Z")]),
      [PROFILE_STORAGE_KEY]: JSON.stringify({ nickname: "うさ", birthDate: "1999-06-07", birthTime: "", gender: "" }),
      [CHAT_HISTORY_STORAGE_KEY]: JSON.stringify([{ role: "user", content: "こんにちは" }]),
    });
    const backup = buildBackup(storage);
    expect(backup.app).toBe("spiritual-diary");
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(typeof backup.exportedAt).toBe("string");
    expect(backup.history).toHaveLength(1);
    expect(backup.profile?.nickname).toBe("うさ");
    expect(backup.chat).toHaveLength(1);
  });

  it("データがなくても空の形で成立する", () => {
    const backup = buildBackup(memoryStorage());
    expect(backup.history).toEqual([]);
    expect(backup.profile).toBeNull();
    expect(backup.chat).toEqual([]);
  });
});

describe("parseBackup", () => {
  it("buildBackupの出力を受け入れる(往復)", () => {
    const storage = memoryStorage({
      [HISTORY_STORAGE_KEY]: JSON.stringify([record("a", "2026-07-01T00:00:00.000Z")]),
    });
    const parsed = parseBackup(JSON.stringify(buildBackup(storage)));
    expect(parsed.history).toHaveLength(1);
  });

  it("JSONでない入力を拒否する", () => {
    expect(() => parseBackup("not json")).toThrow();
  });

  it("他アプリ・バージョン不明のJSONを拒否する", () => {
    expect(() => parseBackup(JSON.stringify({ app: "other", schemaVersion: 1 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ app: "spiritual-diary", schemaVersion: 999 }))).toThrow();
  });

  it("idのない履歴項目を除外する", () => {
    const parsed = parseBackup(JSON.stringify({
      app: "spiritual-diary",
      schemaVersion: 1,
      history: [record("a", "2026-07-01T00:00:00.000Z"), { createdAt: "x" }, null],
      profile: null,
      chat: [],
    }));
    expect(parsed.history).toHaveLength(1);
  });
});

describe("mergeHistories", () => {
  it("idで重複排除し、既存を優先する", () => {
    const existing = [{ ...record("a", "2026-07-02T00:00:00.000Z"), entry: { event: "existing" } }];
    const imported = [{ ...record("a", "2026-07-02T00:00:00.000Z"), entry: { event: "imported" } }, record("b", "2026-07-01T00:00:00.000Z")];
    const merged = mergeHistories(existing, imported);
    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === "a").entry.event).toBe("existing");
  });

  it("createdAt降順に並べ、上限で切る", () => {
    const existing = Array.from({ length: 20 }, (_, i) => record(`e${i}`, `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    const imported = Array.from({ length: 20 }, (_, i) => record(`i${i}`, `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    const merged = mergeHistories(existing, imported);
    expect(merged).toHaveLength(MAX_HISTORY_ITEMS);
    expect(merged[0].createdAt >= merged[1].createdAt).toBe(true);
    // 新しい既存20件は必ず残る(古いインポート分から切られる)
    expect(merged.filter((item) => item.id.startsWith("e"))).toHaveLength(20);
  });
});

describe("applyBackup", () => {
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("履歴をマージして保存し、件数を返す", () => {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([record("a", "2026-07-02T00:00:00.000Z")]));
    const summary = applyBackup(storage, {
      history: [record("a", "2026-07-02T00:00:00.000Z"), record("b", "2026-07-01T00:00:00.000Z")],
      profile: null,
      chat: [],
    });
    expect(summary.historyAdded).toBe(1);
    expect(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY))).toHaveLength(2);
  });

  it("既存プロフィールを上書きしない", () => {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ nickname: "既存", birthDate: "1999-06-07", birthTime: "", gender: "" }));
    const summary = applyBackup(storage, {
      history: [],
      profile: { nickname: "インポート", birthDate: "2000-01-01", birthTime: "", gender: "" },
      chat: [],
    });
    expect(summary.profileApplied).toBe(false);
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)).nickname).toBe("既存");
  });

  it("プロフィール未設定なら取り込む", () => {
    const summary = applyBackup(storage, {
      history: [],
      profile: { nickname: "インポート", birthDate: "2000-01-01", birthTime: "", gender: "" },
      chat: [],
    });
    expect(summary.profileApplied).toBe(true);
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)).nickname).toBe("インポート");
  });

  it("空プロフィール(birthDateなし)は実データ扱いせず上書きする", () => {
    // UIが初回マウントで空プロフィールを自動保存するため
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ nickname: "", birthDate: "", birthTime: "", gender: "" }));
    const summary = applyBackup(storage, {
      history: [],
      profile: { nickname: "インポート", birthDate: "2000-01-01", birthTime: "", gender: "" },
      chat: [],
    });
    expect(summary.profileApplied).toBe(true);
    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)).birthDate).toBe("2000-01-01");
  });

  it("チャットは現在の履歴が空のときだけ復元する", () => {
    const imported = [{ role: "user", content: "restore me" }];
    const first = applyBackup(storage, { history: [], profile: null, chat: imported });
    expect(first.chatRestored).toBe(true);
    expect(JSON.parse(storage.getItem(CHAT_HISTORY_STORAGE_KEY))).toHaveLength(1);

    storage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify([{ role: "user", content: "current" }]));
    const second = applyBackup(storage, { history: [], profile: null, chat: [{ role: "user", content: "other" }] });
    expect(second.chatRestored).toBe(false);
    expect(JSON.parse(storage.getItem(CHAT_HISTORY_STORAGE_KEY))[0].content).toBe("current");
  });
});
