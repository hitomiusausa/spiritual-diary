import { describe, expect, it } from "vitest";
import { extractReplyText } from "@/lib/claudeResponse";

describe("extractReplyText", () => {
  it("思考ブロックを飛ばして本文だけを返す", () => {
    const data = {
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: " 霧が薄いね。 " }],
    };
    expect(extractReplyText(data)).toBe("霧が薄いね。");
  });

  it("拒否・途中打ち切り・空応答は空文字にする", () => {
    expect(extractReplyText({ stop_reason: "refusal", content: [{ type: "text", text: "x" }] })).toBe("");
    expect(extractReplyText({ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"a\":" }] })).toBe("");
    expect(extractReplyText(null)).toBe("");
    expect(extractReplyText({ content: [] })).toBe("");
  });
});
