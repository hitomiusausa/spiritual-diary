import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  KIRI_TALK_NAME,
  KIRI_TALK_PROMISES,
  KIRI_TALK_AI_NOTICE,
  KIRI_TALK_READ_ONLY_NOTE,
  KIRI_TALK_START_LABEL,
  chatErrorMessage,
  entryCardView,
  formatRenewalDate,
  paywallView,
  purchaseNotice,
  restoreNotice,
  talkSettingsView,
  talkStateAfterPurchase,
} from "@/lib/kiriTalk";

const eligible = { priceString: "¥480", productId: "p", trial: { eligible: true, periodLabel: "1週間" } };
const ineligible = { priceString: "¥480", productId: "p", trial: { eligible: false, periodLabel: "1週間" } };
const noTrial = { priceString: "$2.99", productId: "p", trial: null };

// 画面に出してはいけない語（D-25・D-27・D-30・3.1.2: 未実装・上限ありの約束をしない）。
const FORBIDDEN = /暗号化|パスワード|占い|無制限|パターン分析|開発プレビュー|StoreKit|プレミアム/;

describe("商品名と約束（D-30）", () => {
  it("商品名は「Kiriと話す」", () => {
    expect(KIRI_TALK_NAME).toBe("Kiriと話す");
  });

  it("約束は2つだけ", () => {
    expect(KIRI_TALK_PROMISES).toEqual([
      { title: "Kiriと話せる（1日60通まで）", detail: "今日の読み解きと記録をふまえて返事をします" },
      { title: "会話はこの端末に残ります", detail: "解約したあとも、残っている会話は読めます" },
    ]);
  });

  it("AI 送信の告知（Ruling 7）", () => {
    expect(KIRI_TALK_AI_NOTICE).toContain("Anthropic社のAI（Claude）");
  });
});

describe("paywallView（購入画面の価格の箱・ボタン・注意書き）", () => {
  it("読み込み中", () => {
    expect(paywallView(undefined)).toMatchObject({ status: "loading", ctaLabel: null });
  });

  it("取れなかったとき", () => {
    expect(paywallView(null)).toMatchObject({ status: "error", ctaLabel: null });
  });

  it("トライアル適格: 価格を主に、2行目にトライアル、ボタンは「1週間 無料で試す」", () => {
    const view = paywallView(eligible);
    expect(view).toMatchObject({
      status: "ready",
      priceLabel: "月額 ¥480",
      priceSub: "最初の1週間は無料・その後は毎月自動で更新",
      ctaLabel: "1週間 無料で試す",
    });
    expect(view.fine).toBe(
      "無料期間が終わる24時間前までに解約しないと、月額¥480で自動更新されます。解約は iPhone の「設定」からいつでもできます。読み解きと日記はこれまでどおり無料です。",
    );
  });

  it.each([[ineligible], [noTrial]])("トライアル不適格・なし: ボタンは「月額{価格}で始める」", (offering) => {
    const view = paywallView(offering);
    expect(view.priceLabel).toBe(`月額 ${offering.priceString}`);
    expect(view.priceSub).toBe("毎月自動で更新");
    expect(view.ctaLabel).toBe(`月額${offering.priceString}で始める`);
    expect(view.fine).toBe(
      "次の更新日の24時間前までに解約しないと、自動で更新されます。解約は iPhone の「設定」からいつでもできます。読み解きと日記はこれまでどおり無料です。",
    );
  });
});

describe("entryCardView（結果画面の入口カード）", () => {
  it("購読中はそのまま聞ける", () => {
    expect(entryCardView({ entitled: true, offering: eligible, hasLog: true })).toEqual({ primaryLabel: "Kiriに聞く", note: null, showReadLog: false });
  });

  it("未購読・トライアル適格", () => {
    expect(entryCardView({ entitled: false, offering: eligible, hasLog: false })).toEqual({
      primaryLabel: "最初の1週間は無料で試す",
      note: "その後 月額¥480・いつでも解約できます",
      showReadLog: false,
    });
  });

  it("未購読・不適格", () => {
    expect(entryCardView({ entitled: false, offering: ineligible, hasLog: false })).toEqual({
      primaryLabel: "Kiriと話してみる",
      note: "月額¥480・いつでも解約できます",
      showReadLog: false,
    });
  });

  it("未購読・価格が取れていない（価格を書かない）", () => {
    expect(entryCardView({ entitled: false, offering: null, hasLog: false })).toEqual({ primaryLabel: "Kiriと話してみる", note: null, showReadLog: false });
  });

  it("未購読でも会話ログがあれば「これまでの会話を読む」（D-28）", () => {
    expect(entryCardView({ entitled: false, offering: null, hasLog: true }).showReadLog).toBe(true);
  });
});

