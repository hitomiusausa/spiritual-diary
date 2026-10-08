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
  };
  return { ...actual, getKiriStore: () => recording };
});

const { POST: analyzePOST, OPTIONS: analyzeOPTIONS } = await import("@/app/api/analyze/route");
const { POST: chatPOST, OPTIONS: chatOPTIONS } = await import("@/app/api/chat/route");

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

describe("チャットの日次クォータ", () => {
  function stubChatEnv() {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("KIRI_DEPLOY_ENV", "");
    vi.stubEnv("KIRI_CHAT_PREVIEW", "1");
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
  }

  it("危機を検出したときはクォータ（kiri:q:）を消費しない", async () => {
    stubChatEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await chatPOST(jsonRequest({ messages: [{ role: "user", content: "もう死にたい" }] }));
    expect(response.status).toBe(200);
    expect((await response.json()).support).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeCalls.some((key) => key.startsWith("kiri:rl:chat:"))).toBe(true);
    expect(storeCalls.some((key) => key.startsWith("kiri:q:"))).toBe(false);
  });

  it("通常のメッセージではクォータを消費する（対照）", async () => {
    stubChatEnv();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream error", { status: 500 })));
    const response = await chatPOST(jsonRequest({ messages: [{ role: "user", content: "今日は海を見た" }] }));
    expect(response.status).toBe(502);
    expect(storeCalls.some((key) => key.startsWith("kiri:q:chat:"))).toBe(true);
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

  it("/api/chat の 403（チャット無効）にもヘッダが乗る", async () => {
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
    for (let i = 0; i < 11; i += 1) {
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
