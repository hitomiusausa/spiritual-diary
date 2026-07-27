// プロセス内メモリのみで動くAPI保護ユーティリティ。
// 複数インスタンス構成では共有されない(DECISIONS.md D-08)。

const DEFAULT_MAX_KEYS = 1000;

export function createRateLimiter({ windowMs, max, maxKeys = DEFAULT_MAX_KEYS }) {
  const buckets = new Map(); // key -> { windowStart, count }

  function check(key, now = Date.now()) {
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.delete(key);
      buckets.set(key, { windowStart: now, count: 1 });
      if (buckets.size > maxKeys) {
        buckets.delete(buckets.keys().next().value);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count < max) {
      bucket.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { check };
}

export function createDailyQuota({ limit, timeZone = "Asia/Tokyo" }) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let dateKey = null;
  let used = 0;

  function roll(now) {
    const key = formatter.format(now);
    if (key !== dateKey) {
      dateKey = key;
      used = 0;
    }
  }

  function consume(now = Date.now()) {
    roll(now);
    if (used >= limit) return { allowed: false, used, limit };
    used += 1;
    return { allowed: true, used, limit };
  }

  function peek(now = Date.now()) {
    roll(now);
    return { used, limit };
  }

  return { consume, peek };
}

export function clientKeyFromHeaders(headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
