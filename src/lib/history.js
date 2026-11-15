import {
  assertDataWritable, clearDataIssue, getDataIssues, getRecoveryRaw, readStoredData, validBirthDate, validHistoryRecord, validProfile,
} from "./dataIntegrity";
import { deviceTimeZone, zonedDateKey } from "./localTime";

export const HISTORY_STORAGE_KEY = "spiritual-diary.history.v1";
export const PROFILE_STORAGE_KEY = "spiritual-diary.profile.v1";
export const MAX_HISTORY_ITEMS = 365; // D-44（振り返りの月の暦で約1年さかのぼれるように。1件は約3,700字）
// 読み込めない記録の原本を、元のまま別に保管しておく場所（R2-03）。中身は [{ quarantinedAt, reason, raw }]。
// 原本を消さずに、新しい読み解きの保存を続けるために使う。自動では消さない（消すのは「すべて削除」だけ）。
export const HISTORY_QUARANTINE_KEY = "spiritual-diary.history.quarantine.v1";
const MAX_QUARANTINE_ENTRIES = 5;

export function toHistoryRecord({ result, entry, userProfile }) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(result.timestamp ?? Date.now()).toISOString(),
    userProfile: {
      birthDate: userProfile.birthDate,
      birthTime: userProfile.birthTime || "",
      gender: userProfile.gender || "",
      nickname: userProfile.nickname || "",
    },
    entry: {
      emoji: entry.emoji || "",
      mood: entry.mood || "",
      type: entry.type === "future" ? "future" : "past",
      event: entry.event,
      intuition: entry.intuition || "",
    },
    result: {
      deepMessage: result.deepMessage || "",
      innerMessage: result.innerMessage || "",
      actionAdvice: result.actionAdvice || "",
      themeScores: result.themeScores || null,
      support: Boolean(result.support),
      saju: result.saju || null,
    },
  };
}

// 端末の地域の暦日（D-45）。
function jstDay(iso, timeZone = deviceTimeZone()) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? zonedDateKey(new Date(time), timeZone) : "";
}

// 同じ暦日（端末の地域）に、同じ基本情報・同じ記録で、Kiriの言葉も同じ（＝端末キャッシュの結果を見直しただけ）か。
// 「読み解く」を押し直すたびに同じ記録が履歴へ増えないよう、保存前の判定に使う（T13）。
export function isSameReading(a, b) {
  if (!a || !b) return false;
  const fields = (record) => JSON.stringify([
    record.userProfile?.birthDate, record.userProfile?.birthTime, record.userProfile?.gender, record.userProfile?.nickname,
    record.entry?.emoji, record.entry?.mood, record.entry?.type, record.entry?.event, record.entry?.intuition,
    record.result?.deepMessage, record.result?.innerMessage, record.result?.actionAdvice,
  ]);
  return jstDay(a.createdAt) !== "" && jstDay(a.createdAt) === jstDay(b.createdAt) && fields(a) === fields(b);
}

export function loadHistory(storage) {
  return readStoredData(storage, HISTORY_STORAGE_KEY, {
    fallback: [], validate: validHistoryRecord, array: true, maxItems: MAX_HISTORY_ITEMS,
  });
}

export function saveHistory(storage, record, { afterQuarantine = false } = {}) {
  const previous = loadHistory(storage);
  // 原本がそっくり保管場所に入っているときだけ、読める記録＋新しい記録で書き直してよい（R2-03）
  if (afterQuarantine && isHistoryRawQuarantined(storage)) clearDataIssue(storage, HISTORY_STORAGE_KEY);
  assertDataWritable(storage, HISTORY_STORAGE_KEY);
  if (!validHistoryRecord(record)) throw new Error("invalid history record");
  const history = [record, ...previous]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, MAX_HISTORY_ITEMS);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
}

