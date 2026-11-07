// 送信・削除・閉じるの間で古い応答を採用しない。body読み込みやID取得も同じ期限で打ち切る。
import { CHAT_CONTEXT_MESSAGES, CHAT_USER_MAX_CHARS, CHAT_REPLY_MAX_CHARS, NICKNAME_MAX_CHARS, ENTRY_EVENT_MAX_CHARS, ENTRY_INTUITION_MAX_CHARS } from "./inputContract";

export const CHAT_CLIENT_TIMEOUT_MS = 45_000;
export function createChatRequestSession(timeoutMs = CHAT_CLIENT_TIMEOUT_MS) {
  let generation = 0;
  let active = null;
  const cancel = () => {
    generation++;
    if (active) { clearTimeout(active.timer); active.controller.abort(); active = null; }
  };
  return {
    cancel,
    begin() {
      cancel();
      const id = generation;
      const controller = new AbortController();
      const request = { controller, timer: setTimeout(() => controller.abort(), timeoutMs) };
      active = request;
      return {
        signal: controller.signal,
        current: () => id === generation,
        finish: () => { clearTimeout(request.timer); if (active === request) active = null; },
      };
    },
  };
}

export function withChatAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

// 保存1000件と送信12件を分け、本文以外の内部フラグや古い案内を送らない。
export function chatRequestBody({ messages, userProfile, entry, result, appUserId }) {
  const text = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
  return {
    messages: messages.filter(m => m && !m.isSystem && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-CHAT_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: text(m.content, m.role === "assistant" ? CHAT_REPLY_MAX_CHARS : CHAT_USER_MAX_CHARS) })),
    userProfile: { nickname: text(userProfile?.nickname, NICKNAME_MAX_CHARS) },
    context: {
      entry: { event: text(entry?.event, ENTRY_EVENT_MAX_CHARS), intuition: text(entry?.intuition, ENTRY_INTUITION_MAX_CHARS) },
      result: { deepMessage: text(result?.deepMessage, 1200), innerMessage: text(result?.innerMessage, 600), actionAdvice: text(result?.actionAdvice, 800) },
    },
    ...(typeof appUserId === "string" && appUserId ? { appUserId } : {}),
  };
}
