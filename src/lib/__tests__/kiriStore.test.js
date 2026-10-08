import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMemoryStore,
  createUpstashStore,
  redisConfigFromEnv,
  storeReadiness,
  getStoreSecret,
} from "../kiriStore";

const T0 = Date.UTC(2026, 9, 8, 3, 0, 0); // 2026-10-08 12:00 JST
const LONG_SECRET = "s".repeat(32);

function clock(start = T0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe("createMemoryStore", () => {
  it("incrは1から数え、期限が切れたら0から数え直す", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    expect(await store.incr("k", 60)).toBe(1);
    expect(await store.incr("k", 60)).toBe(2);
    c.advance(60_000);
    expect(await store.incr("k", 60)).toBe(1);
  });

  it("incrで期限は延びない（最初の書き込みから数える）", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    await store.incr("k", 60);
    c.advance(50_000);
    await store.incr("k", 60);
    c.advance(10_000);
    expect(await store.incr("k", 60)).toBe(1);
  });

  it("キー数が上限を超えたら古いキーを破棄する", async () => {
    const store = createMemoryStore({ maxKeys: 2, now: () => T0 });
    await store.incr("a", 60);
    await store.incr("b", 60);
    await store.incr("b", 60);
    await store.incr("c", 60); // a が押し出される
    expect(await store.incr("a", 60)).toBe(1);
    expect(await store.incr("c", 60)).toBe(2);
  });
});

// Upstash の Redis クライアントを模した偽物。multi().incr().expire().exec() だけ持つ。
function fakeRedis({ fail = false } = {}) {
  const calls = [];
  const data = new Map();
  const maybeFail = () => {
    if (fail) throw new Error("network down");
  };
  return {
    calls,
    data,
    multi() {
      const ops = [];
      const pipe = {
        incr(key) {
          ops.push(["incr", key]);
          return pipe;
        },
        expire(key, seconds, option) {
          ops.push(["expire", key, seconds, option]);
          return pipe;
        },
        async exec() {
          calls.push(["multi", ops]);
          maybeFail();
          return ops.map(([op, key]) => {
            if (op === "incr") {
              const next = Number(data.get(key) || 0) + 1;
              data.set(key, String(next));
              return next;
            }
            return 1;
          });
        },
      };
      return pipe;
    },
  };
}

describe("createUpstashStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("incrはMULTIでINCRとEXPIRE NXを同時に送る", async () => {
    const client = fakeRedis();
    const store = createUpstashStore({ client });
    expect(await store.incr("kiri:q:analyze:2026-10-08", 172800)).toBe(1);
    expect(await store.incr("kiri:q:analyze:2026-10-08", 172800)).toBe(2);
    expect(client.calls[0]).toEqual([
      "multi",
      [
        ["incr", "kiri:q:analyze:2026-10-08"],
        ["expire", "kiri:q:analyze:2026-10-08", 172800, "NX"],
      ],
    ]);
  });

  it("障害時、incrはメモリへ降格して制限を効かせ続ける", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createUpstashStore({ client: fakeRedis({ fail: true }), fallback: createMemoryStore({ now: () => T0 }) });
    expect(await store.incr("kiri:rl:chat:abc:1", 120)).toBe(1);
    expect(await store.incr("kiri:rl:chat:abc:1", 120)).toBe(2);
    expect(await store.incr("kiri:rl:chat:abc:1", 120)).toBe(3);
    expect(warn).toHaveBeenCalled();
    // 警告にキー（IP由来の値）や例外の本文を含めない
    for (const args of warn.mock.calls) {
      const line = args.map(String).join(" ");
      expect(line).not.toContain("abc");
      expect(line).not.toContain("network down");
    }
  });

});

