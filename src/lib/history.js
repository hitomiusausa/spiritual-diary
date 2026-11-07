import {
  assertDataWritable, clearDataIssue, readStoredData, validBirthDate, validHistoryRecord, validProfile,
} from "./dataIntegrity";

export const HISTORY_STORAGE_KEY = "spiritual-diary.history.v1";
export const PROFILE_STORAGE_KEY = "spiritual-diary.profile.v1";
export const MAX_HISTORY_ITEMS = 30;

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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstDay(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + JST_OFFSET_MS).toISOString().slice(0, 10) : "";
}

// 同じJST日に、同じ基本情報・同じ記録で、Kiriの言葉も同じ（＝端末キャッシュの結果を見直しただけ）か。
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

export function saveHistory(storage, record) {
  const previous = loadHistory(storage);
  assertDataWritable(storage, HISTORY_STORAGE_KEY);
  if (!validHistoryRecord(record)) throw new Error("invalid history record");
  const history = [record, ...previous]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, MAX_HISTORY_ITEMS);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  return history;
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