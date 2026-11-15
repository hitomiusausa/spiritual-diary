import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, zonedDateKey, zonedHour } from "../localTime";
import { calculateBiorhythm } from "../biorhythm";
import { calculateSaju } from "../saju";
import { analysisCacheKey } from "../analysisCache";

describe("端末の地域の暦（D-45）", () => {
  it("使えない地域名は日本時間に倒す", () => {
    expect(normalizeTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    for (const bad of [undefined, null, "", "Mars/Olympus", 42, "x".repeat(65)]) {
      expect(normalizeTimeZone(bad)).toBe(DEFAULT_TIME_ZONE);
    }
  });

  it("ロサンゼルスの夕方は、日本では翌日の朝でも、その土地の日付と時刻になる", () => {
    const now = new Date("2026-11-15T02:00:00Z"); // LA 11/14 18:00・日本 11/15 11:00
    expect(zonedDateKey(now, "America/Los_Angeles")).toBe("2026-11-14");
    expect(zonedHour(now, "America/Los_Angeles")).toBe(18);
    expect(zonedDateKey(now, "Asia/Tokyo")).toBe("2026-11-15");
    expect(zonedHour(now, "Asia/Tokyo")).toBe(11);
  });

  it("バイオリズムと日運はその土地の今日で数える", () => {
    const now = new Date("2026-11-15T02:00:00Z");
    const birth = "1990-04-01";
    const laToday = new Date("2026-11-14T12:00:00Z");
    expect(calculateBiorhythm(birth, now, "America/Los_Angeles")).toEqual(calculateBiorhythm(birth, laToday, "Asia/Tokyo"));
    const la = calculateSaju({ birthDate: birth, now, timeZone: "America/Los_Angeles" });
    const tokyo = calculateSaju({ birthDate: birth, now, timeZone: "Asia/Tokyo" });
    expect(la.today.day).not.toBe(tokyo.today.day);
  });

  it("地域が変わればキャッシュのキーも変わる", async () => {
    const now = new Date("2026-11-15T02:00:00Z");
    const input = { userProfile: { birthDate: "1990-04-01" }, biorhythm: { p: 1, e: 2, i: 3 }, entry: { event: "a" } };
    const tokyo = await analysisCacheKey({ ...input, timeZone: "Asia/Tokyo" }, now);
    const la = await analysisCacheKey({ ...input, timeZone: "America/Los_Angeles" }, now);
    expect(tokyo).not.toBe(la);
    expect(await analysisCacheKey(input, now)).toBe(tokyo);
  });
});
