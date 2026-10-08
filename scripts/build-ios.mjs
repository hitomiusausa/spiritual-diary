// iOS アプリ（Capacitor）に同梱する静的書き出しを out/ に作る（設計 Ruling 2・npm run ios:build）。
//   npm run ios:build            … API は本番 https://kiri.kugainc.com
//   npm run ios:build -- --dev   … API はローカル dev サーバー http://localhost:3000
//   NEXT_PUBLIC_KIRI_API_BASE=... npm run ios:build … API のオリジンを明示
// 環境変数はプロセス環境として next build に渡す。.env.ios のようなファイルは作らない
// （OpenNext が .env* を Worker に埋め込むため。DECISIONS.md D-19）。
// .next を共有するので、npm run dev や cf:build と同時に走らせないこと。
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IOS_BUILD_TARGET } from "./lib/nextConfigFor.mjs";
import { findForbiddenInExport, resolveApiBase, secretValuesFromDotenv } from "./lib/iosBuild.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(projectRoot, "out");
const REQUIRED_PAGES = ["index.html", "privacy/index.html", "terms/index.html", "support/index.html"];

function fail(message) {
  console.error(`[ios:build] 中止: ${message}`);
  process.exit(1);
}

let apiBase;
try {
  apiBase = resolveApiBase(process.argv.slice(2), process.env);
} catch (error) {
  fail(error.message);
}

// next build は .env* を読み込む。NEXT_PUBLIC_ 以外の値が書き出しに混ざっていないか、後で照合する。
const dotenvFiles = readdirSync(projectRoot).filter((name) => name.startsWith(".env") && name !== ".env.example");
const secretValues = dotenvFiles.flatMap((name) => secretValuesFromDotenv(readFileSync(join(projectRoot, name), "utf8")));
if (dotenvFiles.length) {
  console.warn(`[ios:build] 注意: ${dotenvFiles.join(", ")} があります。NEXT_PUBLIC_* は書き出しに入ります（値の埋め込みは後で検査します）`);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`[ios:build] API: ${apiBase}`);

const result = spawnSync("npx", ["next", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, KIRI_BUILD_TARGET: IOS_BUILD_TARGET, NEXT_PUBLIC_KIRI_API_BASE: apiBase },
});
if (result.status !== 0) fail(`next build が失敗しました（終了コード ${result.status}）`);

const missing = REQUIRED_PAGES.filter((page) => !existsSync(join(outDir, page)));
if (missing.length) fail(`out/ に必要なページがありません: ${missing.join(", ")}`);

const problems = findForbiddenInExport(outDir, { secretValues });
if (problems.length) {
  for (const problem of problems) console.error(`  - ${problem}`);
  fail("書き出しにサーバー専用の内容が含まれています。out/ を使わないでください");
}

console.log("[ios:build] OK: out/ を書き出しました（API ルートなし・秘密の埋め込みなし）");
