import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter, createDailyQuota, createUserDailyQuota, clientKeyFromHeaders, rateLimitPerMin } from "../apiGuard";
import { createMemoryStore } from "../kiriStore";

const T0 = Date.UTC(2026, 6, 28, 3, 0, 0); // 2026-07-28 12:00 JST（分の境界ちょうど）
const fakeHash = (ip) => `h(${ip})`;

// incr の呼び出しを記録する偽ストア。中身はメモリ実装に任せる。
function recordingStore(now = () => T0) {
  const inner = createMemoryStore({ now });
  const calls = [];
  return {
    calls,
    incr: (key, ttl) => {
      calls.push([key, ttl]);
      return inner.incr(key, ttl);
    },
  };
}

function limiterWith(max, store = recordingStore()) {
  return createRateLimiter({ route: "analyze", windowMs: 60_000, max, store, hashKey: fakeHash });
}

describe("createRateLimiter", () => {
  it("上限までは許可し、超えたら拒否する", async () => {
    const limiter = limiterWith(3);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(false);
  });

  it("拒否時に窓の終わりまでのretryAfterSecondsを返す", async () => {
    const limiter = limiterWith(1);
    await limiter.check("ip-a", T0);
    const denied = await limiter.check("ip-a", T0 + 10_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(50);
  });

  it("窓が変わるとカウントが回復する", async () => {
    const limiter = limiterWith(1);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-a", T0 + 30_000)).allowed).toBe(false);
    expect((await limiter.check("ip-a", T0 + 61_000)).allowed).toBe(true);
  });

  it("キーごとに独立してカウントする", async () => {
    const limiter = limiterWith(1);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-b", T0)).allowed).toBe(true);
    expect((await limiter.check("ip-a", T0)).allowed).toBe(false);
  });

  it("ストアのキーはIPのハッシュと分窓番号で、IPの平文を含まない", async () => {
    const store = recordingStore();
    const limiter = createRateLimiter({ route: "chat", windowMs: 60_000, max: 5, store, hashKey: fakeHash });
    await limiter.check("203.0.113.5", T0 + 5_000);
    const [key, ttl] = store.calls[0];
    expect(key).toBe(`kiri:rl:chat:h(203.0.113.5):${Math.floor(T0 / 60_000)}`);
    expect(ttl).toBeGreaterThanOrEqual(60);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it("既定のハッシュ関数ではIPの平文がキーに残らない", async () => {
    const store = recordingStore();
    const limiter = createRateLimiter({ route: "chat", windowMs: 60_000, max: 5, store });
    await limiter.check("203.0.113.5", T0);
    expect(store.calls[0][0]).not.toContain("203.0.113.5");
  });
});

describe("createDailyQuota", () => {
  it("上限まで消費でき、超えたら拒否する", async () => {
    const quota = createDailyQuota({ route: "analyze", limit: 2, store: recordingStore() });
    expect((await quota.consume(T0)).allowed).toBe(true);
    expect((await quota.consume(T0)).allowed).toBe(true);
    const denied = await quota.consume(T0);
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(2);
    expect(denied.limit).toBe(2);
  });

  it("JSTの日付ごとのキーに2日のTTLで数える", async () => {
    const store = recordingStore();
    const quota = createDailyQuota({ route: "chat", limit: 5, store });
    await quota.consume(T0);
    expect(store.calls[0]).toEqual(["kiri:q:chat:2026-07-28", 172_800]);
  });

  it("JSTの日付が変わるとリセットされる", async () => {
    const quota = createDailyQuota({ route: "analyze", limit: 1, store: recordingStore() });
    expect((await quota.consume(T0)).allowed).toBe(true);
    expect((await quota.consume(T0)).allowed).toBe(false);
    // 2026-07-28 23:30 JST → まだ同日
    const sameDay = Date.UTC(2026, 6, 28, 14, 30, 0);
    expect((await quota.consume(sameDay)).allowed).toBe(false);
    // 2026-07-29 00:30 JST → 翌日
    const nextDay = Date.UTC(2026, 6, 28, 15, 30, 0);
    expect((await quota.consume(nextDay)).allowed).toBe(true);
  });

});

describe("createUserDailyQuota", () => {
  it("購読者ごとに数え、上限を超えたら拒否する。他の購読者には影響しない", async () => {
    const quota = createUserDailyQuota({ limit: 2, store: recordingStore() });
    expect((await quota.consume("u1", T0)).allowed).toBe(true);
    expect((await quota.consume("u1", T0)).allowed).toBe(true);
    const denied = await quota.consume("u1", T0);
    expect(denied).toEqual({ allowed: false, used: 2, limit: 2 });
    expect((await quota.consume("u2", T0)).allowed).toBe(true);
  });

  it("キーは kiri:cu:{hash}:{JST日付}、TTL は2日", async () => {
    const store = recordingStore();
    await createUserDailyQuota({ limit: 5, store }).consume("abc", T0);
    expect(store.calls[0]).toEqual(["kiri:cu:abc:2026-07-28", 172_800]);
  });

  it("limit が関数なら呼び出しごとに評価する", async () => {
    let limit = 1;
    const quota = createUserDailyQuota({ limit: () => limit, store: recordingStore() });
    expect((await quota.consume("u", T0)).allowed).toBe(true);
    expect((await quota.consume("u", T0)).allowed).toBe(false);
    limit = 5;
    expect((await quota.consume("u", T0)).allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  const headersOf = (obj) => new Headers(obj);
  const CLOUDFLARE = {}; // Cloudflare Workers には VERCEL / VERCEL_ENV が無い
  const allHeaders = {
    "cf-connecting-ip": "192.0.2.44",
    "x-real-ip": "198.51.100.7",
    "x-forwarded-for": "203.0.113.5, 10.0.0.1",
  };

  describe("Cloudflare（Vercel の環境変数なし）", () => {
    it("cf-connecting-ipを最優先する", () => {
      expect(clientKeyFromHeaders(headersOf(allHeaders), CLOUDFLARE)).toBe("192.0.2.44");
    });

    it("cf-connecting-ipが空白だけなら次の候補を使う", () => {
      const headers = headersOf({ "cf-connecting-ip": "  ", "x-real-ip": "198.51.100.7" });
      expect(clientKeyFromHeaders(headers, CLOUDFLARE)).toBe("198.51.100.7");
    });

    it("cf-connecting-ipがなければx-real-ip、それもなければx-forwarded-forの先頭", () => {
      expect(clientKeyFromHeaders(headersOf({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.5" }), CLOUDFLARE)).toBe("198.51.100.7");
      expect(clientKeyFromHeaders(headersOf({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }), CLOUDFLARE)).toBe("203.0.113.5");
    });

    it("どれもなければunknownを返す", () => {
      expect(clientKeyFromHeaders(headersOf({}), CLOUDFLARE)).toBe("unknown");
    });
  });

  describe("Vercel（VERCEL=1 または VERCEL_ENV あり）", () => {
    it.each([[{ VERCEL: "1" }], [{ VERCEL_ENV: "production" }], [{ VERCEL_ENV: "preview" }]])(
      "%o ではx-real-ipを最優先し、偽装されたcf-connecting-ipを無視する",
      (env) => {
        expect(clientKeyFromHeaders(headersOf(allHeaders), env)).toBe("198.51.100.7");
      },
    );

    it("x-real-ipがなければx-forwarded-forの先頭を使い、cf-connecting-ipは見ない", () => {
      const headers = headersOf({ "cf-connecting-ip": "192.0.2.44", "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
      expect(clientKeyFromHeaders(headers, { VERCEL: "1" })).toBe("203.0.113.5");
      expect(clientKeyFromHeaders(headersOf({ "cf-connecting-ip": "192.0.2.44" }), { VERCEL: "1" })).toBe("unknown");
    });
  });
});

describe("rateLimitPerMin（ルートとテストが同じ上限を使う）", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("既定値は analyze 10・chat 20", () => {
    vi.stubEnv("RATE_LIMIT_ANALYZE_PER_MIN", "");
    vi.stubEnv("RATE_LIMIT_CHAT_PER_MIN", "");
    expect(rateLimitPerMin("analyze")).toBe(10);
    expect(rateLimitPerMin("chat")).toBe(20);
  });

  it("環境変数で上書きできる", () => {
    vi.stubEnv("RATE_LIMIT_ANALYZE_PER_MIN", "3");
    expect(rateLimitPerMin("analyze")).toBe(3);
  });

  it("知らないルートは例外", () => {
    expect(() => rateLimitPerMin("nope")).toThrow();
  });
});
