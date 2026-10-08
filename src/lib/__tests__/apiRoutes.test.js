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

const { POST: analyzePOST } = await import("@/app/api/analyze/route");
const { POST: chatPOST } = await import("@/app/api/chat/route");

let ipCounter = 0;
function jsonRequest(body) {
  ipCounter += 1;
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `203.0.113.${ipCounter}` },
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
