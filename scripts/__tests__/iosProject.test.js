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

// L-7: iOS 15.5 以上は 64 ビット端末だけで、ビルドも arm64 のみ。armv7 のままだと arm64 だけのバイナリの
// アップロードで ITMS-90502（arm64 だけなら UIRequiredDeviceCapabilities に arm64 を書く）に当たり得る。
describe("Info.plist UIRequiredDeviceCapabilities", () => {
  it("requires arm64 and no longer lists armv7", () => {
    const plist = readFileSync(join(process.cwd(), "ios/App/App/Info.plist"), "utf8");
    const block = plist.match(/<key>UIRequiredDeviceCapabilities<\/key>\s*<array>([\s\S]*?)<\/array>/);
    expect(block).not.toBeNull();
    const values = [...block[1].matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
    expect(values).toEqual(["arm64"]);
  });
});
