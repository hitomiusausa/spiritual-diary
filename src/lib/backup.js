// 日記データのJSONバックアップ(D-09第一段階)。
// 取り込みは既存データを消さない: 履歴はidマージ、プロフィールとチャットは
// 既存があれば既存を優先する。

import {
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_ITEMS,
  loadHistory,
  loadProfile,
  saveProfile,
} from "./history";
import { CHAT_HISTORY_STORAGE_KEY, loadChatHistory, saveChatHistory } from "./chatHistory";

export const BACKUP_APP_NAME = "spiritual-diary";
export const BACKUP_SCHEMA_VERSION = 1;

export function buildBackup(storage) {
  return {
    app: BACKUP_APP_NAME,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: loadProfile(storage),
    history: loadHistory(storage),
    chat: loadChatHistory(storage),
  };
}

export function backupFileName(now = new Date()) {
  const jstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `kiri-backup-${jstDate}.json`;
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("backup file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || parsed.app !== BACKUP_APP_NAME) {
    throw new Error("not a spiritual-diary backup");
  }
  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("unsupported backup schema version");
  }
  return {
    history: (Array.isArray(parsed.history) ? parsed.history : [])
      .filter((item) => item && typeof item === "object" && item.id)
      .slice(0, MAX_HISTORY_ITEMS),
    profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
    chat: Array.isArray(parsed.chat) ? parsed.chat : [],
  };
}

export function mergeHistories(existing, imported) {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing, ...imported.filter((item) => !seen.has(item.id))];
  return merged
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, MAX_HISTORY_ITEMS);
}

export function applyBackup(storage, backup) {
  const existingHistory = loadHistory(storage);
  const mergedHistory = mergeHistories(existingHistory, backup.history);
  storage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(mergedHistory));

  // UIは空プロフィールも自動保存するため、「実データあり」はbirthDateで判定する。
  let profileApplied = false;
  const hasProfile = Boolean(loadProfile(storage)?.birthDate);
  if (backup.profile?.birthDate && !hasProfile) {
    saveProfile(storage, backup.profile);
    profileApplied = true;
  }

  let chatRestored = false;
  if (backup.chat.length && loadChatHistory(storage).length === 0) {
    saveChatHistory(storage, backup.chat);
    chatRestored = true;
  }

  return {
    historyAdded: mergedHistory.length - existingHistory.length,
    historyTotal: mergedHistory.length,
    profileApplied,
    chatRestored,
  };
}
