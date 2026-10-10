// API保護ユーティリティ。カウンタは共有ストア（Upstash Redis／未設定時はメモリ）に置く。
// IPは平文で保存せず、秘密鍵つきのハッシュにしてキーに使う（DECISIONS.md D-08, D-18）。

import { getKiriStore, getStoreSecret } from "@/lib/kiriStore";
import { hashClientIp } from "@/lib/kiriCrypto";

const RATE_LIMIT_TTL_WINDOWS = 2; // 窓の長さの2倍で消える（最長2分）
const DAILY_QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;

// 1分あたりの上限（IPごと）。環境変数で上書きでき、テストも同じ値から回数を決める。
const RATE_LIMITS_PER_MIN = Object.freeze({
  analyze: { env: "RATE_LIMIT_ANALYZE_PER_MIN", fallback: 10 },
  chat: { env: "RATE_LIMIT_CHAT_PER_MIN", fallback: 20 },
});

const defaultStore = () => getKiriStore();
const defaultHashKey = (ip) => hashClientIp(getStoreSecret(), ip);

export function createRateLimiter({ route, windowMs, max, store = defaultStore, hashKey = defaultHashKey }) {
  const resolveStore = typeof store === "function" ? store : () => store;
  const ttlSeconds = Math.ceil((windowMs * RATE_LIMIT_TTL_WINDOWS) / 1000);

  async function check(clientKey, now = Date.now()) {
    const windowIndex = Math.floor(now / windowMs);
    const key = `kiri:rl:${route}:${hashKey(clientKey)}:${windowIndex}`;
    const count = await resolveStore().incr(key, ttlSeconds);
    if (count <= max) return { allowed: true, retryAfterSeconds: 0 };
    const retryAfterSeconds = Math.max(1, Math.ceil(((windowIndex + 1) * windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { check };
}

export function createDailyQuota({ route, limit, timeZone = "Asia/Tokyo", store = defaultStore }) {
  const resolveStore = typeof store === "function" ? store : () => store;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // 上限を超えた呼び出しもカウンタは進むが、usedは上限で頭打ちにして返す。
  // limit は数値か、呼び出しごとに値を返す関数（環境変数の上書きをリクエスト時に読むため）。
  async function consume(now = Date.now()) {
    const max = typeof limit === "function" ? limit() : limit;
    const key = `kiri:q:${route}:${formatter.format(now)}`;
    const count = await resolveStore().incr(key, DAILY_QUOTA_TTL_SECONDS);
    if (count > max) return { allowed: false, used: max, limit: max };
    return { allowed: true, used: count, limit: max };
  }

  return { consume };
}

// 購読者ごとの1日の上限。キーは hashAppUserId の値（IDの平文は使わない）と日本時間の日付。
// limit は数値か、呼び出しごとに値を返す関数（環境変数の上書きをリクエスト時に読むため）。
export function createUserDailyQuota({ limit, timeZone = "Asia/Tokyo", store = defaultStore }) {
  const resolveStore = typeof store === "function" ? store : () => store;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  async function consume(userHash, now = Date.now()) {
    const max = typeof limit === "function" ? limit() : limit;
    const key = `kiri:cu:${userHash}:${formatter.format(now)}`;
    const count = await resolveStore().incr(key, DAILY_QUOTA_TTL_SECONDS);
    if (count > max) return { allowed: false, used: max, limit: max };
    return { allowed: true, used: count, limit: max };
  }

  return { consume };
}

// Vercel 上かどうか。Vercel は VERCEL=1 と VERCEL_ENV を必ず設定する。
function isVercel(env) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}

function firstHeader(headers, name) {
  const value = headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

// クライアントIPはプラットフォームが付けるヘッダーを信じる（DECISIONS.md D-19）。
// - Vercel: x-real-ip → x-forwarded-for の先頭。cf-connecting-ip は利用者が偽装できるので見ない
// - それ以外（Cloudflare Workers）: cf-connecting-ip → x-real-ip → x-forwarded-for の先頭
export function clientKeyFromHeaders(headers, env = process.env) {
  if (!isVercel(env)) {
    const cfIp = firstHeader(headers, "cf-connecting-ip");
    if (cfIp) return cfIp;
  }
  const realIp = firstHeader(headers, "x-real-ip");
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

// 購読者ごとの1日の上限の既定。利用規約・サポートの「60通」と同じ数字（法務テストが照合する）。
// KIRI_CHAT_USER_DAILY_LIMIT での上書きは開発・検証用。本番では設定しない（設定すると法務の文言とずれる）。
export const USER_DAILY_LIMIT_DEFAULT = 60;

export function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function rateLimitPerMin(route) {
  const config = RATE_LIMITS_PER_MIN[route];
  if (!config) throw new Error(`unknown rate limit route: ${route}`);
  return positiveIntEnv(config.env, config.fallback);
}
