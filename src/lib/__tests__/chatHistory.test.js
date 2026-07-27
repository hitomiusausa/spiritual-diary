import { describe, expect, it } from "vitest";
import { CHAT_HISTORY_STORAGE_KEY, clearChatHistory, loadChatHistory, saveChatHistory } from "@/lib/chatHistory";

function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

describe("chat history storage", () => {
  it("keeps only safe message fields", () => {
    const store = storage();
    saveChatHistory(store, [{ role: "user", content: "こんにちは", secret: "no" }, { role: "system", content: "ignored" }]);
    expect(loadChatHistory(store)).toEqual([{ role: "user", content: "こんにちは" }]);
    expect(store.getItem(CHAT_HISTORY_STORAGE_KEY)).not.toContain("secret");
  });

  it("clears the local conversation", () => {
    const store = storage();
    saveChatHistory(store, [{ role: "assistant", content: "……" }]);
    expect(clearChatHistory(store)).toEqual([]);
    expect(loadChatHistory(store)).toEqual([]);
  });
});
