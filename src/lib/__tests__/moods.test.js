import { describe, expect, it } from "vitest";
import { DEFAULT_MOOD, MOODS, findMood, moodBonus, moodLabel } from "@/lib/moods";

describe("moods", () => {
  it("選択肢のアイコン・ラベル・値がすべて重複しない", () => {
    for (const key of ["value", "label", "icon"]) {
      const values = MOODS.map((mood) => mood[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("決めた補正値を持つ", () => {
    expect(moodBonus("🥰")).toBe(0.18);
    expect(moodBonus("✨")).toBe(0.15);
    expect(moodBonus("🤔")).toBe(-0.05);
    expect(moodBonus("😆")).toBe(0.20);
  });

  it("「るんるん」は音符のアイコンで、わくわくの次に並ぶ（2026-10-09）", () => {
    const index = MOODS.findIndex((mood) => mood.label === "るんるん");
    expect(MOODS[index - 1]?.label).toBe("わくわく");
    expect(findMood("🎵")).toMatchObject({ label: "るんるん", icon: "Music" });
    expect(moodBonus("🎵")).toBe(0.16);
    expect(MOODS).toHaveLength(12);
  });

  it("既定の気分は選択肢に含まれる", () => {
    expect(MOODS.some((mood) => mood.value === DEFAULT_MOOD)).toBe(true);
  });

  it("旧い気分の値も表示と補正ができ、未知の値は0", () => {
    expect(findMood("😊")?.icon).toBe("Smile");
    expect(moodBonus("😭")).toBe(-0.18);
    expect(moodLabel("😮")).toBe("ふつう");
    expect(moodBonus("🦄")).toBe(0);
    expect(moodLabel("")).toBe("");
  });
});
