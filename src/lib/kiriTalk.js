// 「Kiriと話す」（月額サブスク）の画面の文言と出し分け（D-28・D-30・設計 Ruling 5/7/9）。純粋関数だけを置く。
// 価格は必ず StoreKit の文字列（getChatOffering().priceString）を使い、ここに数字を書かない（Ruling 8）。
// 文言の規律: 「暗号化」「パスワード」（D-25）・「占い」（D-27）・「無制限」「パターン分析」（D-30）を使わない（テストで検査）。

export const KIRI_TALK_NAME = "Kiriと話す";
export const KIRI_TALK_KIND = "月額の自動更新サブスクリプション";

export const KIRI_TALK_PROMISES = Object.freeze([
  Object.freeze({ title: "Kiriと話せる（1日60通まで）", detail: "今日の読み解きと記録をふまえて返事をします" }),
  Object.freeze({ title: "会話はこの端末に残ります", detail: "解約したあとも、それまでの会話は読めます" }),
]);

// 購入前に知らせる AI 送信の告知（Ruling 7。購入は同意の対価にしない＝同意が無くても購入画面は開ける）。
export const KIRI_TALK_AI_NOTICE = "対話の言葉は Anthropic社のAI（Claude）に送られます（送信の同意はあとで設定から取り消せます）。";

const FREE_NOTE = "読み解きと日記はこれまでどおり無料です。";
const CANCEL_NOTE = "解約は iPhone の「設定」からいつでもできます。";

function trialOf(offering) {
  return offering?.trial?.eligible && offering.trial.periodLabel ? offering.trial : null;
}

// offering: undefined（読み込み中）／null（取れなかった）／{ priceString, productId, trial }
export function paywallView(offering) {
  if (offering === undefined) return { status: "loading", priceLabel: null, priceSub: null, ctaLabel: null, fine: null };
  if (!offering?.priceString) return { status: "error", priceLabel: null, priceSub: null, ctaLabel: null, fine: null };
  const price = offering.priceString;
  const trial = trialOf(offering);
  if (trial) {
    return {
      status: "ready",
      priceLabel: `月額 ${price}`,
      priceSub: `最初の${trial.periodLabel}は無料・その後は毎月自動で更新`,
      ctaLabel: `${trial.periodLabel} 無料で試す`,
      fine: `無料期間が終わる24時間前までに解約しないと、月額${price}で自動更新されます。${CANCEL_NOTE}${FREE_NOTE}`,
    };
  }
  return {
    status: "ready",
    priceLabel: `月額 ${price}`,
    priceSub: "毎月自動で更新",
    ctaLabel: `月額${price}で始める`,
    fine: `次の更新日の24時間前までに解約しないと、自動で更新されます。${CANCEL_NOTE}${FREE_NOTE}`,
  };
}

// 結果画面の入口カード「Kiriに続けて聞く」。
export function entryCardView({ entitled, offering, hasLog }) {
  if (entitled) return { primaryLabel: "Kiriに聞く", note: null, showReadLog: false };
  const trial = trialOf(offering);
  const price = offering?.priceString;
  return {
    primaryLabel: trial ? `最初の${trial.periodLabel}は無料で試す` : "Kiriと話してみる",
    note: price ? `${trial ? "その後 " : ""}月額${price}・いつでも解約できます` : null,
    showReadLog: Boolean(hasLog),
  };
}

const DAILY_LIMIT_MESSAGE = "……今日はここまでにしておこう。また明日、続きを聞かせて。";
const CHAT_ERROR_MESSAGES = Object.freeze({
  not_entitled: "……この対話は、購読が確認できたときに開くの。設定から『購入を復元』を試してみて。",
  user_daily_limit: DAILY_LIMIT_MESSAGE,
  daily_limit: DAILY_LIMIT_MESSAGE,
  chat_unavailable: "……いまは声が届きにくいみたい。少ししてから、もう一度聞かせて。",
  rate_limited: "……少し言葉が続きすぎたみたい。ひと呼吸おいてから、また聞かせて。",
});
const CHAT_ERROR_FALLBACK = "……少し声が届かなかったみたい。もう一度聞かせて。";

// /api/chat のエラーコード → Kiri の口調の案内（Ruling 5。chat_disabled は廃止）。
export function chatErrorMessage(code) {
  return Object.hasOwn(CHAT_ERROR_MESSAGES, code ?? "") ? CHAT_ERROR_MESSAGES[code] : CHAT_ERROR_FALLBACK;
}

// purchaseChat() の結果 → 購入画面に出す案内（成功・キャンセルは何も出さない）。
export function purchaseNotice(result) {
  if (result?.entitled || result?.cancelled) return null;
  if (result?.error === "pending") return "購入の承認を待っています。承認されると、Kiriと話せるようになります。";
  return "購入を完了できませんでした。通信の状態を確かめて、もう一度お試しください。";
}

// restorePurchases() の結果 → 案内。
export function restoreNotice(result) {
  if (result?.entitled) return "購入を復元しました。";
  if (result?.error) return "いまは復元できませんでした。通信の状態を確かめて、もう一度お試しください。";
  return "復元できる購入が見つかりませんでした。";
}

// 次の更新・終了の日付（日本時間の「11月17日」）。
export function formatRenewalDate(iso) {
  const time = Date.parse(iso ?? "");
  if (!Number.isFinite(time)) return null;
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).formatToParts(new Date(time));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("month")}月${get("day")}日`;
}

// 設定の「Kiriと話す」の欄。
export function talkSettingsView({ entitled, willRenew, expiresAt } = {}) {
  if (!entitled) return { subscribed: false, status: "使っていません", renewalLabel: null, renewalDate: null };
  return {
    subscribed: true,
    status: "利用中",
    renewalLabel: willRenew ? "次の更新" : "終了予定",
    renewalDate: formatRenewalDate(expiresAt),
  };
}
