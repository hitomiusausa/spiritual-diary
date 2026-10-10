import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveApiBase,
  findForbiddenInExport,
  findPreviewUiInExport,
  iosBuildEnv,
  secretValuesFromDotenv,
  secretValuesFromEnv,
  verifyExport,
  resolveIapBuild,
  IAP_MOCK_MARKER,
  PROD_API_BASE,
  DEV_API_BASE,
} from "../lib/iosBuild.mjs";

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

describe("secretValuesFromDotenv（dotenv と同じ読み方）", () => {
  it.each([
    ["CLAUDE_API_KEY=sk-ant-abcdefghijkl # 本番", "sk-ant-abcdefghijkl"],
    ["CLAUDE_API_KEY=sk-ant-abcdefghijkl#本番", "sk-ant-abcdefghijkl"],
    ['CLAUDE_API_KEY="sk-ant-abcdefghijkl" # 本番', "sk-ant-abcdefghijkl"],
    ["CLAUDE_API_KEY='sk-ant-abcdefghijkl'   # 本番", "sk-ant-abcdefghijkl"],
    ['CLAUDE_API_KEY="sk-ant-abc#defghijkl"', "sk-ant-abc#defghijkl"],
    ["export   KIRI_STORE_SECRET = 0123456789abcdef  ", "0123456789abcdef"],
    ["  export CLAUDE_API_KEY=\"sk-ant-abcdefghijkl\"", "sk-ant-abcdefghijkl"],
  ])("%s", (line, expected) => {
    expect(secretValuesFromDotenv(line)).toEqual([expected]);
  });

  it("コメント行・NEXT_PUBLIC_・短い値・空は拾わない", () => {
    const text = ["# CLAUDE_API_KEY=sk-ant-abcdefghijkl", "NEXT_PUBLIC_X=abcdefghijklmnop # c", "A=short # x", "B=", 'C=""'].join("\n");
    expect(secretValuesFromDotenv(text)).toEqual([]);
  });
});

describe("secretValuesFromEnv（シェルで export した秘密も照合する）", () => {
  it("既知の秘密名の十分長い値だけを拾う", () => {
    expect(
      secretValuesFromEnv({
        CLAUDE_API_KEY: "sk-ant-abcdefghijkl",
        KIRI_STORE_SECRET: "0123456789abcdef",
        UPSTASH_REDIS_REST_TOKEN: "tok_abcdefghijklmn",
        KV_REST_API_TOKEN: "short",
        PATH: "/usr/bin:/bin:/usr/local/bin",
      }).sort(),
    ).toEqual(["0123456789abcdef", "sk-ant-abcdefghijkl", "tok_abcdefghijklmn"]);
  });
});

describe("iosBuildEnv（チャットのプレビューは --dev 以外で必ず 0）", () => {
  it("本番ビルドでは .env.local やシェルの 1 を上書きして 0 にする", () => {
    const env = iosBuildEnv([], { NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "1", HOME: "/h" }, PROD_API_BASE);
    expect(env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW).toBe("0");
    expect(env.KIRI_BUILD_TARGET).toBe("ios");
    expect(env.NEXT_PUBLIC_KIRI_API_BASE).toBe(PROD_API_BASE);
    expect(env.HOME).toBe("/h");
  });

  it("未設定でも本番ビルドでは 0 をプロセス環境に置く（.env.local より優先させるため）", () => {
    expect(iosBuildEnv([], {}, PROD_API_BASE).NEXT_PUBLIC_KIRI_CHAT_PREVIEW).toBe("0");
  });

  it("--dev では強制しない（開発者の設定に任せる）", () => {
    expect(iosBuildEnv(["--dev"], { NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "1" }, DEV_API_BASE).NEXT_PUBLIC_KIRI_CHAT_PREVIEW).toBe("1");
    expect("NEXT_PUBLIC_KIRI_CHAT_PREVIEW" in iosBuildEnv(["--dev"], {}, DEV_API_BASE)).toBe(false);
  });
});

