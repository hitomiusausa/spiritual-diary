import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEmbeddedEnv, SECRET_ENV_NAMES } from "../lib/embeddedEnv.mjs";

// OpenNext（compile-env-files.js）が書き出す形をそのまま再現したフィクスチャ。
const fixture = (modes) =>
  ["production", "development", "test"]
    .filter((mode) => mode in modes)
    .map((mode) => `export const ${mode} = ${JSON.stringify(modes[mode])};\n`)
    .join("");

describe("findEmbeddedEnv", () => {
  let dir;
  let file;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kiri-env-"));
    file = join(dir, "next-env.mjs");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("全モードが空なら問題なし", () => {
    writeFileSync(file, fixture({ production: {}, development: {}, test: {} }));
    expect(findEmbeddedEnv(file)).toEqual({ ok: true, problems: [] });
  });

  it("値が埋め込まれていればキー名だけを挙げて止める（値は出さない）", () => {
    writeFileSync(file, fixture({ production: { CLAUDE_API_KEY: "dummy-value-xyz" }, development: { CLAUDE_API_KEY: "dummy-value-xyz" }, test: {} }));
    const result = findEmbeddedEnv(file);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["production: CLAUDE_API_KEY", "development: CLAUDE_API_KEY"]);
    expect(JSON.stringify(result)).not.toContain("dummy-value-xyz");
  });

  it.each(SECRET_ENV_NAMES)("秘密の %s が埋め込まれていれば止める（REVENUECAT_SECRET_KEY を含む）", (name) => {
    writeFileSync(file, fixture({ production: { [name]: "dummy-secret-value" }, development: {}, test: {} }));
    const result = findEmbeddedEnv(file);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([`production: ${name}`]);
    expect(JSON.stringify(result)).not.toContain("dummy-secret-value");
  });

  it("REVENUECAT_SECRET_KEY が秘密の一覧に入っている", () => {
    expect(SECRET_ENV_NAMES).toContain("REVENUECAT_SECRET_KEY");
  });

  it("ファイルが無ければ止める（ビルド前に走らせた・出力先が変わった）", () => {
    const result = findEmbeddedEnv(join(dir, "missing.mjs"));
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/見つかりません/);
  });

  it("想定外の形（モードの欠け・未知の行）なら止める", () => {
    writeFileSync(file, fixture({ production: {}, development: {} }));
    expect(findEmbeddedEnv(file).ok).toBe(false);
    writeFileSync(file, fixture({ production: {}, development: {}, test: {} }) + "export const extra = process.env;\n");
    expect(findEmbeddedEnv(file).ok).toBe(false);
  });
});
