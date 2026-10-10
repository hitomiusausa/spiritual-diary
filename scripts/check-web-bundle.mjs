// Web（Workers）に上げる前の検査（F-B6）: 購入「Kiriと話す」・チャット欄・RevenueCat がバンドルに無いこと。
//   node scripts/check-web-bundle.mjs                 … OpenNext の成果物 .open-next/assets/_next/static を調べる
//   node scripts/check-web-bundle.mjs .next/static    … next build の直後に調べる
// iOS 用（npm run ios:build）の書き出しには購入まわりが入るのが正しいので、ここでは調べない（out/ は別の検査）。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findPurchaseUiInWebBundle } from "./lib/webBundle.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ? resolve(process.argv[2]) : join(projectRoot, ".open-next/assets/_next/static");

const problems = findPurchaseUiInWebBundle(target);
if (problems.length) {
  console.error("[check-web-bundle] 中止: Web のバンドルに購入・チャットの内容が含まれています");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("NEXT_PUBLIC_KIRI_IAP / NEXT_PUBLIC_KIRI_CHAT_PREVIEW を外してビルドし直してください（Web 本番は常に '0'）。");
  process.exit(1);
}
console.log(`[check-web-bundle] OK: ${target} に購入・チャットの内容はありません`);