describe("findPreviewUiInExport（本番の書き出しにチャット入口・開発者向け文言が無いこと）", () => {
  let dir;
  const escape = (text, upper = false) =>
    [...text].map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0x80) return ch;
      const hex = code.toString(16).padStart(4, "0");
      return `\\u${upper ? hex.toUpperCase() : hex}`;
    }).join("");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kiri-out-"));
    mkdirSync(join(dir, "_next/static/chunks"), { recursive: true });
    mkdirSync(join(dir, "terms"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html>Kiri</html>");
    // 規約・サポートのページ本文は「開発プレビュー」に触れてよい（台帳 L-4・Phase 3 で改稿）。
    writeFileSync(join(dir, "terms/index.html"), "対話機能は開発プレビューであり");
    writeFileSync(join(dir, "terms/index.txt"), "対話機能は開発プレビューであり");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("クリーンな書き出しは問題なし", () => {
    expect(findPreviewUiInExport(dir)).toEqual([]);
  });

  it.each([
    ["生の UTF-8", (t) => t],
    ["\\u エスケープ（小文字）", (t) => escape(t)],
    ["\\u エスケープ（大文字）", (t) => escape(t, true)],
  ])("チャット入口のボタン文言を見つける（%s）", (_label, encode) => {
    writeFileSync(join(dir, "_next/static/chunks/a.js"), `children:"${encode("開発プレビューでKiriに聞く")}"`);
    const problems = findPreviewUiInExport(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("_next/static/chunks/a.js");
  });

  it("HTML に入ったチャット入口も見つける", () => {
    writeFileSync(join(dir, "index.html"), "<button>開発プレビューでKiriに聞く</button>");
    expect(findPreviewUiInExport(dir)).toHaveLength(1);
  });

  it.each([["StoreKit"], ["Kiriとの対話（プレミアム）"]])("開発者向けの文言 %s を見つける", (marker) => {
    writeFileSync(join(dir, "_next/static/chunks/b.js"), `x="${escape(marker)}"`);
    expect(findPreviewUiInExport(dir)).toHaveLength(1);
  });

  it("_next の中の「開発プレビュー」はどこでも問題（チャット欄の注記など）", () => {
    writeFileSync(join(dir, "_next/static/chunks/c.js"), `x="${escape("開発プレビュー：購入")}"`);
    expect(findPreviewUiInExport(dir)).toHaveLength(1);
  });
});

describe("verifyExport（ビルド後の検査のまとめ）", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kiri-out-"));
    for (const page of ["privacy", "terms", "support"]) {
      mkdirSync(join(dir, page), { recursive: true });
      writeFileSync(join(dir, page, "index.html"), "<html></html>");
    }
    mkdirSync(join(dir, "_next"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html>Kiri</html>");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("クリーンなら空", () => {
    expect(verifyExport(dir)).toEqual([]);
  });

  it("必須ページが欠けていたら問題", () => {
    rmSync(join(dir, "terms"), { recursive: true });
    expect(verifyExport(dir)[0]).toContain("terms/index.html");
  });

  it("本番向けではプレビュー UI を問題にし、--dev（production: false）では見逃す", () => {
    writeFileSync(join(dir, "_next/a.js"), "開発プレビューでKiriに聞く");
    expect(verifyExport(dir)).toHaveLength(1);
    expect(verifyExport(dir, { production: false })).toEqual([]);
  });

  it("秘密の値はどちらでも問題", () => {
    writeFileSync(join(dir, "_next/a.js"), "sk-test-abcdefghijklmnop");
    expect(verifyExport(dir, { production: false, secretValues: ["sk-test-abcdefghijklmnop"] })).toHaveLength(1);
  });
});

