import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 法務・サポートページの文言規律（DECISIONS.md D-25 の禁止語、D-28/D-30 の有料機能の約束、設計書 Ruling 11）。
// JSX の改行・インデントに左右されないよう、空白を全部取り除いてから見る。
const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const compact = (source) => stripComments(source).replace(/\s+/g, "");

const PAGES = { terms: "src/app/terms/page.js", support: "src/app/support/page.js", privacy: "src/app/privacy/page.js" };
const TEXT = Object.fromEntries(Object.entries(PAGES).map(([name, path]) => [name, compact(read(path))]));

describe("法務ページ共通", () => {
  it.each(Object.keys(PAGES))("%s に禁止語（暗号化・パスワード）と「開発プレビュー」を使わない", (name) => {
    expect(TEXT[name]).not.toMatch(/暗号化|パスワード/);
    expect(TEXT[name]).not.toContain("開発プレビュー");
  });

  it.each(["terms", "support"])("%s に価格の数字を書かない（価格はアプリ内の購入画面に表示）", (name) => {
    expect(TEXT[name]).not.toMatch(/480|[¥￥]|[0-9,]+円/);
    expect(TEXT[name]).toContain("アプリ内の購入画面に表示");
  });
});

describe("/terms の有料機能", () => {
  const t = TEXT.terms;
  it.each([
    ["商品名", "Kiriと話す"],
    ["月額の自動更新サブスクリプション", "月額の自動更新サブスクリプション"],
    ["1週間の無料トライアル（初回のみ・Appleの規定）", "初めて購読する方"],
    ["1週間", "1週間の無料トライアル"],
    ["24時間前までに解約", "24時間前までに解約"],
    ["解約の方法（iPhoneの設定）", "iPhoneの「設定」"],
    ["返金はAppleの規定", "返金はAppleの規定"],
    ["1日60通の上限", "1日60通"],
    ["解約後も端末内の会話は読める", "解約したあとも"],
    ["Webでは対話なし・iOSで購読", "ウェブ版では"],
  ])("%s を書いている", (_label, phrase) => {
    expect(t).toContain(phrase);
  });

  it("無料の範囲とAIへの送信に触れている", () => {
    expect(t).toContain("読み解きと日記は、これまでどおり無料です");
    expect(t).toContain("Anthropic社のAI（Claude）に送られます");
  });
});

describe("/support の購読まわりのFAQ", () => {
  const t = TEXT.support;
  it.each([
    "購入を復元",
    "iPhoneの「設定」",
    "1日60通",
    "ウェブ版では",
    "解約したあとも",
    "Appleの規定",
  ])("%s に触れている", (phrase) => {
    expect(t).toContain(phrase);
  });
});

describe("/privacy の第三者提供", () => {
  const t = TEXT.privacy;
  it("RevenueCat, Inc. に匿名IDと取引情報だけを送ること、日記・会話は送らないことを書く", () => {
    expect(t).toContain("RevenueCat,Inc.");
    expect(t).toContain("匿名のID（AppUserID）");
    expect(t).toContain("AppStoreの取引情報");
    expect(t).toMatch(/日記や会話[^。]*送りません/);
  });

  it("Upstash に置く情報に、権利の有無（最長10分）と購読者ごとの日次回数（最長2日）を足している", () => {
    expect(t).toContain("最長10分で自動消去");
    expect(t).toContain("購読者ごとの1日の利用回数");
    expect(t).toContain("最長2日で自動消去");
  });
});
