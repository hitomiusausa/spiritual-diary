// Next.js 16.4 対応の一時パッチ（DECISIONS.md D-19）。
// Next.js 16.4 から .next/server/preview-props.json が独立し、NextNodeServer が起動時に必ず読む。
// @opennextjs/cloudflare（1.20.9 時点まで）はこのファイルを Worker に埋め込まないため、全ページが 500 になる。
// 上流の修正 PR（opennextjs/opennextjs-cloudflare#1356、issue #1355）と同じ1行の変更を node_modules に当てる。
// 上流で直ったら（glob に preview-props が入ったら）何もしない。想定外の形なら止めて知らせる。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// package.json の exports で package.json 自体を解決できないため、リポジトリ直下の node_modules を見る。
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(projectRoot, "node_modules/@opennextjs/cloudflare");
const target = join(pkgDir, "dist/cli/build/patches/plugins/load-manifest.js");

const BEFORE = "**/{*-manifest,required-server-files,prefetch-hints}.json";
const AFTER = "**/{*-manifest,required-server-files,prefetch-hints,preview-props}.json";

const source = readFileSync(target, "utf8");
if (source.includes(AFTER) || /preview-props/.test(source)) {
  console.log("[patch-opennext] preview-props.json は既に対象です（変更なし）");
} else if (source.includes(BEFORE)) {
  writeFileSync(target, source.replace(BEFORE, AFTER));
  console.log("[patch-opennext] load-manifest に preview-props.json を追加しました");
} else {
  console.error("[patch-opennext] 想定した箇所が見つかりません。@opennextjs/cloudflare の更新内容を確認してください:", target);
  process.exit(1);
}
