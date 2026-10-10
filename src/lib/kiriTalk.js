// 「Kiriと話す」（月額サブスク）の画面の文言と出し分け（D-28・D-30・設計 Ruling 5/7/9）。純粋関数だけを置く。
// 価格は必ず StoreKit の文字列（getChatOffering().priceString）を使い、ここに数字を書かない（Ruling 8）。
// 文言の規律: 「暗号化」「パスワード」（D-25）・「占い」（D-27）・「無制限」「パターン分析」（D-30）を使わない（テストで検査）。
// Web の本番ではこのモジュールは使われず、バンドルから消える（D-24・F-B6）。消えるように、モジュールの直下には
// 文字列リテラルと関数だけを置く（配列・オブジェクト・変数を埋め込んだ文字列は、使われていなくても Web の
// バンドルに残る＝next 16 の本番ビルドで確認。Object.freeze も同じ）。scripts/check-web-bundle.mjs が検査する。

export const KIRI_TALK_NAME = "Kiriと話す";
export const KIRI_TALK_KIND = "月額の自動更新サブスクリプション";

// 会話ログは端末に新しいものから MAX_CHAT_MESSAGES 件まで残る（古いものから消える）。件数は規約・サポートに書く（F-B1）。
// 保存サイズの見積もり（F-B1・D-22）: 1件は保存時に1,800字で切る（送る側は入力欄で1,200字まで）。日本語は UTF-8 で約3バイト。
//   典型（Kiri の返事 300〜500字・自分 100字前後）で 1,000件 ≒ 1MB 前後、最悪（全件 1,800字）で ≒ 5.4MB。
//   iOS では Preferences（UserDefaults）の1つの値になり、書くたびに全体を書き直す。UserDefaults は約4MBを超える値で
//   警告が出る（tvOS では書けない）ので、最悪ケースは Filesystem への移設（D-09 第三段階）で解消する。
export function kiriTalkPromises() {
  return [
    { title: "Kiriと話せる（1日60通まで）", detail: "今日の読み解きと記録をふまえて返事をします" },
    { title: "会話はこの端末に残ります", detail: "解約したあとも、残っている会話は読めます" },
  ];
}

// チャット欄の「読むだけ」（未購読・解約後。D-28）の案内とボタン。
export const KIRI_TALK_READ_ONLY_NOTE = "これまでの会話は、いつでも読めます。続きを話すなら『Kiriと話す』で。";
export const KIRI_TALK_START_LABEL = "Kiriと話すを始める";

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

// /api/chat のエラーコード → Kiri の口調の案内（Ruling 5。chat_disabled は廃止）。
export function chatErrorMessage(code) {
  switch (code) {
    case "not_entitled":
      // 解約した人にもずれない言い方。「購入を復元」ではなく「Kiriと話す」へ（F-B9）。
      return "……いまは続きを話せないみたい。『Kiriと話す』を確かめてみて。";
    case "user_daily_limit":
      return "……今日はここまでにしておこう。また明日、続きを聞かせて。";
    case "daily_limit":
      // 全体の上限（サーバー全体の1日の上限）。個人の上限とは別の文（F-B10）。
      return "……今日はたくさんの声が届いて、Kiriも少し休んでいるの。また明日、続きを聞かせて。";
    case "chat_unavailable":
      return "……いまは声が届きにくいみたい。少ししてから、もう一度聞かせて。";
    case "rate_limited":
      return "……少し言葉が続きすぎたみたい。ひと呼吸おいてから、また聞かせて。";
    default:
      return "……少し声が届かなかったみたい。もう一度聞かせて。";
  }
}

// purchaseChat() の結果 → 購入画面に出す案内（成功・キャンセルは何も出さない）。
export function purchaseNotice(result) {
  if (result?.entitled || result?.cancelled) return null;
  if (result?.error === "pending") return "購入の承認を待っています。承認されると、Kiriと話せるようになります。";
  if (result?.error === "not_reflected") return "購入を受け付けました。反映まで少しかかることがあります。少しして『購入を復元』を試してください。";
  if (result?.error === "already_purchased") return "すでに購読しています。『購入を復元』を試してください。";
  return "購入を完了できませんでした。通信の状態を確かめて、もう一度お試しください。";
}

// restorePurchases() の結果 → 案内。
export function restoreNotice(result) {
  if (result?.entitled) return "購入を復元しました。";
  if (result?.error) return "いまは復元できませんでした。通信の状態を確かめて、もう一度お試しください。";
  return "有効な購読が見つかりませんでした。";
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
export function talkSettingsView({ entitled, willRenew, expiresAt, isTrial } = {}) {
  if (!entitled) return { subscribed: false, status: "使っていません", renewalLabel: null, renewalDate: null };
  return {
    subscribed: true,
    status: isTrial ? "無料期間中" : "利用中",
    renewalLabel: willRenew ? "次の更新" : "終了予定",
    renewalDate: formatRenewalDate(expiresAt),
  };
}

// 購入・復元の直後の状態（F-B8）。読み直し（getEntitlementState）が失敗すると「権利なし」に見えるので、
// 購入・復元が権利を返していればその結果（outcome.state）から作り、読み直しで上書きしない。
export function talkStateAfterPurchase(fresh, outcome) {
  if (!outcome?.entitled || fresh?.entitled) return fresh;
  return outcome.state?.entitled ? outcome.state : { entitled: true, expiresAt: null, willRenew: false, isTrial: false, managementUrl: null };
}