describe("chatErrorMessage（Ruling 5）", () => {
  it.each([
    // 解約した人にもずれない言い方。「購入を復元」ではなく「Kiriと話す」へ（F-B9）。
    ["not_entitled", "……いまは続きを話せないみたい。『Kiriと話す』を確かめてみて。"],
    ["user_daily_limit", "……今日はここまでにしておこう。また明日、続きを聞かせて。"],
    // 全体の上限は個人の上限と別の文（F-B10）。
    ["daily_limit", "……今日はたくさんの声が届いて、Kiriも少し休んでいるの。また明日、続きを聞かせて。"],
    ["chat_unavailable", "……いまは声が届きにくいみたい。少ししてから、もう一度聞かせて。"],
    ["rate_limited", "……少し言葉が続きすぎたみたい。ひと呼吸おいてから、また聞かせて。"],
  ])("%s", (code, message) => {
    expect(chatErrorMessage(code)).toBe(message);
  });

  it("chat_disabled は廃止（一般の失敗文）", () => {
    expect(chatErrorMessage("chat_disabled")).toBe("……少し声が届かなかったみたい。もう一度聞かせて。");
    expect(chatErrorMessage(undefined)).toBe("……少し声が届かなかったみたい。もう一度聞かせて。");
  });
});

describe("購入・復元の結果の案内", () => {
  it("purchaseNotice", () => {
    expect(purchaseNotice({ entitled: true })).toBeNull();
    expect(purchaseNotice({ cancelled: true })).toBeNull();
    expect(purchaseNotice({ error: "pending" })).toMatch(/承認/);
    expect(purchaseNotice({ error: "failed" })).toMatch(/完了できませんでした/);
    expect(purchaseNotice({ error: "no_offering" })).toMatch(/完了できませんでした/);
  });

  it("purchaseNotice: 購入は通ったが権利がまだ反映されていない・すでに購読している（F-B3）", () => {
    expect(purchaseNotice({ entitled: false, error: "not_reflected" })).toBe(
      "購入を受け付けました。反映まで少しかかることがあります。少しして『購入を復元』を試してください。",
    );
    expect(purchaseNotice({ entitled: false, error: "already_purchased" })).toBe("すでに購読しています。『購入を復元』を試してください。");
  });

  it("restoreNotice", () => {
    expect(restoreNotice({ entitled: true })).toBe("購入を復元しました。");
    expect(restoreNotice({ entitled: false })).toBe("有効な購読が見つかりませんでした。");
    expect(restoreNotice({ entitled: false, error: "failed" })).toMatch(/復元できませんでした/);
  });
});

describe("formatRenewalDate（日本時間の月日）", () => {
  it("ISO 日時を「11月17日」に", () => {
    expect(formatRenewalDate("2026-11-16T20:00:00Z")).toBe("11月17日");
  });
  it("不正・空は null", () => {
    expect(formatRenewalDate(null)).toBeNull();
    expect(formatRenewalDate("x")).toBeNull();
  });
});

describe("talkSettingsView（設定の「Kiriと話す」）", () => {
  it("未購読", () => {
    expect(talkSettingsView({ entitled: false })).toEqual({ subscribed: false, status: "使っていません", renewalLabel: null, renewalDate: null });
  });
  it("購読中（自動更新あり）", () => {
    expect(talkSettingsView({ entitled: true, willRenew: true, expiresAt: "2026-11-16T20:00:00Z" })).toEqual({
      subscribed: true,
      status: "利用中",
      renewalLabel: "次の更新",
      renewalDate: "11月17日",
    });
  });
  it("購読中（解約済み・期間末まで）", () => {
    expect(talkSettingsView({ entitled: true, willRenew: false, expiresAt: "2026-11-16T20:00:00Z" })).toMatchObject({ renewalLabel: "終了予定" });
  });
  it("トライアル中は「無料期間中」（F-B12）", () => {
    expect(talkSettingsView({ entitled: true, willRenew: true, isTrial: true, expiresAt: "2026-11-16T20:00:00Z" })).toMatchObject({
      status: "無料期間中",
      renewalLabel: "次の更新",
    });
  });
});