describe("redisConfigFromEnv", () => {
  it("UPSTASH_REDIS_REST_* を優先し、なければ KV_REST_API_* を使う", () => {
    expect(redisConfigFromEnv({
      UPSTASH_REDIS_REST_URL: "https://u.example",
      UPSTASH_REDIS_REST_TOKEN: "ut",
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kt",
    })).toEqual({ url: "https://u.example", token: "ut" });
    expect(redisConfigFromEnv({ KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "kt" }))
      .toEqual({ url: "https://kv.example", token: "kt" });
  });

  it("URLかトークンが欠けていればnull", () => {
    expect(redisConfigFromEnv({})).toBeNull();
    expect(redisConfigFromEnv({ UPSTASH_REDIS_REST_URL: "https://u.example" })).toBeNull();
  });
});

describe("storeReadiness", () => {
  const configured = {
    UPSTASH_REDIS_REST_URL: "https://u.example",
    UPSTASH_REDIS_REST_TOKEN: "ut",
    KIRI_STORE_SECRET: LONG_SECRET,
  };

  it.each(["production", "preview"])("%s ではRedisと秘密鍵が揃っていればready", (vercelEnv) => {
    expect(storeReadiness({ ...configured, VERCEL_ENV: vercelEnv }).ready).toBe(true);
  });

  it.each(["production", "preview"])("%s ではRedis未設定ならnot ready", (vercelEnv) => {
    expect(storeReadiness({ KIRI_STORE_SECRET: LONG_SECRET, VERCEL_ENV: vercelEnv }).ready).toBe(false);
  });

  it.each(["production", "preview"])("%s では秘密鍵が未設定・32文字未満ならnot ready", (vercelEnv) => {
    const { KIRI_STORE_SECRET: _omit, ...withoutSecret } = configured;
    expect(storeReadiness({ ...withoutSecret, VERCEL_ENV: vercelEnv }).ready).toBe(false);
    expect(storeReadiness({ ...configured, KIRI_STORE_SECRET: "s".repeat(31), VERCEL_ENV: vercelEnv }).ready).toBe(false);
  });

  it.each(["production", "preview"])("KIRI_DEPLOY_ENV=%s（Cloudflare）でもRedisか秘密鍵が欠ければnot ready", (deployEnv) => {
    expect(storeReadiness({ ...configured, KIRI_DEPLOY_ENV: deployEnv }).ready).toBe(true);
    expect(storeReadiness({ KIRI_STORE_SECRET: LONG_SECRET, KIRI_DEPLOY_ENV: deployEnv }).ready).toBe(false);
    const { KIRI_STORE_SECRET: _omit, ...withoutSecret } = configured;
    expect(storeReadiness({ ...withoutSecret, KIRI_DEPLOY_ENV: deployEnv }).ready).toBe(false);
    expect(storeReadiness({ ...configured, KIRI_STORE_SECRET: "s".repeat(31), KIRI_DEPLOY_ENV: deployEnv }).ready).toBe(false);
  });

  it("KIRI_DEPLOY_ENV が development でも VERCEL_ENV=production なら保護を外さない", () => {
    expect(storeReadiness({ KIRI_DEPLOY_ENV: "development", VERCEL_ENV: "production" }).ready).toBe(false);
  });

  it("KIRI_DEPLOY_ENV=development や未設定では、何もなくてもready", () => {
    expect(storeReadiness({ KIRI_DEPLOY_ENV: "development" }).ready).toBe(true);
  });

  it("development や VERCEL_ENV 未設定では、何もなくてもready（メモリ実装）", () => {
    expect(storeReadiness({ VERCEL_ENV: "development" }).ready).toBe(true);
    expect(storeReadiness({}).ready).toBe(true);
  });
});

describe("getStoreSecret", () => {
  it("32文字以上の KIRI_STORE_SECRET があればそれを使う", () => {
    expect(getStoreSecret({ KIRI_STORE_SECRET: LONG_SECRET })).toBe(LONG_SECRET);
  });

  it("未設定なら、プロセス内で一定のランダム値を返す", () => {
    const a = getStoreSecret({});
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(getStoreSecret({})).toBe(a);
  });
});
