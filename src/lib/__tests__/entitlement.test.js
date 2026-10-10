import { describe, it, expect, vi } from "vitest";
import { checkChatEntitlement, isValidAppUserId } from "../entitlement";
import { createMemoryStore } from "../kiriStore";
import { hashAppUserId } from "../kiriCrypto";

const NOW = Date.UTC(2026, 9, 10, 3, 0, 0);
const SECRET = "s".repeat(40);
const ID = "$RCAnonymousID:0123456789abcdef0123456789abcdef";
const FUTURE = new Date(NOW + 3 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();

const PROD_ENV = {
  KIRI_DEPLOY_ENV: "production",
  KIRI_STORE_SECRET: SECRET,
  REVENUECAT_SECRET_KEY: "sk_test_dummy",
};
const DEV_ENV = { REVENUECAT_SECRET_KEY: "sk_test_dummy", KIRI_STORE_SECRET: SECRET };

function rcResponse(entitlements, status = 200) {
  return new Response(JSON.stringify({ subscriber: { entitlements } }), { status });
}
const activeBody = (expires = FUTURE) => ({ kiri_chat: { expires_date: expires, product_identifier: "p" } });

function setup({ env = PROD_ENV, fetchImpl, store = createMemoryStore({ now: () => NOW }) } = {}) {
  const fetchMock = fetchImpl ?? vi.fn(async () => rcResponse(activeBody()));
  const check = (appUserId = ID, overrides = {}) =>
    checkChatEntitlement({ appUserId, store, fetch: fetchMock, env, now: () => NOW, ...overrides });
  return { fetchMock, store, check };
}

describe("isValidAppUserId", () => {
  it("RevenueCatの匿名ID形式だけを通す", () => {
    expect(isValidAppUserId(ID)).toBe(true);
    for (const bad of [undefined, null, 5, "", "abc", `${ID}0`, ID.toUpperCase(), "$RCAnonymousID:../x", `${ID}/`, "x".repeat(200)]) {
      expect(isValidAppUserId(bad)).toBe(false);
    }
  });
});

describe("checkChatEntitlement (RevenueCat)", () => {
  it("entitlement が未来の期限なら許可し、RC を所定の形で呼ぶ", async () => {
    const { check, fetchMock } = setup();
    const result = await check();
    expect(result).toMatchObject({ allowed: true, reason: "active" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(ID)}`);
    expect(init.headers.Authorization).toBe("Bearer sk_test_dummy");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("結果にIDの平文ではなくハッシュを載せる", async () => {
    const { check } = setup();
    const result = await check();
    expect(result.userHash).toBe(hashAppUserId(SECRET, ID));
    expect(JSON.stringify(result)).not.toContain("RCAnonymousID");
  });

  it("期限切れは拒否する", async () => {
    const { check } = setup({ fetchImpl: vi.fn(async () => rcResponse(activeBody(PAST))) });
    expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
  });

  it("kiri_chat が無い・期限の文字列が壊れている場合は拒否する", async () => {
    for (const body of [{}, { other: { expires_date: FUTURE } }, activeBody("not-a-date")]) {
      const { check } = setup({ fetchImpl: vi.fn(async () => rcResponse(body)) });
      expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
    }
  });

  it("expires_date が null（RC が期限なしで付与した権利）は有効として扱う", async () => {
    const { check } = setup({ fetchImpl: vi.fn(async () => rcResponse({ kiri_chat: { expires_date: null } })) });
    expect(await check()).toMatchObject({ allowed: true, reason: "active" });
  });

  it("期限切れでも grace_period_expires_date が未来なら有効（遅い方を期限にする）", async () => {
    const grace = new Date(NOW + 2 * 24 * 3600 * 1000).toISOString();
    const body = { kiri_chat: { expires_date: PAST, grace_period_expires_date: grace, product_identifier: "p" } };
    const { check, store } = setup({ fetchImpl: vi.fn(async () => rcResponse(body)) });
    expect(await check()).toMatchObject({ allowed: true, reason: "active" });
    // キャッシュの期限も猶予側（遅い方）になる
    const cached = JSON.parse(await store.get(`kiri:ent:${hashAppUserId(SECRET, ID)}`));
    expect(cached.e).toBe(Date.parse(grace));
  });

  it("grace_period_expires_date が過去・null・壊れていれば expires_date だけで判定する", async () => {
    for (const grace of [PAST, null, "not-a-date"]) {
      const body = { kiri_chat: { expires_date: PAST, grace_period_expires_date: grace } };
      const { check } = setup({ fetchImpl: vi.fn(async () => rcResponse(body)) });
      expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
    }
    const early = new Date(NOW + 1000).toISOString();
    const body = { kiri_chat: { expires_date: FUTURE, grace_period_expires_date: early } };
    const { check, store } = setup({ fetchImpl: vi.fn(async () => rcResponse(body)) });
    expect((await check()).allowed).toBe(true);
    expect(JSON.parse(await store.get(`kiri:ent:${hashAppUserId(SECRET, ID)}`)).e).toBe(Date.parse(FUTURE));
  });

  it("サンドボックス購入も有効として扱う", async () => {
    const body = { subscriber: { entitlements: activeBody(), subscriptions: { p: { is_sandbox: true } } } };
    const { check } = setup({ fetchImpl: vi.fn(async () => new Response(JSON.stringify(body))) });
    expect((await check()).allowed).toBe(true);
  });

  it("ID が無い・形式不正なら RC を呼ばずに拒否する", async () => {
    const { check, fetchMock } = setup();
    for (const bad of [null, "", "anonymous", `${ID}x`, 123]) {
      expect(await check(bad)).toMatchObject({ allowed: false, reason: "missing_id" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("秘密キー未設定は権利なし（RC を呼ばない）", async () => {
    const { check, fetchMock } = setup({ env: { ...PROD_ENV, REVENUECAT_SECRET_KEY: "" } });
    expect(await check()).toMatchObject({ allowed: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("2回目はキャッシュ命中で RC を呼ばない（active）", async () => {
    const { check, fetchMock } = setup();
    await check();
    expect(await check()).toMatchObject({ allowed: true, reason: "active" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("active のキャッシュは 600 秒、非 active は 60 秒", async () => {
    const store = { get: vi.fn(async () => null), set: vi.fn(async () => {}), incr: vi.fn() };
    await setup({ store }).check();
    expect(store.set).toHaveBeenCalledWith(`kiri:ent:${hashAppUserId(SECRET, ID)}`, expect.any(String), 600);
    store.set.mockClear();
    await setup({ store, fetchImpl: vi.fn(async () => rcResponse({})) }).check();
    expect(store.set).toHaveBeenCalledWith(expect.stringMatching(/^kiri:ent:/), expect.any(String), 60);
  });

  it("キャッシュの値にもキーにも ID の平文を含めない", async () => {
    const store = createMemoryStore({ now: () => NOW });
    const spy = vi.spyOn(store, "set");
    await setup({ store }).check();
    const [key, value] = spy.mock.calls[0];
    expect(key + value).not.toContain("RCAnonymousID");
  });

  it("active のキャッシュでも、期限を過ぎていれば RC に聞き直す", async () => {
    const { check, fetchMock, store } = setup({ fetchImpl: vi.fn(async () => rcResponse({})) });
    await store.set(`kiri:ent:${hashAppUserId(SECRET, ID)}`, JSON.stringify({ a: 1, e: NOW - 1 }), 600);
    expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("非 active のキャッシュも命中すれば RC を呼ばない", async () => {
    const { check, fetchMock } = setup({ fetchImpl: vi.fn(async () => rcResponse({})) });
    await check();
    expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("RC の障害", () => {
    const warn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

    it("500 でキャッシュも無ければ unavailable（フェイルクローズ）", async () => {
      const w = warn();
      const { check } = setup({ fetchImpl: vi.fn(async () => new Response("boom", { status: 500 })) });
      expect(await check()).toMatchObject({ allowed: false, reason: "unavailable" });
      expect(w.mock.calls.flat().join(" ")).not.toContain("RCAnonymousID");
    });

    it("401（キー違い）や 429 も unavailable で、失敗はキャッシュしない", async () => {
      warn();
      const store = createMemoryStore({ now: () => NOW });
      for (const status of [401, 429]) {
        const { check } = setup({ store, fetchImpl: vi.fn(async () => new Response("x", { status })) });
        expect(await check()).toMatchObject({ allowed: false, reason: "unavailable" });
      }
      expect(await store.get(`kiri:ent:${hashAppUserId(SECRET, ID)}`)).toBeNull();
    });

    it("401/403 は挙動は unavailable のまま、キー違いと分かる error ログを別に出す", async () => {
      warn();
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      for (const status of [401, 403]) {
        const { check } = setup({ fetchImpl: vi.fn(async () => new Response("x", { status })) });
        expect(await check()).toMatchObject({ allowed: false, reason: "unavailable" });
      }
      expect(err).toHaveBeenCalledTimes(2);
      expect(err.mock.calls[0][0]).toBe("[kiri-entitlement] revenuecat auth failed");
      expect(err.mock.calls.flat().join(" ")).not.toMatch(/RCAnonymousID|sk_test/);
      err.mockClear();
      const { check } = setup({ fetchImpl: vi.fn(async () => new Response("x", { status: 429 })) });
      await check();
      expect(err).not.toHaveBeenCalled();
    });

    it("タイムアウト・通信エラーでキャッシュも無ければ unavailable、再試行しない", async () => {
      warn();
      const timeout = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
      const { check, fetchMock } = setup({ fetchImpl: vi.fn(async () => { throw timeout; }) });
      expect(await check()).toMatchObject({ allowed: false, reason: "unavailable" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("JSON が壊れた応答も unavailable", async () => {
      warn();
      const { check } = setup({ fetchImpl: vi.fn(async () => new Response("<html>")) });
      expect(await check()).toMatchObject({ allowed: false, reason: "unavailable" });
    });

    it("RC が落ちていても、有効なキャッシュがあればそれで判定する", async () => {
      warn();
      const { check, store, fetchMock } = setup({ fetchImpl: vi.fn(async () => { throw new Error("down"); }) });
      await store.set(`kiri:ent:${hashAppUserId(SECRET, ID)}`, JSON.stringify({ a: 1, e: NOW + 60_000 }), 600);
      expect(await check()).toMatchObject({ allowed: true, reason: "active" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("聞いている間に別のリクエストが書いたキャッシュがあれば、それを使う", async () => {
      warn();
      const store = createMemoryStore({ now: () => NOW });
      const key = `kiri:ent:${hashAppUserId(SECRET, ID)}`;
      const fetchImpl = vi.fn(async () => {
        await store.set(key, JSON.stringify({ a: 1, e: NOW + 60_000 }), 600);
        throw new Error("down");
      });
      const { check } = setup({ store, fetchImpl });
      expect(await check()).toMatchObject({ allowed: true });
    });
  });

  describe("KIRI_CHAT_PREVIEW", () => {
    it.each(["production", "preview"])("KIRI_DEPLOY_ENV=%s では無視する", async (deployEnv) => {
      const { check, fetchMock } = setup({
        env: { ...PROD_ENV, KIRI_DEPLOY_ENV: deployEnv, KIRI_CHAT_PREVIEW: "1" },
        fetchImpl: vi.fn(async () => rcResponse({})),
      });
      expect(await check()).toMatchObject({ allowed: false, reason: "inactive" });
      expect(fetchMock).toHaveBeenCalled();
    });

    it("VERCEL_ENV=production でも無視する", async () => {
      const { check } = setup({
        env: { ...DEV_ENV, VERCEL_ENV: "production", KIRI_CHAT_PREVIEW: "true", REVENUECAT_SECRET_KEY: "" },
      });
      expect(await check()).toMatchObject({ allowed: false, reason: "not_configured" });
    });

    it.each(["1", "true"])("開発（公開環境でない）では %s で RC を呼ばずに許可する", async (flag) => {
      const { check, fetchMock } = setup({ env: { ...DEV_ENV, KIRI_CHAT_PREVIEW: flag } });
      const result = await check(null);
      expect(result).toMatchObject({ allowed: true, mode: "preview", reason: "preview_enabled" });
      expect(typeof result.userHash).toBe("string");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("開発でも 0・未設定ならバイパスしない", async () => {
      for (const flag of ["0", undefined]) {
        const { check } = setup({ env: { ...DEV_ENV, KIRI_CHAT_PREVIEW: flag } });
        expect((await check(null)).allowed).toBe(false);
      }
    });
  });

  it("開発環境でも ID と秘密キーがあれば RC で判定する", async () => {
    const { check, fetchMock } = setup({ env: DEV_ENV });
    expect((await check()).allowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
