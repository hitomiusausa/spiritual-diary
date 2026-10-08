// Cloudflare へ上げる前の安全確認（DECISIONS.md D-19）。
// OpenNext は build 時に .env / .env.local / .env.<mode>(.local) の中身を Worker のコード
// （.open-next/cloudflare/next-env.mjs）へ埋め込む。ローカルの秘密を本番コードに混ぜないよう、
// これらのファイルがある作業ツリーからは deploy / upload させない。秘密は Cloudflare の Secrets に置く。
import { existsSync } from "node:fs";

const MODES = ["production", "development", "test"];
const ENV_FILES = [".env", ".env.local", ...MODES.flatMap((mode) => [`.env.${mode}`, `.env.${mode}.local`])];

const found = ENV_FILES.filter((file) => existsSync(file));
if (found.length > 0) {
  console.error(
    `[deploy-guard] ${found.join(", ")} があるため中止しました。OpenNext はこれらの値を Worker に埋め込みます。` +
      "\n秘密は Cloudflare の Secrets に置き、.env* の無いクリーンなチェックアウト（または Workers Builds）からデプロイしてください。",
  );
  process.exit(1);
}
