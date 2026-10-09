import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Kiri のアバターは 48px で表示する。画像最適化は切っている（D-19）ので、512px・138KB の原本をそのまま配ると無駄。
// 3x（144px）の版を配り、原本 public/kiri.png はアプリアイコンの元として残す。
const root = process.cwd();
const AVATAR = "public/kiri-avatar-144.png";

describe("Kiri avatar asset", () => {
  it("is a 144px (3x of 48px) image with transparency, much smaller than the original", async () => {
    const meta = await sharp(join(root, AVATAR)).metadata();
    expect([meta.width, meta.height]).toEqual([144, 144]);
    expect(meta.hasAlpha).toBe(true);
    expect(statSync(join(root, AVATAR)).size).toBeLessThan(32 * 1024);
  });

  it("keeps the 512px original for the app icon pipeline", async () => {
    const meta = await sharp(join(root, "public/kiri.png")).metadata();
    expect(meta.width).toBe(512);
  });

  it("the screens use the small version, not the original", () => {
    const source = readFileSync(join(root, "src/components/SpiritualDiary.jsx"), "utf8");
    expect(source).toContain('src="/kiri-avatar-144.png"');
    expect(source).not.toContain('src="/kiri.png"');
  });
});
