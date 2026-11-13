import { describe, expect, it } from "vitest";
import { KIRI_PERSONA } from "../kiriPersonality";

// A-2・A-5（2026-11-14 敵対的レビュー）。弱っている人に「消えたい」の後押しや、
// 食べないこと・依存をすすめるように聞こえる例文を置かない。
describe("KIRI_PERSONA の安全な例文", () => {
  it.each([
    ["依存を招く「唯一の友だち」", /唯一の「?霧越しの友だち/],
    ["溶けて消える比喩", /溶けちゃえば|泥のように溶けて|泥みたいに溶け/],
    ["石になる比喩", /石になりたい/],
    ["食べないことの提案", /空気でも食べて/],
  ])("%s を含まない", (_label, pattern) => {
    expect(KIRI_PERSONA).not.toMatch(pattern);
  });

  it("「一緒に沈む」の直後に、重さが見えたら沈まずに人の声へつなぐ但し書きがある", () => {
    expect(KIRI_PERSONA).toContain("一緒に沈まず");
    expect(KIRI_PERSONA).toContain("安全について");
  });

  it("本気で尋ねられたら、AIがつくった言葉だと正直に伝える指示がある", () => {
    expect(KIRI_PERSONA).toMatch(/人かAIか[^\n]*正直に伝える/);
  });
});