describe("talkStateAfterPurchase（購入・復元の直後の状態。F-B8）", () => {
  const fromPurchase = { entitled: true, expiresAt: "2026-11-16T20:00:00Z", willRenew: true, isTrial: true, managementUrl: null };
  it("読み直しで権利が見えたら、読み直した状態", () => {
    const fresh = { ...fromPurchase, managementUrl: "https://apps.apple.com/account/subscriptions" };
    expect(talkStateAfterPurchase(fresh, { entitled: true, state: fromPurchase })).toBe(fresh);
  });
  it("読み直しが失敗した（権利なしに見える）ときは、購入の結果から作る（上書きしない）", () => {
    const failed = { entitled: false, expiresAt: null, willRenew: false, isTrial: false, managementUrl: null };
    expect(talkStateAfterPurchase(failed, { entitled: true, state: fromPurchase })).toBe(fromPurchase);
  });
  it("購入の結果に状態が無くても、権利ありとして扱う", () => {
    expect(talkStateAfterPurchase(null, { entitled: true })).toMatchObject({ entitled: true });
  });
  it("購入が権利を返していなければ、読み直した状態のまま", () => {
    const fresh = { entitled: false, expiresAt: null, willRenew: false, isTrial: false, managementUrl: null };
    expect(talkStateAfterPurchase(fresh, { entitled: false })).toBe(fresh);
  });
});

describe("読むだけの欄（F-B12）", () => {
  it("案内とボタン", () => {
    expect(KIRI_TALK_READ_ONLY_NOTE).toBe("これまでの会話は、いつでも読めます。続きを話すなら『Kiriと話す』で。");
    expect(KIRI_TALK_START_LABEL).toBe("Kiriと話すを始める");
  });
});

describe("文言の規律", () => {
  const stripComments = (source) =>
    source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("購入まわりの文言に禁止語が無い", () => {
    const views = [
      KIRI_TALK_NAME,
      KIRI_TALK_AI_NOTICE,
      KIRI_TALK_READ_ONLY_NOTE,
      KIRI_TALK_START_LABEL,
      ...[undefined, "not_entitled", "user_daily_limit", "daily_limit", "chat_unavailable"].map(chatErrorMessage),
      ...[{ error: "not_reflected" }, { error: "already_purchased" }, { error: "pending" }, {}].map(purchaseNotice),
      ...KIRI_TALK_PROMISES.flatMap((p) => [p.title, p.detail]),
      ...[undefined, null, eligible, ineligible, noTrial].flatMap((o) => Object.values(paywallView(o)).filter((v) => typeof v === "string")),
    ];
    for (const text of views) expect(text).not.toMatch(FORBIDDEN);
  });

  it.each(["src/components/PaywallSheet.jsx", "src/components/KiriChatPanel.jsx", "src/lib/kiriTalk.js"])("%s の画面の文字に禁止語が無い", (file) => {
    const source = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
    expect(source).not.toMatch(FORBIDDEN);
  });

  it("Web の本番バンドルから消えるよう、モジュールの初期化に副作用を置かない（Object.freeze を使わない。F-B6）", () => {
    const source = stripComments(readFileSync(join(process.cwd(), "src/lib/kiriTalk.js"), "utf8"));
    expect(source).not.toMatch(/Object\.freeze\(/);
  });

  it("購入画面は必須要素を持つ（3.1.2: 名前と期間・価格・自動更新・復元・規約・プライバシー）", () => {
    const source = readFileSync(join(process.cwd(), "src/components/PaywallSheet.jsx"), "utf8");
    for (const text of ["KIRI_TALK_NAME", "月額の自動更新サブスクリプション", "KIRI_TALK_PROMISES", "priceLabel", "購入を復元", 'href="/terms"', 'href="/privacy"', "KIRI_TALK_AI_NOTICE", "サブスクリプションを管理", 'aria-modal="true"']) {
      expect(source).toContain(text);
    }
  });
});
