import { describe, expect, it, vi } from "vitest";
import { buildHintSeed, calculateTodayHints, getDayDescription, getHourDescription, recordLabel } from "@/lib/todayHints";

const BIRTH = { year: "庚午", month: "己卯", day: "丙子", hour: "甲午" };
const TODAY = { year: "丙午", month: "己亥", day: "壬寅", hour: "丙午" };
const SCORES = { love: 60, money: 50, work: 70, health: 40 };
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

describe("today hints (L-04: same day, same input, same hints)", () => {
  it("returns identical hints and descriptions for identical input, without Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const entry = { event: "静かに過ごした", intuition: "", emoji: "😌", type: "past" };
    for (const bio of [{ p: 10, e: -20, i: 30 }, { p: 90, e: 80, i: 70 }, { p: -90, e: -80, i: -70 }]) {
      for (const scores of [SCORES, { love: 90, money: 90, work: 90, health: 90 }, { love: 10, money: 10, work: 10, health: 10 }]) {
        const first = calculateTodayHints(BIRTH, TODAY, bio, scores, entry);
        const second = calculateTodayHints(BIRTH, TODAY, bio, scores, entry);
        expect(second).toEqual(first);
      }
    }
    const seed = buildHintSeed(BIRTH, TODAY, { p: 1, e: 2, i: 3 }, entry);
    expect(getDayDescription(TODAY.day, seed)).toBe(getDayDescription(TODAY.day, seed));
    expect(getHourDescription(TODAY.hour, seed)).toBe(getHourDescription(TODAY.hour, seed));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("can choose different color names for different inputs (still varied, just seeded)", () => {
    const names = new Set();
    for (let i = 0; i < 40; i += 1) {
      names.add(calculateTodayHints(BIRTH, TODAY, { p: 0, e: 0, i: 0 }, SCORES, { event: `記録${i}` }).color.value);
    }
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("record label (L-05: surrogate-safe 36 chars)", () => {
  it("does not split an emoji at the 36th character", () => {
    const label = recordLabel("あ".repeat(35) + "😀" + "い");
    expect(label).toBe("あ".repeat(35) + "😀");
    expect(label).not.toMatch(LONE_SURROGATE);
  });

  it("never leaves a lone surrogate in any hint message", () => {
    const entry = { event: "あ".repeat(35) + "😀😀", type: "past" };
    for (let i = 0; i < 20; i += 1) {
      const hints = calculateTodayHints(BIRTH, TODAY, { p: i * 5 - 50, e: 0, i: 0 }, SCORES, entry);
      expect(JSON.stringify(hints, (_k, v) => v)).not.toMatch(LONE_SURROGATE);
      for (const part of [hints.color, hints.number, hints.direction]) expect(part.message).not.toMatch(LONE_SURROGATE);
    }
  });
});
