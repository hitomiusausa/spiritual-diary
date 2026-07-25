import { describe, expect, it } from "vitest";
import {
  calculateBirthChart,
  calculateDaYun,
  calculateSaju,
  parseBirthInput,
} from "@/lib/saju";

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

  it("uses noon only as an explicit reference when birth time is absent", () => {
    const input = parseBirthInput("1999-06-07");
    const chart = calculateBirthChart({ birthDate: "1999-06-07" });

    expect(input).toMatchObject({ hour: 12, minute: 0, hasBirthTime: false });
    expect(chart.hasBirthTime).toBe(false);
    expect(chart.hour).toBeTruthy();
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
