// OpenNext のビルド成果物に .env* の値が埋め込まれていないかを調べる（DECISIONS.md D-19）。
// OpenNext（@opennextjs/cloudflare の compile-env-files.js）は build 時に .env / .env.local /
// .env.<mode>(.local) を読み、.open-next/cloudflare/next-env.mjs に
//   export const production = {...};  export const development = {...};  export const test = {...};
// の形で書き出し、Worker は起動時にこれを process.env に入れる。全モードが空であることを確かめる。
// 成果物は実行せず、文字列として読んで JSON 部分だけを解釈する。
import { existsSync, readFileSync } from "node:fs";

// 秘密として扱う名前（Cloudflare Secrets か .dev.vars だけに置く）。キー名を問わず値が1つでも埋め込まれていれば止まるので、
// この一覧は「少なくともこれらは必ず止まる」ことをテストで固定するためのもの。
export const SECRET_ENV_NAMES = [
  "CLAUDE_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "KIRI_STORE_SECRET",
  "REVENUECAT_SECRET_KEY",
];
export const EXPECTED_MODES = ["production", "development", "test"];
const LINE = /^export const (\w+) = (\{.*\});$/;

export function findEmbeddedEnv(filePath) {
  if (!existsSync(filePath)) {
    return { ok: false, problems: [`${filePath} が見つかりません（ビルド後に実行してください）`] };
  }
  const problems = [];
  const seen = new Set();
  const lines = readFileSync(filePath, "utf8").split("\n").filter((line) => line.trim() !== "");
  for (const line of lines) {
    const match = LINE.exec(line.trim());
    let values = null;
    if (match && EXPECTED_MODES.includes(match[1])) {
      try {
        values = JSON.parse(match[2]);
      } catch {
        values = null;
      }
    }
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      problems.push("想定外の行があります（OpenNext の出力形式が変わった可能性）");
      continue;
    }
    seen.add(match[1]);
    // 値は出さず、キー名だけを報告する
    for (const key of Object.keys(values)) problems.push(`${match[1]}: ${key}`);
  }
  for (const mode of EXPECTED_MODES) {
    if (!seen.has(mode)) problems.push(`${mode} の定義がありません（OpenNext の出力形式が変わった可能性）`);
  }
  return { ok: problems.length === 0, problems };
}
