// iOS の静的書き出し（scripts/build-ios.mjs）→ npx cap sync ios を 1 コマンドで行う（npm run ios:sync / ios:sync:dev）。
//   npm run ios:sync          … API は本番
//   npm run ios:sync:dev      … API はローカル dev サーバー（= npm run ios:sync -- --dev）
// 以前の `npm run ios:build && cap sync ios` は `-- --dev` が cap sync 側に付いて効かなかった（L-6）。
// 引数はすべて書き出し側へ渡し、知らない引数なら書き出しの前に止める。
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIosBuildArgs } from "./lib/iosBuild.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

try {
  parseIosBuildArgs(argv);
} catch (error) {
  console.error(`[ios:sync] 中止: ${error.message}`);
  process.exit(1);
}

const build = spawnSync(process.execPath, [join(projectRoot, "scripts/build-ios.mjs"), ...argv], { cwd: projectRoot, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const sync = spawnSync("npx", ["cap", "sync", "ios"], { cwd: projectRoot, stdio: "inherit" });
process.exit(sync.status ?? 1);
