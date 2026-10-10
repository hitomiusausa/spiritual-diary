import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WEB_BUNDLE_FORBIDDEN, findPurchaseUiInWebBundle } from "../lib/webBundle.mjs";
import { KIRI_TALK_NAME, kiriTalkPromises } from "../../src/lib/kiriTalk.js";

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kiri-web-bundle-"));
  mkdirSync(join(dir, "chunks"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("Web の本番バンドルに購入まわりが無いこと（F-B6）", () => {
  it("禁止文字列は購入画面・入口・RevenueCat の目印を含む", () => {
    expect(WEB_BUNDLE_FORBIDDEN).toEqual(expect.arrayContaining([KIRI_TALK_NAME, "1日60通", "購入を復元", "kiri-iap-mock", "checkTrialOrIntroductoryPriceEligibility"]));
    expect(kiriTalkPromises()[0].title).toContain("1日60通");
  });

  it("きれいなバンドルは問題なし", () => {
    writeFileSync(join(dir, "chunks/a.js"), 'console.log("今日の読み解き")');
    expect(findPurchaseUiInWebBundle(dir)).toEqual([]);
  });

  it("そのままの文字列も \\\\u エスケープも見つける", () => {
    writeFileSync(join(dir, "chunks/a.js"), 'const t="Kiriと話せる（1日60通まで）"');
    writeFileSync(join(dir, "chunks/b.js"), 'const t="\\u8cfc\\u5165\\u3092\\u5fa9\\u5143"');
    writeFileSync(join(dir, "chunks/c.js"), "Purchases.checkTrialOrIntroductoryPriceEligibility()");
    const problems = findPurchaseUiInWebBundle(dir);
    expect(problems).toEqual(
      expect.arrayContaining(["chunks/a.js: 1日60通", "chunks/b.js: 購入を復元", "chunks/c.js: checkTrialOrIntroductoryPriceEligibility"]),
    );
  });

  it("フォルダが無ければ問題として返す（ビルド前に走らせない）", () => {
    expect(findPurchaseUiInWebBundle(join(dir, "missing"))[0]).toMatch(/見つかりません/);
  });
});
