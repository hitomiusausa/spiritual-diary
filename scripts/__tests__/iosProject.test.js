import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ロック画面の下の本体は `inert` で操作・フォーカスから外す（D-25・Ruling 15）。WKWebView の inert は iOS 15.5 から。
// 15.0〜15.4 では外付けキーボードの Tab で本体の入力欄へフォーカスが移れたので、対象 OS を 15.5 に上げた（監査 P2-4）。
describe("iOS deployment target", () => {
  it("is at least iOS 15.5 in every build configuration (inert support)", () => {
    const pbx = readFileSync(join(process.cwd(), "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const [major, minor = "0"] = target.split(".");
      expect(Number(major) * 100 + Number(minor)).toBeGreaterThanOrEqual(1505);
    }
  });
});