// Phase 3（ブリーフ「設計書からの変更 5」）: 公開キーが無ければ警告して IAP なし（今の挙動）。
// --require-iap でキー必須。本番ビルドにモックは入れない。
describe("resolveIapBuild（購入機能をビルドに入れるか）", () => {
  const KEY = "appl_AbCdEfGhIjKlMnOp123";

  it("キー無しの本番ビルドは警告して IAP なし", () => {
    const iap = resolveIapBuild([], {});
    expect(iap).toMatchObject({ iap: "0", mock: "0", key: "" });
    expect(iap.warnings.join("\n")).toMatch(/NEXT_PUBLIC_REVENUECAT_IOS_KEY/);
  });

  it("キーがあれば IAP あり（警告なし）", () => {
    expect(resolveIapBuild([], { NEXT_PUBLIC_REVENUECAT_IOS_KEY: ` ${KEY} ` })).toEqual({ iap: "1", mock: "0", key: KEY, warnings: [] });
  });

  it("--require-iap でキーが無ければ止める", () => {
    expect(() => resolveIapBuild(["--require-iap"], {})).toThrow(/NEXT_PUBLIC_REVENUECAT_IOS_KEY/);
    expect(resolveIapBuild(["--require-iap"], { NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY }).iap).toBe("1");
  });

  it("秘密キー（sk_）や形の違うキーは埋め込まずに止める", () => {
    expect(() => resolveIapBuild([], { NEXT_PUBLIC_REVENUECAT_IOS_KEY: "sk_abcdefghijklmnop" })).toThrow(/appl_/);
    expect(() => resolveIapBuild([], { NEXT_PUBLIC_REVENUECAT_IOS_KEY: "appl_ with space" })).toThrow(/appl_/);
  });

  it("本番ビルドにモックを頼まれたら止める", () => {
    expect(() => resolveIapBuild([], { NEXT_PUBLIC_KIRI_IAP_MOCK: "1" })).toThrow(/モック/);
    expect(() => resolveIapBuild(["--require-iap"], { NEXT_PUBLIC_KIRI_IAP_MOCK: "1", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY })).toThrow(/モック/);
  });

  it("--dev はモックを使える（キー無しでも IAP あり）", () => {
    expect(resolveIapBuild(["--dev"], { NEXT_PUBLIC_KIRI_IAP_MOCK: "1" })).toEqual({ iap: "1", mock: "1", key: "", warnings: [] });
  });

  it("--dev でキーとモックが両方あればモックを優先し、キーは埋め込まない", () => {
    expect(resolveIapBuild(["--dev"], { NEXT_PUBLIC_KIRI_IAP_MOCK: "1", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY })).toEqual({ iap: "1", mock: "1", key: "", warnings: [] });
  });

  it("--dev でキーだけなら本物の購入（サンドボックス）", () => {
    expect(resolveIapBuild(["--dev"], { NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY })).toMatchObject({ iap: "1", mock: "0", key: KEY });
  });
});

describe("iosBuildEnv（IAP の定数をプロセス環境で渡し、.env.local より優先させる）", () => {
  it("本番ビルドは IAP・モック・キーを必ず上書きする", () => {
    const env = iosBuildEnv([], { NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_KIRI_IAP_MOCK: "1" }, PROD_API_BASE, { iap: "0", mock: "0", key: "" });
    expect(env).toMatchObject({ NEXT_PUBLIC_KIRI_IAP: "0", NEXT_PUBLIC_KIRI_IAP_MOCK: "0", NEXT_PUBLIC_REVENUECAT_IOS_KEY: "" });
  });

  it("IAP ありならキーを渡す", () => {
    const env = iosBuildEnv([], {}, PROD_API_BASE, { iap: "1", mock: "0", key: "appl_x" });
    expect(env).toMatchObject({ NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_KIRI_IAP_MOCK: "0", NEXT_PUBLIC_REVENUECAT_IOS_KEY: "appl_x" });
  });

  it("IAP の指定が無ければ IAP なし（従来の呼び出し）", () => {
    expect(iosBuildEnv([], {}, PROD_API_BASE)).toMatchObject({ NEXT_PUBLIC_KIRI_IAP: "0", NEXT_PUBLIC_KIRI_IAP_MOCK: "0" });
  });
});

describe("本番の書き出しにモック購入が混ざらない", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kiri-out-"));
    for (const page of ["privacy", "terms", "support"]) {
      mkdirSync(join(dir, page), { recursive: true });
      writeFileSync(join(dir, page, "index.html"), "<html></html>");
    }
    mkdirSync(join(dir, "_next"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html>Kiri</html>");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("モックの目印が _next にあれば本番では問題、--dev では見逃す", () => {
    writeFileSync(join(dir, "_next/a.js"), `marker:"${IAP_MOCK_MARKER}"`);
    expect(verifyExport(dir)).toHaveLength(1);
    expect(verifyExport(dir, { production: false })).toEqual([]);
  });
});

describe("parseIosBuildArgs（--require-iap）", () => {
  it("--require-iap を受け付ける", async () => {
    const { parseIosBuildArgs } = await import("../lib/iosBuild.mjs");
    expect(parseIosBuildArgs(["--require-iap"])).toEqual({ dev: false, requireIap: true });
    expect(parseIosBuildArgs(["--dev"])).toEqual({ dev: true, requireIap: false });
  });
});
