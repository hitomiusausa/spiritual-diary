// @capacitor/privacy-screen 2.0.1 の iOS 実装を Kiri 版に差し替える（DECISIONS.md D-25・ロック監査 P2-2）。
// 上流の disable() はメインスレッド外で UIKit を触って落ち、Face ID の画面の出入りで「見えない覆い」が残る。
// npm install の後（postinstall）と npm run ios:build の最初に走る。想定外の中身なら止める（黙って未修正で進めない）。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIVACY_SCREEN_PATCH,
  PRIVACY_SCREEN_TARGET,
  decidePrivacyScreenPatch,
} from "./lib/privacyScreenPatch.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(projectRoot, PRIVACY_SCREEN_TARGET);
const patch = readFileSync(join(projectRoot, PRIVACY_SCREEN_PATCH), "utf8");
const { version } = JSON.parse(readFileSync(join(projectRoot, "node_modules/@capacitor/privacy-screen/package.json"), "utf8"));

const { status, reason } = decidePrivacyScreenPatch({ installed: readFileSync(target, "utf8"), patch, version });
if (status === "patched") {
  writeFileSync(target, patch);
  console.log("[patch-privacy-screen] PrivacyScreenPlugin.swift を Kiri 版に差し替えました");
} else if (status === "already") {
  console.log("[patch-privacy-screen] 差し替え済みです（変更なし）");
} else {
  console.error(
    `[patch-privacy-screen] 想定外です（${reason}）。@capacitor/privacy-screen の更新内容を確認し、` +
      "scripts/patches/privacy-screen/ と scripts/lib/privacyScreenPatch.mjs を見直してください:",
    target,
  );
  process.exit(1);
}
