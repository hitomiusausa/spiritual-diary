import { describe, it, expect } from "vitest";
import { hashClientIp } from "../kiriCrypto";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "other-secret-0123456789abcdef0123456789abcde";

describe("hashClientIp", () => {
  it("同じ秘密鍵とIPなら同じ値、元のIPを含まない", () => {
    const a = hashClientIp(SECRET, "203.0.113.5");
    expect(a).toBe(hashClientIp(SECRET, "203.0.113.5"));
    expect(a).not.toContain("203.0.113.5");
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("IPや秘密鍵が違えば値も変わる", () => {
    const a = hashClientIp(SECRET, "203.0.113.5");
    expect(hashClientIp(SECRET, "203.0.113.6")).not.toBe(a);
    expect(hashClientIp(OTHER_SECRET, "203.0.113.5")).not.toBe(a);
  });

  it("ドメイン分離文字列つきで計算する（素のHMAC(ip)とは一致しない）", async () => {
    const { createHmac } = await import("node:crypto");
    const bare = createHmac("sha256", SECRET).update("203.0.113.5").digest("base64url").slice(0, 22);
    expect(hashClientIp(SECRET, "203.0.113.5")).not.toBe(bare);
  });
});
