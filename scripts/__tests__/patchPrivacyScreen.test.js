import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIVACY_SCREEN_PATCH,
  PRIVACY_SCREEN_TARGET,
  PRIVACY_SCREEN_VERSION,
  UPSTREAM_SHA256,
  decidePrivacyScreenPatch,
  sha256,
} from "../lib/privacyScreenPatch.mjs";

const root = process.cwd();
const patch = readFileSync(join(root, PRIVACY_SCREEN_PATCH), "utf8");

describe("decidePrivacyScreenPatch", () => {
  it("replaces only the exact upstream 2.0.1 file", () => {
    const upstream = "// upstream PrivacyScreenPlugin.swift\n";
    const args = { patch, version: PRIVACY_SCREEN_VERSION, upstreamSha256: sha256(upstream) };
    expect(decidePrivacyScreenPatch({ ...args, installed: upstream })).toEqual({ status: "patched" });
    expect(decidePrivacyScreenPatch({ ...args, installed: `${upstream} ` })).toMatchObject({ status: "unexpected" });
    expect(UPSTREAM_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does nothing when the patch is already in place", () => {
    expect(decidePrivacyScreenPatch({ installed: patch, patch, version: PRIVACY_SCREEN_VERSION })).toEqual({ status: "already" });
  });

  it("stops on another plugin version, even with the patched content", () => {
    expect(decidePrivacyScreenPatch({ installed: patch, patch, version: "2.0.2" })).toMatchObject({ status: "unexpected" });
  });
});

describe("installed @capacitor/privacy-screen (fails loudly if the patch is missing or upstream changed)", () => {
  it("is the pinned version", () => {
    const pkg = JSON.parse(readFileSync(join(root, "node_modules/@capacitor/privacy-screen/package.json"), "utf8"));
    expect(pkg.version).toBe(PRIVACY_SCREEN_VERSION);
    const ours = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(ours.dependencies["@capacitor/privacy-screen"]).toBe(PRIVACY_SCREEN_VERSION);
  });

  it("carries the Kiri patch (run `node scripts/patch-privacy-screen.mjs`)", () => {
    const installed = readFileSync(join(root, PRIVACY_SCREEN_TARGET), "utf8");
    expect(sha256(installed)).toBe(sha256(patch));
  });

  it("does UIKit work on the main queue and never presents a view controller", () => {
    expect(patch).toContain("DispatchQueue.main.async");
    expect(patch).toContain("dispatchPrecondition(condition: .onQueue(.main))");
    expect(patch).not.toMatch(/\.present\(/);
    expect(patch).not.toMatch(/\.dismiss\(/);
  });

  it("runs on install and before every iOS build", () => {
    const ours = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(ours.scripts.postinstall).toContain("scripts/patch-privacy-screen.mjs");
    expect(readFileSync(join(root, "scripts/build-ios.mjs"), "utf8")).toContain("patch-privacy-screen.mjs");
  });
});
