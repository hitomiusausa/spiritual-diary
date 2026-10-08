import { describe, it, expect } from "vitest";
import { applyPreviewPropsPatch, PATCH_BEFORE, PATCH_AFTER } from "../lib/previewPropsPatch.mjs";

const wrap = (glob) => `const manifests = await glob(join(dotNextDir, "${glob}"), {\n`;

describe("applyPreviewPropsPatch", () => {
  it("未パッチの行を1か所だけ置き換える", () => {
    expect(applyPreviewPropsPatch(wrap(PATCH_BEFORE))).toEqual({ status: "patched", source: wrap(PATCH_AFTER) });
  });

  it("上流修正後・パッチ済みの行と一致すれば何もしない", () => {
    expect(applyPreviewPropsPatch(wrap(PATCH_AFTER))).toEqual({ status: "already", source: wrap(PATCH_AFTER) });
  });

  it("preview-props という語があるだけでは直し済みとみなさない", () => {
    const source = wrap("**/{*-manifest,prefetch-hints}.json") + "// preview-props\n";
    expect(applyPreviewPropsPatch(source).status).toBe("unexpected");
  });

  it("対象行が複数あれば想定外として止める", () => {
    expect(applyPreviewPropsPatch(wrap(PATCH_BEFORE) + wrap(PATCH_BEFORE)).status).toBe("unexpected");
  });
});
