import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiBase, findForbiddenInExport, PROD_API_BASE, DEV_API_BASE } from "../lib/iosBuild.mjs";

describe("resolveApiBase", () => {
  it("既定は本番 API", () => {
    expect(resolveApiBase([], {})).toBe(PROD_API_BASE);
    expect(PROD_API_BASE).toBe("https://kiri.kugainc.com");
  });

  it("--dev はローカルの dev サーバー", () => {
    expect(resolveApiBase(["--dev"], {})).toBe(DEV_API_BASE);
    expect(DEV_API_BASE).toBe("http://localhost:3000");
  });

  it("NEXT_PUBLIC_KIRI_API_BASE が明示されていればそれを使う", () => {
    expect(resolveApiBase(["--dev"], { NEXT_PUBLIC_KIRI_API_BASE: "http://192.168.1.5:3000" })).toBe("http://192.168.1.5:3000");
  });

  it.each([["ftp://x"], ["kiri.kugainc.com"], ["https://kiri.kugainc.com/api"]])("不正な値（%s）は拒否する", (value) => {
    expect(() => resolveApiBase([], { NEXT_PUBLIC_KIRI_API_BASE: value })).toThrow();
  });
});

describe("findForbiddenInExport", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kiri-out-"));
    mkdirSync(join(dir, "_next/static/chunks"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html>Kiri</html>");
    // プライバシーポリシーは事業者名として Anthropic / Upstash を書く。これは許す。
    writeFileSync(join(dir, "privacy.html"), "Anthropic社のAPI・Upstash（東京リージョン）");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("クリーンな書き出しは問題なし", () => {
    expect(findForbiddenInExport(dir)).toEqual([]);
  });

  it.each([
    ["CLAUDE_API_KEY"],
    ["UPSTASH_REDIS_REST_TOKEN"],
    ["KIRI_STORE_SECRET"],
    ["api.anthropic.com"],
    ["@upstash/redis"],
    ["x-api-key"],
  ])("%s を含むファイルを見つける", (marker) => {
    writeFileSync(join(dir, "_next/static/chunks/a.js"), `var k="${marker}";`);
    const problems = findForbiddenInExport(dir);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("_next/static/chunks/a.js");
  });

  it("api ディレクトリが残っていたら問題", () => {
    mkdirSync(join(dir, "api/analyze"), { recursive: true });
    writeFileSync(join(dir, "api/analyze/index.html"), "x");
    expect(findForbiddenInExport(dir).some((p) => p.includes("api"))).toBe(true);
  });
});

describe("secretValuesFromDotenv / 値の埋め込み検査", () => {
  it("NEXT_PUBLIC_ 以外の十分長い値だけを拾う", async () => {
    const { secretValuesFromDotenv } = await import("../lib/iosBuild.mjs");
    const text = [
      "# comment",
      'CLAUDE_API_KEY="sk-test-abcdefghijklmnop"',
      "export KIRI_STORE_SECRET=0123456789abcdef0123456789abcdef",
      "NEXT_PUBLIC_KIRI_API_BASE=http://localhost:3000",
      "SHORT=abc",
    ].join("\n");
    expect(secretValuesFromDotenv(text)).toEqual([
      "sk-test-abcdefghijklmnop",
      "0123456789abcdef0123456789abcdef",
    ]);
  });

  it("秘密の値が書き出しに現れたら問題にする（値は出さない）", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiri-out-"));
    try {
      writeFileSync(join(dir, "a.js"), 'var x="sk-test-abcdefghijklmnop"');
      const problems = findForbiddenInExport(dir, { secretValues: ["sk-test-abcdefghijklmnop"] });
      expect(problems).toEqual(["a.js: 環境変数の値が埋め込まれています"]);
      expect(problems.join("")).not.toContain("sk-test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
