import { describe, expect, it } from "vitest";
import {
  buildMonthGrid, compareMonth, formatDayJa, formatMonthJa, groupRecordsByDay, initialSelectedDay, kiriLineOf,
  monthRange, recordDayKey, shiftMonth, topMoodsOfMonth,
} from "../lookback";

// 端末の地域の暦で数えるので、テストの日時も地域の時刻で作る
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const rec = (id, createdAt, emoji = "😌", result = {}) => ({ id, createdAt, entry: { emoji, event: id }, result });

describe("lookback", () => {
  it("記録の日付を地域の暦の日で数える（夜遅い記録も同じ日）", () => {
    expect(recordDayKey(at(2026, 11, 14, 23))).toBe("2026-11-14");
    expect(recordDayKey(at(2026, 11, 14, 0))).toBe("2026-11-14");
    expect(recordDayKey("こわれた日時")).toBe("");
    expect(recordDayKey(undefined)).toBe("");
  });

  it("暦は日曜はじまり。2026年11月は1日が日曜、2026年8月は1日が土曜の位置", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 11 });
    expect(weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(buildMonthGrid({ year: 2026, month: 8 })[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("うるう年の2月を29日で数える", () => {
    expect(buildMonthGrid({ year: 2028, month: 2 }).flat().filter(Boolean)).toHaveLength(29);
  });

  it("月の移動は年をまたぐ", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(compareMonth({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
  });

  it("移動できる月は、いちばん古い記録の月から今月まで", () => {
    const history = [rec("a", at(2026, 11, 10)), rec("b", at(2026, 8, 2)), rec("c", "こわれた日時")];
    expect(monthRange(history, new Date(2026, 10, 14))).toEqual({
      earliest: { year: 2026, month: 8 }, latest: { year: 2026, month: 11 },
    });
    expect(monthRange([], new Date(2026, 10, 14))).toEqual({
      earliest: { year: 2026, month: 11 }, latest: { year: 2026, month: 11 },
    });
  });

  it("同じ日の記録をまとめ、日の中は新しい順のまま", () => {
    const history = [rec("new", at(2026, 11, 14, 21)), rec("old", at(2026, 11, 14, 8)), rec("other", at(2026, 11, 13))];
    const byDay = groupRecordsByDay(history);
    expect(byDay.get("2026-11-14").map((r) => r.id)).toEqual(["new", "old"]);
    expect(byDay.get("2026-11-13").map((r) => r.id)).toEqual(["other"]);
  });

  it("その月によく選んだ気分を多い順に3つ（同数なら新しく選んだほうが先）。ほかの月は数えない", () => {
    const history = [
      rec("1", at(2026, 11, 14), "☀️"),
      rec("2", at(2026, 11, 13), "😌"),
      rec("3", at(2026, 11, 12), "😌"),
      rec("4", at(2026, 11, 11), "😰"),
      rec("5", at(2026, 11, 10), "🎵"),
      rec("6", at(2026, 10, 30), "😢"),
      rec("7", at(2026, 11, 9), "知らない気分"),
    ];
    const top = topMoodsOfMonth(groupRecordsByDay(history), { year: 2026, month: 11 });
    expect(top).toEqual([
      { value: "😌", label: "おだやか", count: 2 },
      { value: "☀️", label: "元気", count: 1 },
      { value: "😰", label: "不安", count: 1 },
    ]);
  });

  it("開いたときは、その月のいちばん新しい記録の日を選ぶ。記録のない月は選ばない", () => {
    const byDay = groupRecordsByDay([rec("a", at(2026, 11, 3)), rec("b", at(2026, 11, 12)), rec("c", at(2026, 10, 30))]);
    expect(initialSelectedDay(byDay, { year: 2026, month: 11 })).toBe("2026-11-12");
    expect(initialSelectedDay(byDay, { year: 2026, month: 9 })).toBeNull();
  });

  it("Kiriのひとことは読み解きの最初の一文。寄り添いモード・長い文・空には出さない", () => {
    expect(kiriLineOf(rec("a", at(2026, 11, 1), "😌", { innerMessage: "その弾みは、あなたの中から来たもの。続きの文。" })))
      .toBe("その弾みは、あなたの中から来たもの。");
    expect(kiriLineOf(rec("b", at(2026, 11, 1), "😌", { innerMessage: "", deepMessage: "深いほうの一文！あと" }))).toBe("深いほうの一文！");
    expect(kiriLineOf(rec("c", at(2026, 11, 1), "😢", { innerMessage: "受け止めるね。", support: true }))).toBeNull();
    expect(kiriLineOf(rec("d", at(2026, 11, 1), "😌", { innerMessage: "あ".repeat(80) + "。" }))).toBeNull();
    expect(kiriLineOf(rec("e", at(2026, 11, 1)))).toBeNull();
  });

  it("月と日を日本語で出す", () => {
    expect(formatMonthJa({ year: 2026, month: 11 })).toBe("2026年11月");
    expect(formatDayJa("2026-11-04")).toBe("11月4日");
    expect(formatDayJa("")).toBe("");
  });
});
