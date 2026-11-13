import { describe, expect, it } from "vitest";
import { parseFortuneResponse, validateFortuneText } from "@/lib/fortuneResponse";

describe("fortune response contract", () => {
  it("parses the three required fields with or without a JSON fence", () => {
    const result = parseFortuneResponse(
      "```json\n{" +
        '"deepMessage":"霧が薄いね。今日は返事を急がなくていい。",' +
        '"innerMessage":"言葉より先に、肩の力が見えている。",' +
        '"actionAdvice":"ひとつだけ返すか、今日は置いておくか。どちらを選んでもいい。"' +
        "}\n```",
    );

    expect(result).toEqual({
      deepMessage: "霧が薄いね。今日は返事を急がなくていい。",
      innerMessage: "言葉より先に、肩の力が見えている。",
      actionAdvice: "ひとつだけ返すか、今日は置いておくか。どちらを選んでもいい。",
    });
  });

  it("fails closed for malformed or incomplete model output", () => {
    expect(parseFortuneResponse("not json")).toBeNull();
    expect(parseFortuneResponse('{"deepMessage":"ok"}')).toBeNull();
    expect(parseFortuneResponse("[]")).toBeNull();
  });

  // L-03: JSON の前後の一言や、文字列の中の生の改行で 502 にしない。
  const FORTUNE = { deepMessage: "霧が薄いね。", innerMessage: "肩の力が見えている。", actionAdvice: "ひとつだけ返してみる。" };

  it("tolerates short prose before or after the JSON object", () => {
    const json = JSON.stringify(FORTUNE);
    expect(parseFortuneResponse(`はい、こちらです。\n${json}`)).toEqual(FORTUNE);
    expect(parseFortuneResponse(`${json}\n以上です`)).toEqual(FORTUNE);
    expect(parseFortuneResponse(`前置き\n\`\`\`json\n${json}\n\`\`\`\n後書き`)).toEqual(FORTUNE);
  });

  it("accepts raw newlines inside string values as paragraph breaks", () => {
    const raw = '{"deepMessage":"一段落目。\n\n二段落目。","innerMessage":"内側の\r\n動き。","actionAdvice":"ひとつだけ。"}';
    expect(parseFortuneResponse(raw)).toEqual({
      deepMessage: "一段落目。\n\n二段落目。",
      innerMessage: "内側の\n動き。",
      actionAdvice: "ひとつだけ。",
    });
  });

  it("keeps braces inside strings and still fails closed without a complete object", () => {
    const withBraces = { ...FORTUNE, deepMessage: "霧の{谷}の話。" };
    expect(parseFortuneResponse(`前置き ${JSON.stringify(withBraces)} 後書き`)).toEqual(withBraces);
    expect(parseFortuneResponse("前置き { 壊れた")).toBeNull();
    expect(parseFortuneResponse('{"deepMessage":"a","innerMessage":"b"}')).toBeNull();
  });

  it("does not cut a field in the middle of a surrogate pair", () => {
    const long = "あ".repeat(2399) + "😀";
    const result = parseFortuneResponse(JSON.stringify({ ...FORTUNE, deepMessage: long }));
    expect(result.deepMessage).not.toMatch(/[\ud800-\udbff]$/);
  });

  it("warns on legacy polite or motivational phrasing", () => {
    const warnings = validateFortuneText({
      deepMessage: "頑張ってください。",
      innerMessage: "……",
      actionAdvice: "無理せず休みましょう。",
    });

    expect(warnings).toEqual(expect.arrayContaining(["敬語定型", "励まし・断定定型"]));
  });
});
