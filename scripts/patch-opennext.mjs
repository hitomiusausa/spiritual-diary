// Next.js 16.4 対応の一時パッチ（DECISIONS.md D-19）。
// Next.js 16.4 から .next/server/preview-props.json が独立し、NextNodeServer が起動時に必ず読む。
// @opennextjs/cloudflare（1.20.9 時点まで）はこのファイルを Worker に埋め込まないため、全ページが 500 になる。
// 上流の修正 PR（opennextjs/opennextjs-cloudflare#1356、issue #1355）と同じ1行の変更を node_modules に当てる。
// パッチ後（＝上流修正後）の行と完全一致すれば何もしない。どちらとも一致しなければ止めて知らせる。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPreviewPropsPatch } from "./lib/previewPropsPatch.mjs";

// package.json の exports で package.json 自体を解決できないため、リポジトリ直下の node_modules を見る。
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(projectRoot, "node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js");

const { status, source } = applyPreviewPropsPatch(readFileSync(target, "utf8"));
if (status === "patched") {
  writeFileSync(target, source);
  console.log("[patch-opennext] load-manifest に preview-props.json を追加しました");
} else if (status === "already") {
  console.log("[patch-opennext] preview-props.json は既に対象です（変更なし）");
} else {
  console.error("[patch-opennext] 想定した行が見つかりません。@opennextjs/cloudflare の更新内容を確認してください:", target);
  process.exit(1);
}
