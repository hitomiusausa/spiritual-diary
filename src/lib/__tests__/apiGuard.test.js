import { describe, it, expect } from "vitest";
import { createRateLimiter, createDailyQuota, clientKeyFromHeaders } from "../apiGuard";

const T0 = Date.UTC(2026, 6, 28, 3, 0, 0); // 2026-07-28 12:00 JST

describe("createRateLimiter", () => {
  it("上限までは許可し、超えたら拒否する", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
    expect(limiter.check("ip-a", T0).allowed).toBe(false);
  });

  it("拒否時にretryAfterSecondsを返す", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.check("ip-a", T0);
    const denied = limiter.check("ip-a", T0 + 10_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("ウィンドウが経過するとカウントが回復する", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
    expect(limiter.check("ip-a", T0 + 30_000).allowed).toBe(false);
    expect(limiter.check("ip-a", T0 + 61_000).allowed).toBe(true);
  });

  it("キーごとに独立してカウントする", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
    expect(limiter.check("ip-b", T0).allowed).toBe(true);
    expect(limiter.check("ip-a", T0).allowed).toBe(false);
  });

  it("キー数が上限を超えたら古いキーを破棄する", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 2 });
    limiter.check("ip-a", T0);
    limiter.check("ip-b", T0);
    limiter.check("ip-c", T0); // ip-a が押し出される
    expect(limiter.check("ip-a", T0).allowed).toBe(true);
  });
});

describe("createDailyQuota", () => {
  it("上限まで消費でき、超えたら拒否する", () => {
    const quota = createDailyQuota({ limit: 2 });
    expect(quota.consume(T0).allowed).toBe(true);
    expect(quota.consume(T0).allowed).toBe(true);
    const denied = quota.consume(T0);
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(2);
    expect(denied.limit).toBe(2);
  });

  it("JSTの日付が変わるとリセットされる", () => {
    const quota = createDailyQuota({ limit: 1 });
    expect(quota.consume(T0).allowed).toBe(true);
    expect(quota.consume(T0).allowed).toBe(false);
    // 2026-07-28 23:30 JST → まだ同日
    const sameDay = Date.UTC(2026, 6, 28, 14, 30, 0);
    expect(quota.consume(sameDay).allowed).toBe(false);
    // 2026-07-29 00:30 JST → 翌日
    const nextDay = Date.UTC(2026, 6, 28, 15, 30, 0);
    expect(quota.consume(nextDay).allowed).toBe(true);
  });

  it("peekは消費せずに現在値を返す", () => {
    const quota = createDailyQuota({ limit: 5 });
    quota.consume(T0);
    expect(quota.peek(T0).used).toBe(1);
    expect(quota.peek(T0).used).toBe(1);
  });
});

describe("clientKeyFromHeaders", () => {
  const headersOf = (obj) => new Headers(obj);

  it("x-forwarded-forの先頭IPを使う", () => {
    const headers = headersOf({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientKeyFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("x-forwarded-forがなければx-real-ipを使う", () => {
    const headers = headersOf({ "x-real-ip": "198.51.100.7" });
    expect(clientKeyFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("どちらもなければunknownを返す", () => {
    expect(clientKeyFromHeaders(headersOf({}))).toBe("unknown");
  });
});
