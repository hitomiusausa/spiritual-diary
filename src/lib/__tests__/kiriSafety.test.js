import { describe, expect, it } from "vitest";
import {
  CRISIS_CHAT_MESSAGE,
  SUPPORT_LINES,
  SUPPORT_LINES_CHECKED_AT,
  detectCrisis,
  entryNeedsSupport,
  normalizeForSafety,
} from "../kiriSafety";

describe("normalizeForSafety", () => {
  it("全角半角・カタカナ・空白の揺れを吸収する", () => {
    expect(normalizeForSafety("ﾘｽｶ")).toBe("りすか");
    expect(normalizeForSafety("死に　たい")).toBe("死にたい");
    expect(normalizeForSafety("シニタイ")).toBe("しにたい");
  });
});

describe("detectCrisis", () => {
  it.each([
    "もう死にたい",
    "しにたい",
    "死にたくなる夜がある",
    "消えたい",
    "いなくなりたい",
    "消えてしまいたい",
    "生きていたくない",
    "生きる意味がない",
    "自殺を考えてる",
    "リスカした",
    "リストカットがやめられない",
    "オーバードーズしそう",
    "首を吊りたい",
    "死んだほうがまし",
    "死ぬしかない",
    "あいつを殺したい",
    "ﾘｽｶ",
  ])("拾う: %s", (text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it.each([
    "死ぬほど美味しかった",
    "死ぬかと思うくらい笑った",
    "暑くて死ぬ",
    "消しゴムが消えた",
    "時間が消えたみたいに過ぎた",
    "生きがいを見つけた",
    "",
    null,
  ])("拾わない: %s", (text) => {
    expect(detectCrisis(text)).toBe(false);
  });

  it("複数の入力欄をまとめて判定できる", () => {
    expect(detectCrisis("仕事だった", "", "消えたい")).toBe(true);
    expect(detectCrisis("仕事だった", undefined, "眠い")).toBe(false);
  });
});

describe("entryNeedsSupport（日記の入力を送る前・送らないときにも使う）", () => {
  it("出来事か直感のどちらかに危機の言葉があれば true", () => {
    expect(entryNeedsSupport({ event: "もう消えたい", intuition: "" })).toBe(true);
    expect(entryNeedsSupport({ event: "仕事だった", intuition: "死にたい" })).toBe(true);
  });

  it("ふつうの記録・空・null は false", () => {
    expect(entryNeedsSupport({ event: "死ぬほど美味しかった", intuition: "眠い" })).toBe(false);
    expect(entryNeedsSupport({ event: "", intuition: "" })).toBe(false);
    expect(entryNeedsSupport(null)).toBe(false);
    expect(entryNeedsSupport(undefined)).toBe(false);
  });

  it("気分などほかの欄は見ない（サーバーの判定と同じ欄だけ）", () => {
    expect(entryNeedsSupport({ mood: "死にたい", event: "散歩した" })).toBe(false);
  });
});

describe("相談窓口", () => {
  it("24時間の窓口を先頭に置き、番号と確認日を持つ", () => {
    expect(SUPPORT_LINES[0].hours).toContain("24時間");
    for (const line of SUPPORT_LINES) {
      expect(line.name).toBeTruthy();
      expect(line.tel).toMatch(/^[0-9-]+$/);
    }
    expect(SUPPORT_LINES_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("チャットの固定文は絵文字を含まない", () => {
    expect(CRISIS_CHAT_MESSAGE).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
