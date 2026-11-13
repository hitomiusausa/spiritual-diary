import { describe, expect, it } from "vitest";
import { isBirthDateNotFuture } from "@/lib/inputContract";

describe("isBirthDateNotFuture (L-08)", () => {
  const now = new Date("2026-11-14T03:00:00Z"); // 2026-11-14 12:00 JST
  it("accepts today and past dates in JST", () => {
    expect(isBirthDateNotFuture("2026-11-14", now)).toBe(true);
    expect(isBirthDateNotFuture("1990-04-01", now)).toBe(true);
  });
  it("rejects dates after today in JST", () => {
    expect(isBirthDateNotFuture("2026-11-15", now)).toBe(false);
    expect(isBirthDateNotFuture("2026-12-31", now)).toBe(false);
  });
  it("uses the JST calendar day, not UTC", () => {
    const lateUtc = new Date("2026-11-14T16:00:00Z"); // 2026-11-15 01:00 JST
    expect(isBirthDateNotFuture("2026-11-15", lateUtc)).toBe(true);
  });
  it("rejects malformed values", () => {
    expect(isBirthDateNotFuture("", now)).toBe(false);
    expect(isBirthDateNotFuture("2026-1-1", now)).toBe(false);
  });
});
