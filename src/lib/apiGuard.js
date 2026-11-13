// API保護ユーティリティ。カウンタは共有ストア（Upstash Redis／未設定時はメモリ）に置く。
// IPは平文で保存せず、秘密鍵つきのハッシュにしてキーに使う（DECISIONS.md D-08, D-18）。

import { getKiriStore, getStoreSecret } from "@/lib/kiriStore";
import { hashClientIp } from "@/lib/kiriCrypto";

const RATE_LIMIT_TTL_WINDOWS = 2; // 窓の長さの2倍で消える（最長2分）
const DAILY_QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;
// IPv6 は利用者が /64 をまるごと持つことが多いので、先頭64ビット（4グループ）でまとめて数える（S-04）。
const IPV6_GROUPS = 8;
const IPV6_PREFIX_GROUPS = 4;
// 読み解きの IP ごとの1日の上限（S-01）。全体の上限より前に判定し、1つの IP で全体の枠を使い切れないようにする。
// DAILY_LIMIT_ANALYZE_PER_IP で上書きできる（リクエスト時に読む）。
export const IP_DAILY_LIMIT_ANALYZE_DEFAULT = 10;

// 1分あたりの上限（IPごと）。環境変数で上書きでき、テストも同じ値から回数を決める。
const RATE_LIMITS_PER_MIN = Object.freeze({
  analyze: { env: "RATE_LIMIT_ANALYZE_PER_MIN", fallback: 10 },
  chat: { env: "RATE_LIMIT_CHAT_PER_MIN", fallback: 20 },
});

const defaultStore = () => getKiriStore();
const defaultHashKey = (ip) => hashClientIp(getStoreSecret(), ip);

function jstDateFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/;

// "a:b::c" を8グループの配列に広げる。形式が不正なら null。
function expandIpv6(address) {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const split = (part) => (part ? part.split(":") : []);
  const head = split(halves[0]);
  const tail = halves.length === 2 ? split(halves[1]) : [];
  if (halves.length === 1 && head.length !== IPV6_GROUPS) return null;
  const missing = IPV6_GROUPS - head.length - tail.length;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  if (groups.length !== IPV6_GROUPS || !groups.every((group) => IPV6_GROUP_PATTERN.test(group))) return null;
  return groups.map((group) => group.replace(/^0+(?=.)/, ""));
}

// 制限のキーに使うクライアントの値。IPv4 はそのまま、IPv6 は /64 の接頭辞にまとめる（S-04）。
// IPv4 射影アドレス（::ffff:a.b.c.d）は IPv4 として扱う。形式がわからないものは元の文字列のまま。
export function ipLimitKey(raw) {
  const value = String(raw ?? "").trim();
  if (!value.includes(":")) return value;
  const address = value.toLowerCase().replace(/%.*$/, "");
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped && IPV4_PATTERN.test(mapped[1])) return mapped[1];
  const groups = expandIpv6(address);
  if (!groups) return value;
  return `${groups.slice(0, IPV6_PREFIX_GROUPS).join(":")}::/64`;
}

export function createRateLimiter({ route, windowMs, max, store = defaultStore, hashKey = defaultHashKey }) {
  const resolveStore = typeof store === "function" ? store : () => store;
  const ttlSeconds = Math.ceil((windowMs * RATE_LIMIT_TTL_WINDOWS) / 1000);

  async function check(clientKey, now = Date.now()) {
    const windowIndex = Math.floor(now / windowMs);
    const key = `kiri:rl:${route}:${hashKey(ipLimitKey(clientKey))}:${windowIndex}`;
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

// IP ごとの1日の上限（S-01）。キーは kiri:qi:{route}:{IPハッシュ}:{JST日付}（IPの平文は使わない）。
// limit は数値か、呼び出しごとに値を返す関数（環境変数の上書きをリクエスト時に読むため）。
export function createIpDailyQuota({ route, limit, timeZone = "Asia/Tokyo", store = defaultStore, hashKey = defaultHashKey }) {
  const resolveStore = typeof store === "function" ? store : () => store;
  const formatter = jstDateFormatter(timeZone);

  async function consume(clientKey, now = Date.now()) {
    const max = typeof limit === "function" ? limit() : limit;
    const key = `kiri:qi:${route}:${hashKey(ipLimitKey(clientKey))}:${formatter.format(now)}`;
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
