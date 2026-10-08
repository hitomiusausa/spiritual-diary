import { describe, it, expect } from "vitest";
import {
  ALLOWED_APP_ORIGINS,
  allowedOrigins,
  corsHeadersFor,
  preflightResponse,
  withCors,
} from "@/lib/cors";

const APP = "capacitor://localhost";
const DEV_ENV = {};
const PROD_ENV = { KIRI_DEPLOY_ENV: "production" };

function req(method, origin, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (origin !== undefined) headers.Origin = origin;
  return new Request("http://localhost/api/analyze", { method, headers });
}

describe("許可リスト", () => {
  it("アプリのオリジンは capacitor://localhost だけ", () => {
    expect(ALLOWED_APP_ORIGINS).toEqual([APP]);
    expect(allowedOrigins(DEV_ENV)).toEqual([APP]);
  });

  it("Web 本番のオリジンは入れない（同一オリジンなので不要）", () => {
    expect(allowedOrigins(PROD_ENV)).not.toContain("https://kiri.kugainc.com");
  });

  it("開発環境では KIRI_EXTRA_ALLOWED_ORIGINS を足せる", () => {
    const env = { KIRI_EXTRA_ALLOWED_ORIGINS: " http://localhost:3000 , http://192.168.1.5:3000 " };
    expect(allowedOrigins(env)).toEqual([APP, "http://localhost:3000", "http://192.168.1.5:3000"]);
  });

  it.each([
    [{ KIRI_DEPLOY_ENV: "production" }],
    [{ KIRI_DEPLOY_ENV: "preview" }],
    [{ VERCEL_ENV: "production" }],
  ])("本番・プレビューでは KIRI_EXTRA_ALLOWED_ORIGINS を無視する（%o）", (env) => {
    expect(allowedOrigins({ ...env, KIRI_EXTRA_ALLOWED_ORIGINS: "https://evil.example" })).toEqual([APP]);
  });

  it("追加リストでも * と null は受け付けない", () => {
    expect(allowedOrigins({ KIRI_EXTRA_ALLOWED_ORIGINS: "*,null,," })).toEqual([APP]);
  });
});

describe("corsHeadersFor", () => {
  it("許可オリジンは echo ＋ Vary ＋ Expose-Headers: Retry-After", () => {
    expect(corsHeadersFor(APP, DEV_ENV)).toEqual({
      "Access-Control-Allow-Origin": APP,
      "Access-Control-Expose-Headers": "Retry-After",
      Vary: "Origin",
    });
  });

  it.each([
    ["https://evil.example"],
    ["capacitor://localhost.evil.example"],
    ["Capacitor://localhost"],
    ["capacitor://localhost/"],
    ["null"],
    [""],
    [null],
    [undefined],
  ])("完全一致しないオリジン %s にはヘッダを付けない", (origin) => {
    expect(corsHeadersFor(origin, DEV_ENV)).toEqual({});
  });
});

describe("preflightResponse（OPTIONS）", () => {
  it("許可オリジンには 204 と CORS ヘッダ", () => {
    const res = preflightResponse(
      req("OPTIONS", APP, { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" }),
      DEV_ENV,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("不許可オリジンには 204 だが CORS ヘッダを付けない（ブラウザが拒否する）", () => {
    const res = preflightResponse(req("OPTIONS", "https://evil.example"), DEV_ENV);
    expect(res.status).toBe(204);
    for (const name of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "Access-Control-Max-Age",
      "Access-Control-Allow-Credentials",
    ]) {
      expect(res.headers.get(name)).toBeNull();
    }
  });

  it("本番では追加オリジンを無視する", () => {
    const env = { ...PROD_ENV, KIRI_EXTRA_ALLOWED_ORIGINS: "http://localhost:3000" };
    const res = preflightResponse(req("OPTIONS", "http://localhost:3000"), env);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("withCors（POST の全応答）", () => {
  const handlerFor = (status, headers = {}) => async () =>
    new Response(JSON.stringify({ success: status < 400 }), { status, headers: { "Content-Type": "application/json", ...headers } });

  it.each([[200], [400], [403], [429], [500], [502], [503]])(
    "許可オリジンなら %i 応答にも Allow-Origin が乗る",
    async (status) => {
      const res = await withCors(handlerFor(status), () => DEV_ENV)(req("POST", APP));
      expect(res.status).toBe(status);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP);
      expect(res.headers.get("Vary")).toBe("Origin");
      expect(res.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    },
  );

  it("429 の Retry-After を残す", async () => {
    const res = await withCors(handlerFor(429, { "Retry-After": "12" }), () => DEV_ENV)(req("POST", APP));
    expect(res.headers.get("Retry-After")).toBe("12");
  });

  it("Origin なし（Web の同一オリジン fetch）では応答を変えない", async () => {
    const res = await withCors(handlerFor(200), () => DEV_ENV)(req("POST", undefined));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("不許可オリジンではヘッダを付けない", async () => {
    const res = await withCors(handlerFor(400), () => DEV_ENV)(req("POST", "https://evil.example"));
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("既存の Vary を壊さず Origin を足す", async () => {
    const res = await withCors(handlerFor(200, { Vary: "Accept-Encoding" }), () => DEV_ENV)(req("POST", APP));
    expect(res.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });

  it("既定では process.env を読む", async () => {
    const res = await withCors(handlerFor(200))(req("POST", APP));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP);
  });
});
