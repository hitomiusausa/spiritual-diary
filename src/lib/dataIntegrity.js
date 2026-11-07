// 互換性を保つ保存データ検証。読込は原本を書き換えず、破損キーへの通常保存を止める。
// 省略された旧フィールドは許容し、値の型を勝手に文字列化・切り詰めない（B-04）。
export const MAX_DATA_JSON_CHARS = 8_000_000;
const MAX_TEXT_CHARS = 100_000;
const issues = new WeakMap();
const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const optionalText = (object, key, limit = MAX_TEXT_CHARS) => !own(object, key)
  || (typeof object[key] === "string" && object[key].length <= limit);

export function validBirthDate(value, allowPartial = true) {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (allowPartial && /^(?:\d{4})?-(?:\d{2})?-(?:\d{2})?$/.test(value) && value.split("-").some((p) => !p)) {
    const [year, month, day] = value.split("-");
    return (!year || Number(year) >= 100) && (!month || (Number(month) >= 1 && Number(month) <= 12))
      && (!day || (Number(day) >= 1 && Number(day) <= 31));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validProfile(profile) {
  if (!plain(profile)) return false;
  for (const field of ["nickname", "birthDate", "birthTime", "gender"]) {
    if (!optionalText(profile, field)) return false;
  }
  return (!own(profile, "birthDate") || validBirthDate(profile.birthDate))
    && (!profile.birthTime || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(profile.birthTime));
}

function validResult(result) {
  if (!plain(result)) return false;
  return ["deepMessage", "innerMessage", "actionAdvice"].every((field) => optionalText(result, field))
    && (!own(result, "support") || typeof result.support === "boolean");
}

// Cached payloads feed the current result screen, including nested cards. Invalid
// cache entries may be discarded: the primary history is handled separately.
export function validAnalysisPayload(payload) {
  if (!validResult(payload)) return false;
  if (payload.analyzedAt != null && !(typeof payload.analyzedAt === "string" && Number.isFinite(Date.parse(payload.analyzedAt)))) return false;
  if (payload.themeScores != null && (!plain(payload.themeScores)
    || !["love", "money", "work", "health"].every((key) => Number.isFinite(payload.themeScores[key])
      && payload.themeScores[key] >= 0 && payload.themeScores[key] <= 100))) return false;
  if (payload.todayHints != null) {
    if (!plain(payload.todayHints)) return false;
    for (const key of ["color", "number", "direction", "distance"]) {
      const hint = payload.todayHints[key];
      if (!plain(hint) || typeof hint.message !== "string" || hint.message.length > MAX_TEXT_CHARS
        || !(typeof hint.value === "string" || Number.isFinite(hint.value))) return false;
    }
  }
  if (payload.saju != null) {
    const saju = payload.saju;
    if (!plain(saju) || !plain(saju.birth) || !plain(saju.today) || !optionalText(saju, "note")) return false;
    for (const chart of [saju.birth, saju.today]) {
      for (const key of ["year", "month", "day", "hour", "zodiac", "dayDescription", "hourDescription"]) {
        if (chart[key] != null && !optionalText(chart, key)) return false;
      }
    }
    if (saju.taiun != null) {
      if (!plain(saju.taiun) || (saju.taiun.pillar != null && typeof saju.taiun.pillar !== "string")
        || (saju.taiun.age != null && !Number.isFinite(saju.taiun.age))) return false;
    }
  }
  return true;
}

export function validHistoryRecord(record) {
  if (!plain(record) || !((typeof record.id === "string" && record.id.length > 0 && record.id.length <= 200)
    || (typeof record.id === "number" && Number.isFinite(record.id)))) return false;
  if (own(record, "createdAt") && !(typeof record.createdAt === "string"
    && Number.isFinite(Date.parse(record.createdAt)))) return false;
  if (own(record, "userProfile") && !validProfile(record.userProfile)) return false;
  if (own(record, "entry")) {
    if (!plain(record.entry)) return false;
    if (!["emoji", "mood", "type", "event", "intuition"].every((field) => optionalText(record.entry, field))) return false;
    if (record.entry.type && !["past", "future"].includes(record.entry.type)) return false;
  }
  return !own(record, "result") || validResult(record.result);
}

export function validChatMessage(message) {
  return plain(message) && ["user", "assistant"].includes(message.role)
    && typeof message.content === "string" && message.content.length <= MAX_TEXT_CHARS
    && (!own(message, "support") || typeof message.support === "boolean")
    && message.isSystem !== true;
}

function markIssue(storage, key, raw, reason) {
  if (!storage || (typeof storage !== "object" && typeof storage !== "function")) return;
  if (!issues.has(storage)) issues.set(storage, new Map());
  issues.get(storage).set(key, { raw, reason });
}
export function getDataIssues(storage) {
  return [...(issues.get(storage)?.entries() ?? [])].map(([key, issue]) => ({ key, reason: issue.reason }));
}
export function hasDataIssues(storage) { return getDataIssues(storage).length > 0; }
export function clearDataIssue(storage, key) { issues.get(storage)?.delete(key); }
export function getRecoveryRaw(storage, key) {
  const issue = issues.get(storage)?.get(key);
  if (issue && typeof issue.raw === "string") return issue.raw;
  return storage?.getItem(key) ?? null;
}

export class DataRecoveryRequiredError extends Error {
  constructor(key) {
    super("original device data needs recovery before writing");
    this.name = "DataRecoveryRequiredError";
    this.code = "data_recovery_required";
    this.key = key;
  }
}
export function assertDataWritable(storage, key) {
  if (issues.get(storage)?.has(key)) throw new DataRecoveryRequiredError(key);
}

export function readStoredData(storage, key, { fallback, validate, array = false, maxItems = Infinity, keepLast = false }) {
  let raw;
  try { raw = storage?.getItem(key) ?? null; }
  catch { markIssue(storage, key, null, "read_failed"); return fallback; }
  if (raw === null) { clearDataIssue(storage, key); return fallback; }
  try {
    if (typeof raw !== "string" || raw.length > MAX_DATA_JSON_CHARS) throw new Error();
    const parsed = JSON.parse(raw);
    if (array) {
      if (!Array.isArray(parsed)) throw new Error();
      const valid = parsed.filter(validate);
      if (valid.length !== parsed.length || parsed.length > maxItems) markIssue(storage, key, raw, "invalid_records");
      else clearDataIssue(storage, key);
      return keepLast ? valid.slice(-maxItems) : valid.slice(0, maxItems);
    }
    if (parsed === null) { clearDataIssue(storage, key); return fallback; }
    if (!validate(parsed)) throw new Error();
    clearDataIssue(storage, key);
    return parsed;
  } catch {
    markIssue(storage, key, raw, "invalid_data");
    return fallback;
  }
}

// File imports are preflighted as a whole, before the first destination write.
export function validateBackupData(data) {
  if (!plain(data)) throw new Error("invalid backup data");
  const history = data.history ?? [];
  const chat = data.chat ?? [];
  const profile = data.profile ?? null;
  if (!Array.isArray(history) || history.length > 10_000 || !history.every(validHistoryRecord)
    || !Array.isArray(chat) || chat.length > 1000 || !chat.every(validChatMessage)
    || (profile !== null && !validProfile(profile))) throw new Error("invalid backup data");
  if (JSON.stringify({ history, chat, profile }).length > MAX_DATA_JSON_CHARS) throw new Error("backup is too large");
  return { history, chat, profile };
}