// 保管した原本の一覧。保管場所そのものが読めないときは null（上書きしない）。
export function loadHistoryQuarantine(storage) {
  const raw = storage?.getItem(HISTORY_QUARANTINE_KEY) ?? null;
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasQuarantinedHistory(storage) {
  try {
    return (storage?.getItem(HISTORY_QUARANTINE_KEY) ?? null) !== null;
  } catch {
    return false;
  }
}

function isHistoryRawQuarantined(storage) {
  const raw = getRecoveryRaw(storage, HISTORY_STORAGE_KEY);
  const entries = loadHistoryQuarantine(storage);
  return typeof raw === "string" && Array.isArray(entries) && entries.some((entry) => entry?.raw === raw);
}

// 記録に読み込めないものがあるとき、その原本（文字列そのまま）を保管場所へ写す。写せたら true。
// 読み込み自体に失敗した（原本の中身が分からない）とき・保管場所が読めないとき・保管が上限のときは写さない（false）。
export function quarantineUnreadableHistory(storage, now = new Date()) {
  const issue = getDataIssues(storage).find(({ key }) => key === HISTORY_STORAGE_KEY);
  if (!issue || issue.reason === "read_failed") return false;
  const raw = getRecoveryRaw(storage, HISTORY_STORAGE_KEY);
  if (typeof raw !== "string") return false;
  const entries = loadHistoryQuarantine(storage);
  if (!entries) return false;
  if (!entries.some((entry) => entry?.raw === raw)) {
    if (entries.length >= MAX_QUARANTINE_ENTRIES) return false;
    entries.push({ quarantinedAt: now.toISOString(), reason: issue.reason, raw });
  }
  storage.setItem(HISTORY_QUARANTINE_KEY, JSON.stringify(entries));
  return true;
}

// 新しい読み解きを保存する。読み込めない記録があるときは、原本を保管場所へ写して端末へ書き終えてから、
// 読める記録＋新しい記録で保存を続ける（原本は消さない。保管の書き込みに失敗したら、元の記録は書き換えない）。
// flush は storage.js の flushStorageWrites（循環 import を避けるため引数で受け取る）。
export async function saveHistoryKeepingUnreadable(storage, record, { flush, now = new Date() } = {}) {
  try {
    const history = saveHistory(storage, record);
    if (flush) await flush({ keys: [HISTORY_STORAGE_KEY] });
    return { history, quarantined: false };
  } catch (failure) {
    if (failure?.code !== "data_recovery_required" || !quarantineUnreadableHistory(storage, now)) throw failure;
  }
  if (flush) await flush({ keys: [HISTORY_QUARANTINE_KEY] });
  const history = saveHistory(storage, record, { afterQuarantine: true });
  if (flush) await flush({ keys: [HISTORY_STORAGE_KEY] });
  return { history, quarantined: true };
}

export function clearHistoryQuarantine(storage) {
  storage?.removeItem(HISTORY_QUARANTINE_KEY);
}

export function deleteHistoryItem(storage, id) {
  const previous = loadHistory(storage);
  assertDataWritable(storage, HISTORY_STORAGE_KEY);
  const history = previous.filter((item) => item.id !== id);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
}

export function clearHistory(storage) {
  storage?.removeItem(HISTORY_STORAGE_KEY);
  clearDataIssue(storage, HISTORY_STORAGE_KEY);
  return [];
}

export function loadProfile(storage) {
  return readStoredData(storage, PROFILE_STORAGE_KEY, { fallback: null, validate: validProfile });
}

export function saveProfile(storage, profile) {
  const previous = loadProfile(storage);
  assertDataWritable(storage, PROFILE_STORAGE_KEY);
  if (!validProfile(profile)) throw new Error("invalid profile");
  const safeProfile = {
    ...previous,
    nickname: profile.nickname || "",
    birthDate: profile.birthDate || "",
    birthTime: profile.birthTime || "",
    gender: profile.gender || "",
  };
  storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safeProfile));
  return safeProfile;
}

const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// 起動時の最初の画面。生年月日が保存済みなら基本情報を飛ばして日記入力から始める。
export function initialStepFor(profile) {
  return BIRTH_DATE_PATTERN.test(profile?.birthDate || "") && validBirthDate(profile.birthDate, false) ? "input" : "start";
}

export function formatBirthDateJa(birthDate) {
  const match = BIRTH_DATE_PATTERN.exec(birthDate || "");
  if (!match) return "";
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}