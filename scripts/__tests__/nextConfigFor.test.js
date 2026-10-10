import { describe, it, expect } from "vitest";
import { nextConfigFor, DEV_SERVER_PHASE } from "../lib/nextConfigFor.mjs";

const OFF = { NEXT_PUBLIC_KIRI_IAP: "0", NEXT_PUBLIC_KIRI_IAP_MOCK: "0", NEXT_PUBLIC_REVENUECAT_IOS_KEY: "" };

describe("nextConfigFor", () => {
  it("既定（Web / Workers）は API ルート（*.api.js）を含め、静的書き出ししない", () => {
    const config = nextConfigFor({});
    expect(config.pageExtensions).toEqual(["api.js", "js", "jsx"]);
    expect(config).not.toHaveProperty("output");
    expect(config).not.toHaveProperty("trailingSlash");
    expect(config).not.toHaveProperty("distDir");
  });

  it("KIRI_BUILD_TARGET=ios は API ルートを外し、out/ へ静的書き出しする", () => {
    const config = nextConfigFor({ KIRI_BUILD_TARGET: "ios" });
    expect(config.pageExtensions).toEqual(["js", "jsx"]);
    expect(config.output).toBe("export");
    expect(config.trailingSlash).toBe(true);
    expect(config).not.toHaveProperty("distDir");
  });

  it.each([["IOS"], ["web"], [""], ["1"]])("ios 以外の値（%s）は Web と同じ", (value) => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: value })).toEqual(nextConfigFor({}));
  });

  it.each([[{}], [{ KIRI_BUILD_TARGET: "ios" }]])("共通設定は不変（%o）", (env) => {
    const config = nextConfigFor(env);
    expect(config.agentRules).toBe(false);
    expect(config.images).toEqual({ unoptimized: true });
  });

  it("チャットのプレビュー表示は、未設定なら '0' で埋め込む（未使用コードをバンドルから消すため）", () => {
    expect(nextConfigFor({}).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0", ...OFF });
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios" }).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0", ...OFF });
  });

  it("チャットのプレビュー表示は、'1' のときだけ '1' を埋め込む", () => {
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "1" }).env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW).toBe("1");
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "true" }).env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW).toBe("0");
  });
});

// Phase 3（D-28/D-30・ブリーフ「設計書からの変更 5」）: 購入まわりのビルド時定数。
describe("nextConfigFor の IAP 定数", () => {
  const KEY = "appl_abcdefghijklmnop";
  const all = { NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_KIRI_IAP_MOCK: "1", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY };

  it("Web（next build・Workers）は何を渡しても IAP なし・キーも埋め込まない", () => {
    expect(nextConfigFor(all).env).toMatchObject(OFF);
    expect(nextConfigFor(all, { phase: "phase-production-build" }).env).toMatchObject(OFF);
  });

  it("iOS は IAP=1 と公開キーがそろったときだけ有効（キーを埋め込む）", () => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios", NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY }).env).toMatchObject({
      NEXT_PUBLIC_KIRI_IAP: "1",
      NEXT_PUBLIC_KIRI_IAP_MOCK: "0",
      NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY,
    });
  });

  it("iOS でもキーもモックも無ければ IAP なし（今の挙動）", () => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios", NEXT_PUBLIC_KIRI_IAP: "1" }).env).toMatchObject(OFF);
  });

  it("iOS でキーがあっても IAP=1 でなければ無効・キーも埋め込まない", () => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY }).env).toMatchObject(OFF);
  });

  it("iOS のモック（ios:build --dev が IAP=1・MOCK=1 を渡す）", () => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios", NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_KIRI_IAP_MOCK: "1" }).env).toMatchObject({
      NEXT_PUBLIC_KIRI_IAP: "1",
      NEXT_PUBLIC_KIRI_IAP_MOCK: "1",
      NEXT_PUBLIC_REVENUECAT_IOS_KEY: "",
    });
  });

  it("next dev（開発サーバー）では IAP=1・MOCK=1 でモック購入を試せる（キーは埋め込まない）", () => {
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_IAP: "1", NEXT_PUBLIC_KIRI_IAP_MOCK: "1", NEXT_PUBLIC_REVENUECAT_IOS_KEY: KEY }, { phase: DEV_SERVER_PHASE }).env).toMatchObject({
      NEXT_PUBLIC_KIRI_IAP: "1",
      NEXT_PUBLIC_KIRI_IAP_MOCK: "1",
      NEXT_PUBLIC_REVENUECAT_IOS_KEY: "",
    });
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_IAP: "1" }, { phase: DEV_SERVER_PHASE }).env).toMatchObject(OFF);
    expect(nextConfigFor({}, { phase: DEV_SERVER_PHASE }).env).toMatchObject(OFF);
  });

  it("'1' 以外の値は無効", () => {
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios", NEXT_PUBLIC_KIRI_IAP: "true", NEXT_PUBLIC_KIRI_IAP_MOCK: "1" }).env).toMatchObject(OFF);
  });
});
