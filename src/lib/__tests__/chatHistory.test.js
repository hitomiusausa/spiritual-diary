import { describe, expect, it } from "vitest";
import { CHAT_HISTORY_STORAGE_KEY, MAX_CHAT_MESSAGES, clearChatHistory, loadChatHistory, saveChatHistory } from "@/lib/chatHistory";

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

  it("keeps the support flag so the hotline card survives a reload", () => {
    const store = storage();
    saveChatHistory(store, [{ role: "assistant", content: "窓口", support: true }, { role: "assistant", content: "……", support: false }]);
    expect(loadChatHistory(store)).toEqual([
      { role: "assistant", content: "窓口", support: true },
      { role: "assistant", content: "……" },
    ]);
  });

  it("clears the local conversation", () => {
    const store = storage();
    saveChatHistory(store, [{ role: "assistant", content: "……" }]);
    expect(clearChatHistory(store)).toEqual([]);
    expect(loadChatHistory(store)).toEqual([]);
  });

  it("keeps the newest 1,000 messages (legal pages promise this number) and drops the oldest", () => {
    expect(MAX_CHAT_MESSAGES).toBe(1000);
    const store = storage();
    const many = Array.from({ length: MAX_CHAT_MESSAGES + 5 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const saved = saveChatHistory(store, many);
    expect(saved).toHaveLength(MAX_CHAT_MESSAGES);
    expect(saved[0].content).toBe("m5");
    expect(loadChatHistory(store)).toHaveLength(MAX_CHAT_MESSAGES);
  });

  it("reads existing data written under the old 40-message cap as is", () => {
    const store = storage();
    const old = Array.from({ length: 40 }, (_, i) => ({ role: "assistant", content: `o${i}` }));
    store.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(old));
    expect(loadChatHistory(store)).toEqual(old);
  });
});
