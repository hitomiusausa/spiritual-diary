import { describe, expect, it } from "vitest";
import {
  calculateBirthChart,
  calculateDaYun,
  calculateSaju,
  parseBirthInput,
} from "@/lib/saju";

// ライブラリと独立した検証用の60干支演算。
// アンカーは検証済み既知ケース 1999-06-07 = 庚寅(60干支インデックス26)。
const STEMS = [..."甲乙丙丁戊己庚辛壬癸"];
const BRANCHES = [..."子丑寅卯辰巳午未申酉戌亥"];
const ANCHOR_UTC = Date.UTC(1999, 5, 7);
const ANCHOR_INDEX = 26; // 庚寅
const DAY_MS = 86_400_000;

function cycleAt(index) {
  const i = ((index % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}

function expectedDayPillar(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const offset = Math.round((Date.UTC(year, month - 1, day) - ANCHOR_UTC) / DAY_MS);
  return cycleAt(ANCHOR_INDEX + offset);
}

function isoFromAnchorOffset(offsetDays) {
  return new Date(ANCHOR_UTC + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

describe("saju calculation contract", () => {
  it("matches the lunar-javascript reference eight-character case", () => {
    const chart = calculateBirthChart({
      birthDate: "1999-06-07",
      birthTime: "09:11",
    });

    expect(chart.raw).toBe("己卯 庚午 庚寅 辛巳");
    expect(chart.year).toBe("己卯");
    expect(chart.month).toBe("庚午");
    expect(chart.day).toBe("庚寅");
    expect(chart.hour).toBe("辛巳");
    expect(chart.hasBirthTime).toBe(true);
  });

  it.each([
    ["2005-12-23", "08:37", "乙酉 戊子 辛巳 壬辰"],
    ["1988-02-15", "23:30", "戊辰 甲寅 庚子 戊子"],
    ["1988-02-02", "22:30", "丁卯 癸丑 丁亥 辛亥"],
  ])("matches the library reference for %s %s", (birthDate, birthTime, raw) => {
    expect(calculateBirthChart({ birthDate, birthTime }).raw).toBe(raw);
  });

  it("uses noon only as an explicit reference when birth time is absent", () => {
    const input = parseBirthInput("1999-06-07");
    const chart = calculateBirthChart({ birthDate: "1999-06-07" });

    expect(input).toMatchObject({ hour: 12, minute: 0, hasBirthTime: false });
    expect(chart.hasBirthTime).toBe(false);
    expect(chart.hour).toBeTruthy();
  });

  it("keeps the selected sect-2 convention stable at the 23:00 boundary", () => {
    const before = calculateBirthChart({
      birthDate: "1988-02-15",
      birthTime: "22:30",
    });
    const after = calculateBirthChart({
      birthDate: "1988-02-15",
      birthTime: "23:30",
    });

    expect(before.day).toBe("庚子");
    expect(after.day).toBe("庚子");
    expect(after.hour).toBe("戊子");
  });

  it("rejects impossible dates and times", () => {
    expect(() => parseBirthInput("1999-02-29")).toThrow();
    expect(() => parseBirthInput("1999-06-07", "24:00")).toThrow();
    expect(() => parseBirthInput("1999/06/07")).toThrow();
  });

  it("does not invent a taiun direction when gender is unavailable", () => {
    const chart = calculateBirthChart({
      birthDate: "1999-06-07",
      birthTime: "09:11",
    });

    expect(
      calculateDaYun({
        birthChart: chart,
        gender: "other",
        now: new Date("2024-01-01T00:00:00Z"),
      }),
    ).toMatchObject({ available: false, reason: "gender_required_for_direction" });
  });

  it("keeps the day pillar continuous with the sexagenary cycle from the verified anchor", () => {
    // 1999-06-07 = 庚寅（検証済み既知ケース）を起点に、日柱が60干支の
    // 単純な日送りと一致することをライブラリと独立に確認する。
    for (let offset = -36000; offset <= 18000; offset += 1721) {
      const date = isoFromAnchorOffset(offset);
      expect(calculateBirthChart({ birthDate: date }).day, date).toBe(expectedDayPillar(date));
    }
  });

  it.each([
    // 立春(2024-02-04)を挟む年柱・月柱の切り替わり。
    // 年柱は公知の干支年、月柱は五虎遁、日柱はアンカーからの60干支演算で独立導出。
    ["2024-02-01", "癸卯", "乙丑"],
    ["2024-02-08", "甲辰", "丙寅"],
    // 芒種(2024-06-05)を挟む月柱の切り替わり(巳月→午月)。
    ["2024-06-01", "甲辰", "己巳"],
    ["2024-06-10", "甲辰", "庚午"],
  ])("matches independent derivation across jieqi boundaries: %s", (birthDate, year, month) => {
    const chart = calculateBirthChart({ birthDate, birthTime: "12:00" });
    expect(chart.year).toBe(year);
    expect(chart.month).toBe(month);
    expect(chart.day).toBe(expectedDayPillar(birthDate));
  });

  it("switches the day pillar at midnight and starts the late-night zi hour from the next day stem", () => {
    // sect2: 日柱は0時切替。23時台の時柱(夜子時)は翌日の日干から起算される。
    const lateNight = calculateBirthChart({ birthDate: "1988-02-15", birthTime: "23:30" });
    const afterMidnight = calculateBirthChart({ birthDate: "1988-02-16", birthTime: "00:30" });

    expect(lateNight.day).toBe("庚子");
    expect(afterMidnight.day).toBe("辛丑"); // 庚子の翌日
    // 五鼠遁: 辛日の子時=戊子。夜子時も翌日干(辛)起算のため同じ戊子になる。
    expect(lateNight.hour).toBe("戊子");
    expect(afterMidnight.hour).toBe("戊子");
  });

  it("switches the hour pillar at odd-hour boundaries", () => {
    // 1999-06-07は庚日。五鼠遁(乙/庚→丙子)から 辰=庚辰, 巳=辛巳, 午=壬午。
    expect(calculateBirthChart({ birthDate: "1999-06-07", birthTime: "08:59" }).hour).toBe("庚辰");
    expect(calculateBirthChart({ birthDate: "1999-06-07", birthTime: "09:00" }).hour).toBe("辛巳");
    expect(calculateBirthChart({ birthDate: "1999-06-07", birthTime: "10:59" }).hour).toBe("辛巳");
    expect(calculateBirthChart({ birthDate: "1999-06-07", birthTime: "11:00" }).hour).toBe("壬午");
  });

  it("uses the library's jieqi-based yun direction and active period", () => {
    const female = calculateSaju({
      birthDate: "1999-06-07",
      birthTime: "09:11",
      gender: "female",
      now: new Date("2024-01-01T00:00:00Z"),
    });
    const male = calculateSaju({
      birthDate: "1999-06-07",
      birthTime: "09:11",
      gender: "male",
      now: new Date("2024-01-01T00:00:00Z"),
    });

    expect(female.taiun).toMatchObject({
      available: true,
      direction: "forward",
      pillar: "壬申",
      start: { solar: "2009-08-08" },
    });
    expect(male.taiun).toMatchObject({
      available: true,
      direction: "backward",
      pillar: "丁卯",
    });
  });
});
