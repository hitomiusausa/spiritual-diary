// チャット(有料オプション)のサーバー側entitlement判定（DECISIONS.md D-07, D-26, 設計書 Ruling 3・4）。
// クライアントから渡されるのは匿名のApp User IDだけで、権利の有無はここでRevenueCatに聞いて決める。
// IDの平文はRedisのキー・値・ログのどこにも残さない（HMACのハッシュだけ）。

import { getKiriStore, getStoreSecret, isGuardedDeployEnv } from "@/lib/kiriStore";
import { hashAppUserId } from "@/lib/kiriCrypto";

export const ENTITLEMENT_ID = "kiri_chat";
// 実機で確認するまでの想定形式。ここ1か所を直せば全体に効く。
const APP_USER_ID_PATTERN = /^\$RCAnonymousID:[0-9a-f]{32}$/;
const APP_USER_ID_MAX_LENGTH = 100;
const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1/subscribers/";
const REVENUECAT_TIMEOUT_MS = 3000;
const CACHE_PREFIX = "kiri:ent:";
const CACHE_TTL_ACTIVE_SEC = 600;
const CACHE_TTL_INACTIVE_SEC = 60;
// 開発プレビューで appUserId が無いときの購読者別カウンタ用の固定ID（本番では使われない）。
const PREVIEW_USER_ID = "dev-preview";

export function isValidAppUserId(id) {
  return typeof id === "string" && id.length <= APP_USER_ID_MAX_LENGTH && APP_USER_ID_PATTERN.test(id);
}

function previewBypassEnabled(env) {
  // 本番・プレビュー環境ではどんな設定でも無視する（設定ミスで有料機能が開かないように）。
  if (isGuardedDeployEnv(env)) return false;
  const preview = String(env.KIRI_CHAT_PREVIEW || "").toLowerCase();
  return preview === "1" || preview === "true";
}

// キャッシュの形: {"a":1,"e":<期限のms。無期限なら省略>} か {"a":0}
function decodeCache(raw, now) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.a === 0) return { active: false };
    if (parsed?.a === 1) {
      if (parsed.e === undefined) return { active: true };
      // 期限を過ぎた active は使わない（聞き直す）。
      if (Number.isFinite(parsed.e) && parsed.e > now) return { active: true };
    }
  } catch {
    // 壊れた値は無かったことにする
  }
  return null;
}

// RevenueCat v1 の応答から kiri_chat の有効性を読む。
// sandbox 購入も同じく有効（App Review はサンドボックスで購入するため、弾かない）。
// expires_date が null は「期限なし」で、RevenueCat 側が付与した恒久権利（運営者のプロモ付与など）。
// 偽造できる値ではない（RC が返す）ので有効にする。キーが無い・日付が読めない場合は無効。
function readEntitlement(data, now) {
  const entitlement = data?.subscriber?.entitlements?.[ENTITLEMENT_ID];
  if (!entitlement) return { active: false };
  if (entitlement.expires_date === null) return { active: true };
  // grace period（支払い失敗の猶予）: RC v1 のこのフィールド名・位置は実物で未確認。
  // あれば expires_date と遅い方を期限にする。無い・読めない場合は expires_date だけで判定する。
  const dates = [entitlement.expires_date, entitlement.grace_period_expires_date].map((d) => Date.parse(d)).filter(Number.isFinite);
  const expires = dates.length ? Math.max(...dates) : NaN;
  if (Number.isFinite(expires) && expires > now) return { active: true, expiresAt: expires };
  return { active: false };
}

async function fetchFromRevenueCat({ appUserId, secretKey, fetchImpl, now }) {
  try {
    const response = await fetchImpl(`${REVENUECAT_API_BASE}${encodeURIComponent(appUserId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REVENUECAT_TIMEOUT_MS),
    });
    if (!response.ok) {
      // キー違い・権限不足は運営側の設定ミス。購読者には 503 のままだが、運営が気づけるよう別に出す。
      if (response.status === 401 || response.status === 403) console.error("[kiri-entitlement] revenuecat auth failed");
      console.warn("[kiri-entitlement] revenuecat status", response.status);
      return null;
    }
    return readEntitlement(await response.json(), now);
  } catch (error) {
    // ID・キー・例外の本文は出さない。
    console.warn("[kiri-entitlement] revenuecat unavailable", error?.name ?? "Error");
    return null;
  }
}

export async function checkChatEntitlement({
  appUserId,
  store = getKiriStore(),
  fetch: fetchImpl = globalThis.fetch,
  env = process.env,
  now = Date.now,
} = {}) {
  const secret = getStoreSecret(env);

  if (previewBypassEnabled(env)) {
    const id = isValidAppUserId(appUserId) ? appUserId : PREVIEW_USER_ID;
    return { allowed: true, mode: "preview", reason: "preview_enabled", userHash: hashAppUserId(secret, id) };
  }

  if (!isValidAppUserId(appUserId)) {
    return { allowed: false, mode: "revenuecat", reason: "missing_id" };
  }
  const userHash = hashAppUserId(secret, appUserId);
  const result = (allowed, reason) => ({ allowed, mode: "revenuecat", reason, userHash });

  const secretKey = env.REVENUECAT_SECRET_KEY;
  if (!secretKey) return result(false, "not_configured");

  const cacheKey = `${CACHE_PREFIX}${userHash}`;
  const cached = decodeCache(await store.get(cacheKey), now());
  if (cached) return cached.active ? result(true, "active") : result(false, "inactive");

  const fetched = await fetchFromRevenueCat({ appUserId, secretKey, fetchImpl, now: now() });
  if (!fetched) {
    // 聞いている間に別のリクエストが書いたキャッシュがあれば、それを使う。無ければ閉じる（費用側に倒す）。
    const retry = decodeCache(await store.get(cacheKey), now());
    if (retry) return retry.active ? result(true, "active") : result(false, "inactive");
    return result(false, "unavailable");
  }

  const payload = fetched.active ? { a: 1, ...(fetched.expiresAt ? { e: fetched.expiresAt } : {}) } : { a: 0 };
  await store.set(cacheKey, JSON.stringify(payload), fetched.active ? CACHE_TTL_ACTIVE_SEC : CACHE_TTL_INACTIVE_SEC);
  return fetched.active ? result(true, "active") : result(false, "inactive");
}
