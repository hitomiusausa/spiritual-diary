export const CHAT_HISTORY_STORAGE_KEY = "spiritual-diary.chat.v1";
export const MAX_CHAT_MESSAGES = 40;

export function loadChatHistory(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CHAT_HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .slice(-MAX_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

export function saveChatHistory(storage, messages) {
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({ role: message.role, content: String(message.content || "").slice(0, 1800) }))
    .slice(-MAX_CHAT_MESSAGES);
  storage?.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(safeMessages));
  return safeMessages;
}

export function clearChatHistory(storage) {
  storage?.removeItem(CHAT_HISTORY_STORAGE_KEY);
  return [];
}
