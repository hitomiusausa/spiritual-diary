import { describe, it, expect, vi, afterEach } from "vitest";

// ルートが使う共有ストアを、incr の呼び出しを記録するメモリ実装に差し替える。
const storeCalls = vi.hoisted(() => []);
vi.mock("@/lib/kiriStore", async (importOriginal) => {
  const actual = await importOriginal();
  const inner = actual.createMemoryStore();
  const recording = {
    incr: (key, ttl) => {
      storeCalls.push(key);
      return inner.incr(key, ttl);
    },
    get: (key) => inner.get(key),
    set: (key, value, ttl) => inner.set(key, value, ttl),
  };
  return { ...actual, getKiriStore: () => recording };
});

const { rateLimitPerMin } = await import("@/lib/apiGuard");
const { POST: analyzePOST, OPTIONS: analyzeOPTIONS } = await import("@/app/api/analyze/route.api");
const { POST: chatPOST, OPTIONS: chatOPTIONS } = await import("@/app/api/chat/route.api");

const APP_ORIGIN = "capacitor://localhost";

let ipCounter = 0;
function jsonRequest(body, extraHeaders = {}) {
  ipCounter += 1;
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `203.0.113.${ipCounter}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  storeCalls.length = 0;
});

describe("共有ストア未設定の本番・プレビュー", () => {
  it.each([
    ["analyze", "KIRI_DEPLOY_ENV", analyzePOST],
    ["chat", "KIRI_DEPLOY_ENV", chatPOST],
    ["analyze", "VERCEL_ENV", analyzePOST],
    ["chat", "VERCEL_ENV", chatPOST],
  ])("/api/%s は503を返し、詳細を出さない（%s=production）", async (_name, envName, POST) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "");
    vi.stubEnv(envName, "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("KIRI_STORE_SECRET", "");
    vi.stubEnv("KIRI_CHAT_PREVIEW", "1");
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, error: "Service unavailable" });
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain("store not configured");
    expect(storeCalls).toEqual([]);
  });
});

const RC_ID = "$RCAnonymousID:0123456789abcdef0123456789abcdef";
const RC_ID_2 = "$RCAnonymousID:fedcba9876543210fedcba9876543210";
const FUTURE = () => new Date(Date.now() + 86_400_000).toISOString();

function chatRequest(content, extra = {}, headers = {}) {
  return jsonRequest({ messages: [{ role: "user", content }], ...extra }, headers);
}

function anthropicOk() {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: "霧が少し晴れたね。" }], usage: { input_tokens: 123, output_tokens: 45 } })
  );
}

describe("チャットの判定順と上限", () => {
  // 開発（公開環境でない）＋プレビューのバイパス。
  function stubDevChatEnv() {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "");
    vi.stubEnv("KIRI_CHAT_PREVIEW", "1");
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
  }
  // 本番相当。ストアはモックなので Redis のURLは形だけ。RC は fetch のスタブで答える。
  function stubProdChatEnv() {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubEnv("KIRI_STORE_SECRET", "s".repeat(40));
    vi.stubEnv("KIRI_CHAT_PREVIEW", "1"); // 本番では無視される
    vi.stubEnv("REVENUECAT_SECRET_KEY", "sk_test");
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
  }
  // RC には expires を返し、Anthropic には本文を返す。
  function routedFetch({ entitlements = { kiri_chat: { expires_date: FUTURE() } }, rcStatus = 200 } = {}) {
    return vi.fn(async (url) =>
      String(url).startsWith("https://api.revenuecat.com/")
        ? new Response(JSON.stringify({ subscriber: { entitlements } }), { status: rcStatus })
        : anthropicOk()
    );
  }
  const anthropicCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://api.anthropic.com/"));

  it("危機を検出したときは権利判定もクォータ（kiri:q: / kiri:cu:）も使わず、固定文を返す（開発）", async () => {
    stubDevChatEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("もう死にたい"));
    expect(response.status).toBe(200);
    expect((await response.json()).support).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeCalls.some((key) => key.startsWith("kiri:rl:chat:"))).toBe(true);
    expect(storeCalls.some((key) => key.startsWith("kiri:q:") || key.startsWith("kiri:cu:"))).toBe(false);
  });

  it("危機の言葉は、権利なし・ID なしの本番でも固定文を返し、RC もAIも呼ばない", async () => {
    stubProdChatEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = routedFetch({ entitlements: {} });
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("もう死にたい"));
    expect(response.status).toBe(200);
    expect((await response.json()).support).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeCalls.some((key) => key.startsWith("kiri:q:") || key.startsWith("kiri:cu:"))).toBe(false);
  });

  it("通常のメッセージでは購読者別と全体のクォータを消費する（対照）", async () => {
    stubDevChatEnv();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream error", { status: 500 })));
    const response = await chatPOST(chatRequest("今日は海を見た"));
    expect(response.status).toBe(502);
    expect(storeCalls.some((key) => key.startsWith("kiri:cu:"))).toBe(true);
    expect(storeCalls.some((key) => key.startsWith("kiri:q:chat:"))).toBe(true);
  });

  it("本番: 購読が有効なら 200 を返し、トークン実測ログを出す（本文は出さない）", async () => {
    stubProdChatEnv();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("今日は海を見た", { appUserId: RC_ID }));
    expect(response.status).toBe(200);
    expect((await response.json()).reply).toBe("霧が少し晴れたね。");
    const lines = log.mock.calls.map((args) => args.join(" "));
    expect(lines).toContain("[kiri-usage] chat tokens 123 45");
    expect(lines.join("\n")).not.toContain("今日は海を見た");
    expect(lines.join("\n")).not.toContain("RCAnonymousID");
  });

  it("本番: Redis に入るキーに ID の平文を含めない", async () => {
    stubProdChatEnv();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", routedFetch());
    await chatPOST(chatRequest("やあ", { appUserId: RC_ID }));
    expect(storeCalls.some((key) => key.startsWith("kiri:cu:"))).toBe(true);
    expect(storeCalls.join("\n")).not.toContain("RCAnonymousID");
  });

  it("本番: appUserId が無いと 403 not_entitled（KIRI_CHAT_PREVIEW=1 でも）。RC も AI も呼ばない", async () => {
    stubProdChatEnv();
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("やあ"));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("not_entitled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("本番: 期限切れの購読は 403 not_entitled で、AI を呼ばず、クォータも消費しない", async () => {
    stubProdChatEnv();
    const fetchMock = routedFetch({ entitlements: { kiri_chat: { expires_date: new Date(Date.now() - 1000).toISOString() } } });
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("やあ", { appUserId: RC_ID_2 }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("not_entitled");
    expect(anthropicCalls(fetchMock)).toHaveLength(0);
    expect(storeCalls.some((key) => key.startsWith("kiri:cu:") || key.startsWith("kiri:q:"))).toBe(false);
  });

  it("本番: RC が落ちていて古いキャッシュも無ければ 503 chat_unavailable", async () => {
    stubProdChatEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = routedFetch({ rcStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("やあ", { appUserId: "$RCAnonymousID:00000000000000000000000000000001" }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("chat_unavailable");
    expect(anthropicCalls(fetchMock)).toHaveLength(0);
  });

  it("本番: REVENUECAT_SECRET_KEY が未設定なら 403（フェイルクローズ）", async () => {
    stubProdChatEnv();
    vi.stubEnv("REVENUECAT_SECRET_KEY", "");
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(chatRequest("やあ", { appUserId: RC_ID }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("not_entitled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("購読者ごとの日次上限を超えると 429 user_daily_limit。AI は呼ばず、別の購読者は通る", async () => {
    stubProdChatEnv();
    vi.stubEnv("KIRI_CHAT_USER_DAILY_LIMIT", "2");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const send = (id) => chatPOST(chatRequest("やあ", { appUserId: id }));
    expect((await send("$RCAnonymousID:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1")).status).toBe(200);
    expect((await send("$RCAnonymousID:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1")).status).toBe(200);
    const denied = await send("$RCAnonymousID:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1");
    expect(denied.status).toBe(429);
    expect((await denied.json()).code).toBe("user_daily_limit");
    expect(anthropicCalls(fetchMock)).toHaveLength(2);
    expect((await send("$RCAnonymousID:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2")).status).toBe(200);
  });

  it("全体の日次上限（DAILY_LIMIT_CHAT）は購読者別の後に判定し、429 daily_limit を返す", async () => {
    stubProdChatEnv();
    vi.stubEnv("DAILY_LIMIT_CHAT", "1");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const POST = chatPOST;
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const id = "$RCAnonymousID:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";
    // このファイルのテストは同じ日のカウンタを共有するので、先に十分な上限で1回通してから1に絞る。
    vi.stubEnv("DAILY_LIMIT_CHAT", "100000");
    const probe = await POST(chatRequest("やあ", { appUserId: id }));
    expect(probe.status).toBe(200);
    vi.stubEnv("DAILY_LIMIT_CHAT", "1");
    const denied = await POST(chatRequest("やあ", { appUserId: id }));
    expect(denied.status).toBe(429);
    expect((await denied.json()).code).toBe("daily_limit");
    expect(anthropicCalls(fetchMock)).toHaveLength(1); // 2回目はAIを呼ばない
  });

  it("IP のレート制限は body の解析・権利判定より前に効く（権利なしの人にも 429 rate_limited）", async () => {
    stubProdChatEnv();
    const fetchMock = routedFetch({ entitlements: {} });
    vi.stubGlobal("fetch", fetchMock);
    const headers = { "x-real-ip": "198.51.100.200" };
    let response;
    for (let i = 0; i < rateLimitPerMin("chat") + 1; i += 1) {
      response = await chatPOST(chatRequest("やあ", {}, headers));
    }
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("CORS（iOS アプリ capacitor://localhost）", () => {
  function stubDevEnv() {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "");
    vi.stubEnv("KIRI_EXTRA_ALLOWED_ORIGINS", "");
  }

  function preflight(origin) {
    return new Request("http://localhost/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
  }

  function expectCors(response) {
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  }

  it.each([
    ["analyze", () => analyzeOPTIONS],
    ["chat", () => chatOPTIONS],
  ])("/api/%s の OPTIONS は許可オリジンに 204 とヘッダを返す", async (_name, get) => {
    stubDevEnv();
    const response = await get()(preflight(APP_ORIGIN));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(storeCalls).toEqual([]);
  });

  it.each([
    ["analyze", () => analyzeOPTIONS],
    ["chat", () => chatOPTIONS],
  ])("/api/%s の OPTIONS は他サイトのオリジンにヘッダを付けない", async (_name, get) => {
    stubDevEnv();
    const response = await get()(preflight("https://evil.example"));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it.each([
    ["analyze", () => analyzePOST],
    ["chat", () => chatPOST],
  ])("/api/%s の 503（共有ストア未設定）にもヘッダが乗る", async (_name, get) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("KIRI_STORE_SECRET", "");
    const response = await get()(jsonRequest({}, { Origin: APP_ORIGIN }));
    expect(response.status).toBe(503);
    expectCors(response);
  });

  it("/api/analyze の 400（空の入力）にもヘッダが乗る", async () => {
    stubDevEnv();
    const response = await analyzePOST(jsonRequest({}, { Origin: APP_ORIGIN }));
    expect(response.status).toBe(400);
    expectCors(response);
  });

  it("/api/chat の 403（権利なし）にもヘッダが乗る", async () => {
    stubDevEnv();
    vi.stubEnv("KIRI_CHAT_PREVIEW", "");
    const response = await chatPOST(jsonRequest({ messages: [{ role: "user", content: "やあ" }] }, { Origin: APP_ORIGIN }));
    expect(response.status).toBe(403);
    expectCors(response);
  });

  it("/api/analyze の 429（レート制限）にもヘッダと Retry-After が乗る", async () => {
    stubDevEnv();
    const headers = { Origin: APP_ORIGIN, "x-real-ip": "198.51.100.77" };
    let response;
    // ルートと同じ上限（RATE_LIMIT_ANALYZE_PER_MIN・既定10）から回数を決める。上限＋1回目で 429。
    const attempts = rateLimitPerMin("analyze") + 1;
    for (let i = 0; i < attempts; i += 1) {
      response = await analyzePOST(new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: "{}",
      }));
    }
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expectCors(response);
  });

  it("Origin なし（Web の同一オリジン）では CORS ヘッダを付けない", async () => {
    stubDevEnv();
    const response = await analyzePOST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("他サイトのオリジンからの POST には CORS ヘッダを付けない", async () => {
    stubDevEnv();
    const response = await analyzePOST(jsonRequest({}, { Origin: "https://evil.example" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
