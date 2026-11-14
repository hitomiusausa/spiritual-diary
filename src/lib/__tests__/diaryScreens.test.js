import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keepsDraftAfterDeleteAll } from "@/lib/deleteAll";

// 2026-11-14 UX/審査レビューの直し（05-ux P1/P2・02 R2-01・03 A-1/A-4/A-5/A-8）を、画面のソースで固定する。
const read = (file) => readFileSync(join(process.cwd(), file), "utf8");
const diary = read("src/components/SpiritualDiary.jsx");
const consent = read("src/components/ConsentModal.jsx");
const stripComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

function block(startMarker, endMarker) {
  const start = diary.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = diary.indexOf(endMarker, start + startMarker.length);
  return diary.slice(start, end === -1 ? undefined : end);
}

describe("R2-01 入力画面の「すべて削除」で書きかけを消さない", () => {
  it("入力画面では書きかけを残し、結果画面では入力も空にする", () => {
    expect(keepsDraftAfterDeleteAll("input")).toBe(true);
    expect(keepsDraftAfterDeleteAll("result")).toBe(false);
  });

  it("すべて削除の処理は、画面に応じて clearAll を呼ぶか決める", () => {
    const performDelete = block("const performDelete = async () => {", "const renderStorageNotice");
    expect(performDelete).toMatch(/if \(keepsDraftAfterDeleteAll\(step\)\) setResult\(null\);\s*else clearAll\(\);/);
  });
});

describe("審査向けの言葉（A-1・A-4・A-5・A-8）", () => {
  it.each([["SpiritualDiary.jsx", diary], ["ConsentModal.jsx", consent]])("%s の画面の文字に「占い」「運勢」「占術」を使わない", (_name, source) => {
    expect(stripComments(source)).not.toMatch(/占い|占う|占っ|運勢|占術/);
  });

  it("テーマの名前は予言に読めない言い方にする", () => {
    expect(diary).toContain('label="からだのリズム"');
    expect(diary).toContain('label="お金との向き合い方"');
    expect(diary).not.toContain("健康・活力");
  });

  it("結果画面に、AIの読みものであって未来の約束ではないことを添える", () => {
    const result = block("if (step === 'result') {", "const renderLockLayer");
    expect(result).toContain("Kiriの言葉はAIがつくる読みものです。");
    expect(result).toContain("未来を約束するものではありません。");
  });

  it("今は出していない絵文字のことを言わない", () => {
    expect(diary).not.toContain("気分の絵文字");
  });
});

describe("迷わない導線（05-ux）", () => {
  it("お知らせの帯は画面の高さを持たない（すべて削除のあとに空白が出ない）", () => {
    const notice = block("const renderStorageNotice", "const renderHistoryListModal");
    expect(notice).toContain("<aside");
    expect(notice).not.toContain("kiri-shell");
  });

  it("画面が変わったら先頭から見せる", () => {
    expect(diary).toMatch(/if \(step !== 'boot'\) window\.scrollTo\(0, 0\);/);
  });

  it("振り返りを開いた直後のフォーカスは、暦で選んである日か閉じるボタン（すべて削除ではない）", () => {
    const list = block("const renderHistoryListModal", "const renderConfirmDeleteModal");
    // 件数で selector を変えると ModalFrame の効果が作り直され、Escape 後のフォーカス復帰が外れる（独立検収 P2-3）。
    expect(list).toContain('initialFocus="[data-history-initial]"');
    expect(list).toContain("data-history-initial={!lookbackDay || undefined}");
    expect(diary).toContain("data-history-initial={selected || undefined}");
    // すべて削除は閉じる×の隣ではなく、一覧の下に44pxの高さで置く
    const header = list.slice(list.indexOf('<div className="p-4 border-b'), list.indexOf('<div className="flex-1 overflow-y-auto'));
    expect(header).not.toContain("すべて削除");
    expect(list).toMatch(/min-h-11[^"]*"\s*>\s*すべて削除/);
    expect(list).toContain("記録は新しいものから{MAX_HISTORY_ITEMS}件まで残ります。");
  });

  it("結果画面にも記録と設定を置き、削除の確認文は画面にある物だけを案内する", () => {
    const result = block("if (step === 'result') {", "const renderLockLayer");
    expect(result).toContain("renderSettingsModal()");
    expect(result).toContain('aria-label="設定"');
    expect(result).toContain('aria-label="振り返り"');
    expect(diary).not.toContain("設定アイコン");
  });

  it("結果画面の下のボタンは、することをそのまま言う", () => {
    expect(diary).toContain("書き直す");
    expect(diary).toContain("新しく書く");
    expect(diary).not.toContain("前の画面に戻る");
    expect(diary).not.toContain("今日の記録をクリアする");
  });

  it("ヘッダーの小さなボタンは当たり判定を44pxにする", () => {
    for (const step of ["input", "result"]) {
      const screen = block(`if (step === '${step}') {`, step === "input" ? "if (step === 'loading')" : "const renderLockLayer");
      expect(screen).toMatch(/aria-label="振り返り"[\s\S]{0,200}className="kiri-hit /);
      expect(screen).toMatch(/aria-label="設定"[\s\S]{0,200}className="kiri-hit /);
    }
  });

  it("エラーの帯は自動で消さず、関数として呼ぶ", () => {
    expect(diary).not.toContain("ERROR_BANNER_AUTO_DISMISS_MS");
    expect(diary).not.toContain("<ErrorBanner");
    expect(diary).toContain("{renderErrorBanner()}");
  });

  it("同意の説明は、実際のボタン名で書く", () => {
    expect(diary).toContain("'Kiriに読み解いてもらう'");
    expect(consent).toContain("「Kiriに読み解いてもらう」を押すと");
    expect(stripComments(consent)).not.toMatch(/「読み解く」/);
    expect(stripComments(diary)).not.toMatch(/「読み解く」/);
  });

  it("どの端末でも通じる言い方にする（マウスでも「タップ」と言わない見出しの案内）", () => {
    expect(diary).not.toContain('collapsedHint="タップで確認"');
    expect(diary).not.toContain("かもしてません");
  });
});
