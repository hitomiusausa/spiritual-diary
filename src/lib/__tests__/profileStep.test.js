import { describe, expect, it } from "vitest";
import { formatBirthDateJa, initialStepFor } from "../history";

describe("initialStepFor", () => {
  it("保存済みプロフィールに生年月日があれば日記入力から始める", () => {
    expect(initialStepFor({ birthDate: "1990-04-01", nickname: "" })).toBe("input");
  });

  it("プロフィールがない・生年月日が未入力や途中なら基本情報から始める", () => {
    expect(initialStepFor(null)).toBe("start");
    expect(initialStepFor({})).toBe("start");
    expect(initialStepFor({ birthDate: "" })).toBe("start");
    expect(initialStepFor({ birthDate: "1990--" })).toBe("start");
  });
});

describe("formatBirthDateJa", () => {
  it("YYYY-MM-DDを「YYYY年M月D日」にする（先頭の0は付けない）", () => {
    expect(formatBirthDateJa("1990-04-01")).toBe("1990年4月1日");
    expect(formatBirthDateJa("2001-12-31")).toBe("2001年12月31日");
  });

  it("形式が違えば空文字", () => {
    expect(formatBirthDateJa("")).toBe("");
    expect(formatBirthDateJa("1990--")).toBe("");
  });
});
