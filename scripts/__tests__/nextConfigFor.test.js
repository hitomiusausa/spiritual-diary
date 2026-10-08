import { describe, it, expect } from "vitest";
import { nextConfigFor } from "../lib/nextConfigFor.mjs";

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
    expect(nextConfigFor({}).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0" });
    expect(nextConfigFor({ KIRI_BUILD_TARGET: "ios" }).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0" });
  });

  it("チャットのプレビュー表示は、'1' のときだけ '1' を埋め込む", () => {
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "1" }).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "1" });
    expect(nextConfigFor({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "true" }).env).toEqual({ NEXT_PUBLIC_KIRI_CHAT_PREVIEW: "0" });
  });
});
