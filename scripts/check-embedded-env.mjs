// upload / deploy の直前に必ず走らせる検査（DECISIONS.md D-19）。
// OpenNext のビルド成果物（.open-next/cloudflare/next-env.mjs）に .env* の値が埋め込まれていたら止める。
// 秘密は Cloudflare の Secrets に置く。.env* のあるフォルダでビルドした成果物は上げない。
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findEmbeddedEnv } from "./lib/embeddedEnv.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? join(projectRoot, ".open-next/cloudflare/next-env.mjs");

const { ok, problems } = findEmbeddedEnv(target);
if (!ok) {
  console.error("[check-embedded-env] 中止: ビルド成果物に環境変数が埋め込まれています（値は表示しません）");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(".env / .env.local などを外してビルドし直すか、Workers Builds からデプロイしてください。");
  process.exit(1);
}
console.log("[check-embedded-env] OK: next-env.mjs の全モードが空です");
