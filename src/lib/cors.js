// iOS アプリ（Capacitor の WKWebView、オリジン capacitor://localhost）から API を呼ぶための CORS（DECISIONS.md D-21 予定・設計 Ruling 4）。
// Web は同一オリジンなので CORS を使わない。Origin が許可リストに完全一致したときだけヘッダを付け、
// それ以外（Origin なし・他サイト）は応答を一切変えない。`*` と Allow-Credentials は使わない。
// CORS はブラウザの読み取り制限を緩めるだけで、API の防御（レート制限・日次クォータ）には関与しない。

import { isGuardedDeployEnv } from "@/lib/kiriStore";

export const ALLOWED_APP_ORIGINS = Object.freeze(["capacitor://localhost"]);
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";
const EXPOSED_HEADERS = "Retry-After";
const PREFLIGHT_MAX_AGE_SEC = 86400;
const REJECTED_EXTRA_ORIGINS = new Set(["*", "null"]);

// 開発環境に限り KIRI_EXTRA_ALLOWED_ORIGINS（カンマ区切り）を足せる。本番・プレビューでは無視する。
export function allowedOrigins(env = process.env) {
  if (isGuardedDeployEnv(env)) return [...ALLOWED_APP_ORIGINS];
  const extra = String(env.KIRI_EXTRA_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && !REJECTED_EXTRA_ORIGINS.has(origin));
  return [...ALLOWED_APP_ORIGINS, ...extra];
}

function isAllowedOrigin(origin, env) {
  return typeof origin === "string" && origin.length > 0 && allowedOrigins(env).includes(origin);
}

// POST 応答に付けるヘッダ。許可オリジンでなければ空。
export function corsHeadersFor(origin, env = process.env) {
  if (!isAllowedOrigin(origin, env)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    Vary: "Origin",
  };
}

// OPTIONS（プリフライト）。不許可でも 204 を返すが、ヘッダを付けないのでブラウザが本リクエストを止める。
export function preflightResponse(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": String(PREFLIGHT_MAX_AGE_SEC),
      Vary: "Origin",
    },
  });
}

function appendVary(headers, value) {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }
  const parts = current.split(",").map((part) => part.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase())) headers.set("Vary", `${current}, ${value}`);
}

// ルートの POST を包み、全応答（2xx/4xx/5xx/429/503）に CORS ヘッダを付ける。
// getEnv はテスト用。既定ではリクエストごとに process.env を読む。
export function withCors(handler, getEnv = () => process.env) {
  return async function corsHandler(request) {
    const response = await handler(request);
    const headers = corsHeadersFor(request.headers.get("origin"), getEnv());
    for (const [name, value] of Object.entries(headers)) {
      if (name === "Vary") appendVary(response.headers, value);
      else response.headers.set(name, value);
    }
    return response;
  };
}
