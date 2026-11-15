// schema 1 の非破壊バックアップ。既存IDを保持し、空き枠だけを復元する（B-02/B-04）。
import { HISTORY_QUARANTINE_KEY, HISTORY_STORAGE_KEY, MAX_HISTORY_ITEMS, loadHistory, loadHistoryQuarantine, loadProfile, PROFILE_STORAGE_KEY } from "./history";
import { CHAT_HISTORY_STORAGE_KEY, loadChatHistory } from "./chatHistory";
import {
  MAX_DATA_JSON_CHARS, assertDataWritable, getDataIssues, getRecoveryRaw,
  DataRecoveryRequiredError, validateBackupData,
} from "./dataIntegrity";
import { deviceTimeZone, zonedDateKey } from "./localTime";

export const BACKUP_APP_NAME = "spiritual-diary";
export const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_KEYS = [HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY, CHAT_HISTORY_STORAGE_KEY];

export function buildBackup(storage) {
  const profile = loadProfile(storage);
  const history = loadHistory(storage);
  const chat = loadChatHistory(storage);
  // A normal export must not quietly omit the quarantined original.
  const issue = getDataIssues(storage).find(({ key }) => BACKUP_KEYS.includes(key));
  if (issue) throw new DataRecoveryRequiredError(issue.key);
  // 別に保管した読み込めない記録の原本（R2-03）も、黙って落とさず書き出しに入れる。
  // 読み込み（parseBackup）はこの欄を使わない（壊れた原本を自動で取り込まない）。
  const quarantine = loadHistoryQuarantine(storage);
  if (quarantine === null) throw new DataRecoveryRequiredError(HISTORY_QUARANTINE_KEY);
  return {
    app: BACKUP_APP_NAME, schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(), profile, history, chat,
    ...(quarantine.length ? { unreadableHistory: quarantine } : {}),
  };
}

// Rescue is deliberately a separate format: invalid raw content is never auto-imported.
// Only diary-owned data keys are selected; lock, consent and purchase identifiers are excluded.
export function buildRecoveryBackup(storage) {
  return {
    app: "spiritual-diary-recovery", schemaVersion: 1, exportedAt: new Date().toISOString(),
    raw: Object.fromEntries([
      ...BACKUP_KEYS.map((key) => [key, getRecoveryRaw(storage, key)]),
      // 保管した原本があるときだけ足す（R2-03）
      ...((storage?.getItem(HISTORY_QUARANTINE_KEY) ?? null) !== null ? [[HISTORY_QUARANTINE_KEY, storage.getItem(HISTORY_QUARANTINE_KEY)]] : []),
    ]),
  };
}

// ファイル名の日付は端末の地域の暦日（D-45）。
export function backupFileName(now = new Date(), timeZone = deviceTimeZone()) {
  return `kiri-backup-${zonedDateKey(now, timeZone)}.json`;
}

export function parseBackup(text) {
  if (typeof text !== "string" || text.length > MAX_DATA_JSON_CHARS) throw new Error("backup is too large");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("backup file is not valid JSON"); }
  if (!parsed || typeof parsed !== "object" || parsed.app !== BACKUP_APP_NAME) throw new Error("not a spiritual-diary backup");
  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error("unsupported backup schema version");
  return validateBackupData(parsed);
}

function planHistoryMerge(existing, imported) {
  const seen = new Set(existing.map((item) => item.id));
  const additions = [];
  let historyDuplicates = 0;
  for (const item of imported) {
    if (seen.has(item.id)) { historyDuplicates += 1; continue; }
    seen.add(item.id);
    additions.push(item);
  }
  additions.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const capacity = Math.max(0, MAX_HISTORY_ITEMS - existing.length);
  const admitted = additions.slice(0, capacity);
  return {
    history: [...existing, ...admitted].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    historyAdded: admitted.length, historySkipped: additions.length - admitted.length, historyDuplicates,
  };
}
export function mergeHistories(existing, imported) {
  validateBackupData({ history: [...existing, ...imported] });
  return planHistoryMerge(existing, imported).history;
}

export function applyBackup(storage, backup) {
  // Preflight every incoming value and every destination before the first mutation.
  const checked = validateBackupData(backup);
  const existingHistory = loadHistory(storage);
  const profile = loadProfile(storage);
  const chat = loadChatHistory(storage);
  for (const key of BACKUP_KEYS) assertDataWritable(storage, key);
  const plan = planHistoryMerge(existingHistory, checked.history);
  const profileApplied = Boolean(checked.profile?.birthDate) && !profile?.birthDate;
  const chatRestored = checked.chat.length > 0 && chat.length === 0;
  const writes = [];
  if (plan.historyAdded) writes.push([HISTORY_STORAGE_KEY, JSON.stringify(plan.history)]);
  if (profileApplied) writes.push([PROFILE_STORAGE_KEY, JSON.stringify(checked.profile)]);
  if (chatRestored) writes.push([CHAT_HISTORY_STORAGE_KEY, JSON.stringify(checked.chat)]);
  // Preferences has no multi-key transaction. The caller waits for flush and reports
  // any partial persistence honestly; existing records are never displaced.
  for (const [key, value] of writes) storage?.setItem(key, value);
  return {
    historyAdded: plan.historyAdded, historySkipped: plan.historySkipped,
    historyDuplicates: plan.historyDuplicates, historyTotal: plan.history.length,
    profileApplied, chatRestored,
  };
}
