// 分析結果の端末内キャッシュ（DECISIONS.md D-16, D-18）。
// 同じ暦日（利用者の地域の日付・D-45）・同じ入力ならAPIを呼ばずに前回の結果を返し、文章を安定させる。
// サーバーには日記由来のデータを保存しない方針のため、キャッシュは利用者の端末にだけ置く。
// キーは正規化入力のSHA-256で、日記本文を平文のキーとして持たない。履歴（history.js）とは別物。

import { MAX_DATA_JSON_CHARS, validAnalysisPayload } from "./dataIntegrity";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, zonedDateKey } from "./localTime";

export const ANALYSIS_CACHE_STORAGE_KEY = "kiri-analysis-cache-v1";
export const MAX_ANALYSIS_CACHE_ITEMS = 10;

// 暦日のキー。timeZone は利用者の端末の地域（既定は日本時間）。
export function jstDateKey(date, timeZone = DEFAULT_TIME_ZONE) {
  return zonedDateKey(date, timeZone);
}

// 結果に影響する入力だけを固定の順序で並べる（サーバーへ送る値と同じもの）。
// timeZone は端末の地域。地域が変われば「今日」も変わるので、キーにも含める（D-45）。
function normalizedInput({ userProfile = {}, biorhythm = {}, entry = {}, timeZone }, date) {
  const zone = normalizeTimeZone(timeZone);
  return JSON.stringify({
    date: jstDateKey(date, zone),
    timeZone: zone,
    userProfile: {
      birthDate: userProfile.birthDate || "",
      birthTime: userProfile.birthTime || "",
      gender: userProfile.gender || "",
      nickname: userProfile.nickname || "",
    },
    biorhythm: { p: Number(biorhythm.p), e: Number(biorhythm.e), i: Number(biorhythm.i) },
    entry: {
      emoji: entry.emoji || "",
      type: entry.type || "past",
      event: entry.event || "",
      intuition: entry.intuition || "",
    },
  });
}

// Web Crypto が使えない環境では null を返し、呼び出し側はキャッシュなしで動く。
export async function analysisCacheKey(input, date = new Date(), subtle = globalThis.crypto?.subtle) {
  if (!subtle) return null;
  try {
    const bytes = new TextEncoder().encode(normalizedInput(input, date));
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function readTodayEntries(storage, today) {
  try {
    const raw = storage?.getItem(ANALYSIS_CACHE_STORAGE_KEY) ?? "{}";
    if (typeof raw !== "string" || raw.length > MAX_DATA_JSON_CHARS) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, item]) => item && item.date === today && validAnalysisPayload(item.payload))
    );
  } catch {
    return {};
  }
}

function writeEntries(storage, entries) {
  try {
    storage?.setItem(ANALYSIS_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 容量超過・プライベートモードなどはキャッシュなしで続ける。
  }
}

// 今日（利用者の地域の暦日）以外のエントリは読み込み時に捨てる。
export function loadCachedAnalysis(storage, key, date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  if (!storage || !key) return null;
  const today = jstDateKey(date, timeZone);
  let raw;
  try {
    raw = storage.getItem(ANALYSIS_CACHE_STORAGE_KEY);
  } catch {
    return null;
  }
  const entries = readTodayEntries(storage, today);
  const pruned = JSON.stringify(entries);
  if (raw !== null && raw !== pruned) writeEntries(storage, entries);
  return entries[key]?.payload ?? null;
}

// 上限を超えたら古い順（挿入順）に削除する。
export function saveCachedAnalysis(storage, key, payload, date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  if (!storage || !key) return;
  const today = jstDateKey(date, timeZone);
  const entries = readTodayEntries(storage, today);
  delete entries[key];
  entries[key] = { date: today, payload };
  const keys = Object.keys(entries);
  for (const oldKey of keys.slice(0, Math.max(0, keys.length - MAX_ANALYSIS_CACHE_ITEMS))) {
    delete entries[oldKey];
  }
  writeEntries(storage, entries);
}

// 記録の削除時に呼ぶ。当日分しか持たないので丸ごと消す。
export function clearCachedAnalyses(storage) {
  try {
    storage?.removeItem(ANALYSIS_CACHE_STORAGE_KEY);
  } catch {
    // 消せない環境でも削除操作そのものは続ける。
  }
}
