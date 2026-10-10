import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIosBuildArgs } from "../lib/iosBuild.mjs";

// L-6: `npm run ios:sync -- --dev` は npm が `--dev` を最後のコマンド（cap sync）に付けるため、
// 静的書き出しは本番向けのまま黙って同期されていた。フラグは書き出し側へ渡し、知らないフラグでは止める。
describe("parseIosBuildArgs", () => {
  it("フラグなしは本番向け", () => {
    expect(parseIosBuildArgs([])).toEqual({ dev: false, requireIap: false });
  });

  it("--dev はローカル dev 向け", () => {
    expect(parseIosBuildArgs(["--dev"])).toEqual({ dev: true, requireIap: false });
  });

  it.each([["--prod"], ["-d"], ["dev"], ["--dev=1"]])("知らない引数（%s）は止める", (arg) => {
    expect(() => parseIosBuildArgs([arg])).toThrow(/知らない引数/);
  });
});

describe("package.json の iOS スクリプト", () => {
  const scripts = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).scripts;

  it("ios:sync は引数を書き出しへ渡す（cap sync に直接付けない）", () => {
    expect(scripts["ios:sync"]).toBe("node scripts/sync-ios.mjs");
  });

  it("ios:sync:dev が 1 コマンドで dev 向けに書き出して同期する", () => {
    expect(scripts["ios:sync:dev"]).toBe("node scripts/sync-ios.mjs --dev");
  });
});
