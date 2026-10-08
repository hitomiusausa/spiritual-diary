// iOS 静的書き出し（npm run ios:build）の補助。純粋関数だけを置き、scripts/build-ios.mjs から使う。
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export const PROD_API_BASE = "https://kiri.kugainc.com";
export const DEV_API_BASE = "http://localhost:3000";

// 書き出しに入っていてはいけない文字列（サーバー専用の依存・秘密の変数名・上流 API）。
// 事業者名としての「Anthropic」「Upstash」はプライバシーポリシーの本文に出るので対象外。
export const FORBIDDEN_MARKERS = Object.freeze([
  "CLAUDE_API_KEY",
  "UPSTASH_REDIS",
  "KV_REST_API",
  "KIRI_STORE_SECRET",
  "api.anthropic.com",
  "@upstash/redis",
  "x-api-key",
]);

// API のベースURL: 明示の NEXT_PUBLIC_KIRI_API_BASE ＞ --dev（ローカル dev）＞ 本番。
// オリジンだけを受け付ける（パスや末尾スラッシュ付きは apiUrl() の連結を壊すので拒否）。
export function resolveApiBase(argv = [], env = {}) {
  const value = env.NEXT_PUBLIC_KIRI_API_BASE || (argv.includes("--dev") ? DEV_API_BASE : PROD_API_BASE);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_KIRI_API_BASE が URL ではありません: ${value}`);
  }
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== value) {
    throw new Error(`NEXT_PUBLIC_KIRI_API_BASE はオリジンだけを指定してください（例: ${PROD_API_BASE}）: ${value}`);
  }
  return value;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

// 書き出し（out/）を検査し、問題の一覧を返す（空なら OK）。値そのものは返さない。
// secretValues: .env* などから集めた秘密の値。書き出しに現れたら問題にする。
export function findForbiddenInExport(outDir, { secretValues = [] } = {}) {
  const problems = [];
  if (existsSync(join(outDir, "api"))) problems.push("api/ が書き出しに残っています（API ルートは iOS に含めない）");
  for (const file of walk(outDir)) {
    const text = readFileSync(file).toString("latin1");
    const rel = relative(outDir, file);
    for (const marker of FORBIDDEN_MARKERS) {
      if (text.includes(marker)) problems.push(`${rel}: ${marker}`);
    }
    if (secretValues.some((value) => text.includes(value))) problems.push(`${rel}: 環境変数の値が埋め込まれています`);
  }
  return problems;
}

const MIN_SECRET_VALUE_LENGTH = 12;

// .env 形式の本文から、NEXT_PUBLIC_ 以外の値（秘密の可能性があるもの）を取り出す。
export function secretValuesFromDotenv(text) {
  const values = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || match[1].startsWith("NEXT_PUBLIC_")) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value.length >= MIN_SECRET_VALUE_LENGTH) values.push(value);
  }
  return values;
}
