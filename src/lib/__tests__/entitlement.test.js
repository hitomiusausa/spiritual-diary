import { describe, it, expect, afterEach } from "vitest";
import { checkChatEntitlement } from "../entitlement";

const ORIGINAL = process.env.KIRI_CHAT_PREVIEW;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.KIRI_CHAT_PREVIEW;
  else process.env.KIRI_CHAT_PREVIEW = ORIGINAL;
});

describe("checkChatEntitlement", () => {
  it("KIRI_CHAT_PREVIEW未設定なら拒否する", () => {
    delete process.env.KIRI_CHAT_PREVIEW;
    const result = checkChatEntitlement();
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("preview");
  });

  it("KIRI_CHAT_PREVIEW=1なら許可する", () => {
    process.env.KIRI_CHAT_PREVIEW = "1";
    expect(checkChatEntitlement().allowed).toBe(true);
  });

  it("KIRI_CHAT_PREVIEW=trueなら許可する", () => {
    process.env.KIRI_CHAT_PREVIEW = "true";
    expect(checkChatEntitlement().allowed).toBe(true);
  });

  it("KIRI_CHAT_PREVIEW=0なら拒否する", () => {
    process.env.KIRI_CHAT_PREVIEW = "0";
    expect(checkChatEntitlement().allowed).toBe(false);
  });
});
