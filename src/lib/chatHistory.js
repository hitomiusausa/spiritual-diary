import { assertDataWritable, clearDataIssue, readStoredData, validChatMessage } from "./dataIntegrity";

export const CHAT_HISTORY_STORAGE_KEY = "spiritual-diary.chat.v1";
export const MAX_CHAT_MESSAGES = 1000;

export function loadChatHistory(storage) {
  return readStoredData(storage, CHAT_HISTORY_STORAGE_KEY, {
    fallback: [], validate: validChatMessage, array: true, maxItems: MAX_CHAT_MESSAGES, keepLast: true,
  });
}

export function saveChatHistory(storage, messages) {
  loadChatHistory(storage);
  assertDataWritable(storage, CHAT_HISTORY_STORAGE_KEY);
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter(validChatMessage)
    .map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.support ? { support: true } : {}),
    }))
    .slice(-MAX_CHAT_MESSAGES);
  storage?.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(safeMessages));
  return safeMessages;
}

export function clearChatHistory(storage) {
  storage?.removeItem(CHAT_HISTORY_STORAGE_KEY);
  clearDataIssue(storage, CHAT_HISTORY_STORAGE_KEY);
  return [];
}