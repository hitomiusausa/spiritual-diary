// iOS 静的書き出し（npm run ios:build）の補助。純粋関数だけを置き、scripts/build-ios.mjs から使う。
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { IOS_BUILD_TARGET } from "./nextConfigFor.mjs";

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

// npm run ios:build / ios:sync の引数。受け付けるのは --dev だけ。知らない引数は黙って無視せず止める（L-6）。
export const IOS_BUILD_FLAGS = Object.freeze(["--dev"]);
export function parseIosBuildArgs(argv = []) {
  const unknown = argv.filter((arg) => !IOS_BUILD_FLAGS.includes(arg));
  if (unknown.length) {
    throw new Error(`知らない引数です: ${unknown.join(" ")}（使えるのは ${IOS_BUILD_FLAGS.join(" ")} だけ）`);
  }
  return { dev: argv.includes("--dev") };
}

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

// シェルで export された秘密も照合する（.env* に無くても next build のプロセス環境には入る）。
export const SECRET_ENV_NAMES = Object.freeze([
  "CLAUDE_API_KEY",
  "KIRI_STORE_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
]);

// dotenv（@next/env）と同じ読み方で値を取り出す: クォートで囲めば中身だけ（# も値のうち）、
// 囲まなければ最初の # から後ろはコメント。前後の空白は落とす。
function dotenvValue(raw) {
  const text = raw.trim();
  const quoted = text.match(/^(['"`])([\s\S]*?)\1/);
  if (quoted) return quoted[2];
  const hash = text.indexOf("#");
  return (hash === -1 ? text : text.slice(0, hash)).trim();
}

// .env 形式の本文から、NEXT_PUBLIC_ 以外の値（秘密の可能性があるもの）を取り出す。
export function secretValuesFromDotenv(text) {
  const values = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || match[1].startsWith("NEXT_PUBLIC_")) continue;
    const value = dotenvValue(match[2]);
    if (value.length >= MIN_SECRET_VALUE_LENGTH) values.push(value);
  }
  return values;
}

export function secretValuesFromEnv(env = {}) {
  return SECRET_ENV_NAMES.map((name) => String(env[name] ?? "").trim()).filter(
    (value) => value.length >= MIN_SECRET_VALUE_LENGTH,
  );
}

// next build に渡すプロセス環境。プロセス環境は .env* より優先される。
// 本番向け（--dev なし）はチャットのプレビューを必ず '0' にする（.env.local の '1' を持ち込まない。Q4）。
export function iosBuildEnv(argv = [], env = {}, apiBase = PROD_API_BASE) {
  const next = { ...env, KIRI_BUILD_TARGET: IOS_BUILD_TARGET, NEXT_PUBLIC_KIRI_API_BASE: apiBase };
  if (!argv.includes("--dev")) next.NEXT_PUBLIC_KIRI_CHAT_PREVIEW = "0";
  return next;
}

// 本番向けの書き出しに入っていてはいけない、チャット入口・開発者向けの文言。
// どのファイルでも不可のものと、_next/（JS バンドル・画面）の中だけ不可のものに分ける。
// 規約・サポートのページ本文は「開発プレビュー」に触れている（台帳 L-4、Phase 3 で改稿）ので、そこは許す。
export const PREVIEW_UI_MARKERS = Object.freeze(["開発プレビューでKiriに聞く", "Kiriとの対話（プレミアム）", "StoreKit"]);
export const PREVIEW_UI_BUNDLE_MARKERS = Object.freeze(["開発プレビュー"]);

// バンドルでは日本語が \uXXXX にエスケープされることがあるので、生の形と両方で探す。
function markerForms(marker) {
  const escaped = (upper) =>
    [...marker]
      .map((ch) => {
        const code = ch.charCodeAt(0);
        if (code < 0x80) return ch;
        const hex = code.toString(16).padStart(4, "0");
        return `\\u${upper ? hex.toUpperCase() : hex}`;
      })
      .join("");
  return [...new Set([marker, escaped(false), escaped(true)])];
}

export function findPreviewUiInExport(outDir) {
  const problems = [];
  for (const file of walk(outDir)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(outDir, file);
    const inBundle = rel.split(sep)[0] === "_next";
    const markers = inBundle ? [...PREVIEW_UI_MARKERS, ...PREVIEW_UI_BUNDLE_MARKERS] : PREVIEW_UI_MARKERS;
    const hits = markers.filter((marker) => markerForms(marker).some((form) => text.includes(form)));
    if (hits.length) problems.push(`${rel}: ${hits.join(" / ")}`);
  }
  return problems;
}

export const REQUIRED_PAGES = Object.freeze(["index.html", "privacy/index.html", "terms/index.html", "support/index.html"]);

// ビルド後の検査をまとめる。問題の一覧を返す（空なら OK）。本番向け（production）ではプレビュー UI も検査する。
export function verifyExport(outDir, { secretValues = [], production = true } = {}) {
  const missing = REQUIRED_PAGES.filter((page) => !existsSync(join(outDir, page)));
  if (missing.length) return [`out/ に必要なページがありません: ${missing.join(", ")}`];
  const problems = findForbiddenInExport(outDir, { secretValues });
  if (production) problems.push(...findPreviewUiInExport(outDir));
  return problems;
}
