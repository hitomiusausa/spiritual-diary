// レート制限・日次クォータのカウンタを置く共有ストア（DECISIONS.md D-18）。
// Upstash Redis が設定されていればそれを、なければプロセス内メモリを使う。
// 日記の本文や分析結果はここに保存しない（キーはIPのハッシュと日付だけ）。

import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

const MEMORY_MAX_KEYS = 2000;
// analyze は incr を2回（レート制限・クォータ）呼ぶので、最悪の待ちは約2秒。
// 障害時はメモリへ降格するため再試行はしない。
const STORE_TIMEOUT_MS = 1000;
const STORE_RETRY = false;
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET_BYTES = 32;
const GUARDED_VERCEL_ENVS = ["production", "preview"];

// incr(key, ttlSec): キーを1増やして新しい値を返す。TTLは最初の書き込み時だけ付ける。
export function createMemoryStore({ maxKeys = MEMORY_MAX_KEYS, now = Date.now } = {}) {
  const entries = new Map(); // key -> { count, expiresAt }

  async function incr(key, ttlSec) {
    const current = now();
    const entry = entries.get(key);
    if (entry && entry.expiresAt > current) {
      entry.count += 1;
      return entry.count;
    }
    entries.delete(key);
    entries.set(key, { count: 1, expiresAt: current + ttlSec * 1000 });
    if (entries.size > maxKeys) {
      entries.delete(entries.keys().next().value);
    }
    return 1;
  }

  return { incr };
}

// client は @upstash/redis の Redis 互換（テストでは偽クライアントを渡す）。
// 障害時（例外・タイムアウト）はプロセス内メモリへ降格し、制限を効かせ続ける。
export function createUpstashStore({ client, fallback = createMemoryStore() }) {
  async function incr(key, ttlSec) {
    try {
      // MULTI/EXEC で INCR と EXPIRE NX を同時に送る（既にTTLがあれば延ばさない）。
      const [count] = await client.multi().incr(key).expire(key, ttlSec, "NX").exec();
      return Number(count);
    } catch (error) {
      // キー（IP由来の値）や例外の本文は出さない。
      console.warn("[kiri-store] incr fell back to memory", error?.name ?? "Error");
      return fallback.incr(key, ttlSec);
    }
  }

  return { incr };
}

export function redisConfigFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

function hasValidSecret(env) {
  return typeof env.KIRI_STORE_SECRET === "string" && env.KIRI_STORE_SECRET.length >= MIN_SECRET_LENGTH;
}

// 本番・プレビューで共有ストアか秘密鍵が欠けていれば not ready（保護なしの公開を防ぐ）。
// 環境変数の変更を拾えるよう、リクエストごとに呼ぶ。
export function storeReadiness(env = process.env) {
  if (!GUARDED_VERCEL_ENVS.includes(env.VERCEL_ENV)) return { ready: true };
  return { ready: Boolean(redisConfigFromEnv(env)) && hasValidSecret(env) };
}

let devSecret = null;

// 開発時に KIRI_STORE_SECRET がなければ、プロセス起動ごとのランダム値を使う。
export function getStoreSecret(env = process.env) {
  if (hasValidSecret(env)) return env.KIRI_STORE_SECRET;
  devSecret ??= randomBytes(DEV_SECRET_BYTES).toString("base64url");
  return devSecret;
}

let sharedStore = null;

export function getKiriStore(env = process.env) {
  if (sharedStore) return sharedStore;
  const config = redisConfigFromEnv(env);
  sharedStore = config
    ? createUpstashStore({
        client: new Redis({
          url: config.url,
          token: config.token,
          automaticDeserialization: false,
          signal: () => AbortSignal.timeout(STORE_TIMEOUT_MS),
          retry: STORE_RETRY,
        }),
      })
    : createMemoryStore();
  return sharedStore;
}
