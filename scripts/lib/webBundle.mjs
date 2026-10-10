// Web の本番バンドル（Workers に上げる _next/static）に、購入「Kiriと話す」・チャット欄の文言や
// RevenueCat のプラグインが混ざっていないかを調べる（F-B6・D-24 の性質）。Web 本番は NEXT_PUBLIC_KIRI_IAP='0' で
// これらはバンドルから消えるはず。残っていれば、モジュールの初期化に副作用（Object.freeze など）が入ったか、
// 分岐の外で import している。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const WEB_BUNDLE_FORBIDDEN = [
  "Kiriと話す",
  "1日60通",
  "購入を復元",
  "月額の自動更新",
  "Kiriに続けて聞く",
  "解約したあとも",
  "kiri-iap-mock",
  // @revenuecat/purchases-capacitor（動的 import のチャンク）の目印
  "checkTrialOrIntroductoryPriceEligibility",
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|html|txt|json|rsc)$/.test(name)) yield path;
  }
}

const unicodeEscaped = (text) => text.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function findPurchaseUiInWebBundle(dir) {
  if (!existsSync(dir)) return [`${dir} が見つかりません（ビルド後に実行してください）`];
  const problems = [];
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    const lower = text.toLowerCase();
    for (const marker of WEB_BUNDLE_FORBIDDEN) {
      if (text.includes(marker) || lower.includes(unicodeEscaped(marker).toLowerCase())) problems.push(`${relative(dir, file)}: ${marker}`);
    }
  }
  return problems;
}
