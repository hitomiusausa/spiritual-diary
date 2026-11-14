import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 「振り返り」（旧「最近の記録」。D-44）は結果画面だけでなく入力画面からも開ける（D-40）。
// 読み解き前・オフラインでも履歴を読み返せることを、画面ごとの描画で固定する。
const diary = readFileSync(join(process.cwd(), "src/components/SpiritualDiary.jsx"), "utf8");

function stepBlock(step) {
  const start = diary.indexOf(`if (step === '${step}') {`);
  expect(start).toBeGreaterThan(-1);
  const next = diary.indexOf("if (step === '", start + 10);
  return diary.slice(start, next === -1 ? undefined : next);
}

describe("振り返りの入口（D-40・D-44）", () => {
  for (const step of ["input", "result"]) {
    it(`${step} 画面で一覧・削除確認・詳細を描画し、開くボタンを持つ`, () => {
      const block = stepBlock(step);
      expect(block).toContain("renderHistoryListModal()");
      expect(block).toContain("renderConfirmDeleteModal()");
      expect(block).toContain("renderRecordDetail(");
      expect(block).toContain("openLookback()");
    });
  }

  it("入力画面の入口は読み上げで「振り返り」と名乗り、見える文字も同じ", () => {
    expect(stepBlock("input")).toContain('aria-label="振り返り"');
    expect(stepBlock("input")).toContain('<span aria-hidden="true">振り返り</span>');
  });
});
