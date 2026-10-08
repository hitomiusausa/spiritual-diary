// API保護ユーティリティ。カウンタは共有ストア（Upstash Redis／未設定時はメモリ）に置く。
// IPは平文で保存せず、秘密鍵つきのハッシュにしてキーに使う（DECISIONS.md D-08, D-18）。

import { getKiriStore, getStoreSecret } from "@/lib/kiriStore";
import { hashClientIp } from "@/lib/kiriCrypto";

const RATE_LIMIT_TTL_WINDOWS = 2; // 窓の長さの2倍で消える（最長2分）
const DAILY_QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;

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
  async function consume(now = Date.now()) {
    const key = `kiri:q:${route}:${formatter.format(now)}`;
    const count = await resolveStore().incr(key, DAILY_QUOTA_TTL_SECONDS);
    if (count > limit) return { allowed: false, used: limit, limit };
    return { allowed: true, used: count, limit };
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

export function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
