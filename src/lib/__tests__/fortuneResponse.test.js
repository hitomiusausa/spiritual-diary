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

  it("warns on legacy polite or motivational phrasing", () => {
    const warnings = validateFortuneText({
      deepMessage: "頑張ってください。",
      innerMessage: "……",
      actionAdvice: "無理せず休みましょう。",
    });

    expect(warnings).toEqual(expect.arrayContaining(["敬語定型", "励まし・断定定型"]));
  });
});
