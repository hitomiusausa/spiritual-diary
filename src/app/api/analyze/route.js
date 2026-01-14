import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { userProfile, biorhythm, entry } = body || {};

    if (!biorhythm || !entry) {
      return NextResponse.json(
        { success: false, error: "biorhythm and entry are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "CLAUDE_API_KEY is not set" },
        { status: 500 }
      );
    }

    // JST（Vercelでも日本時間に揃える）
    const hourJST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    ).getHours();

    const prompt = `
あなたはスピリチュアルカウンセラーです。
以下の情報から、ユーザーに寄り添った温かいメッセージを生成してください。

【バイオリズム】
身体: ${biorhythm.p}%
感情: ${biorhythm.e}%
知性: ${biorhythm.i}%

【現在時刻】
${hourJST}時

【ユーザーの記録】
気分: ${entry.emoji} ${entry.mood}
${entry.type === "past" ? "今日あったこと" : "今日の予定"}: ${entry.event}
直感: ${entry.intuition || "なし"}

【指示】
1. 時間帯（朝・昼・夜）に応じたメッセージ
2. バイオリズムを踏まえた洞察
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 具体的で実行可能なアドバイス

出力は必ず「JSONのみ」。前後に説明文、装飾、\`\`\` は絶対に付けない。
{
  "deepMessage": "300文字程度の深いメッセージ",
  "innerMessage": "150文字程度の直感についての洞察",
  "actionAdvice": "具体的なアドバイス"
}
    `.trim();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { success: false, error: `API error: ${response.status}`, detail },
        { status: 502 }
      );
    }

    const data = await response.json();

    let aiText = data?.content?.[0]?.text ?? "";
    aiText = aiText.replace(/```json\n?|```/g, "").trim();

    let aiResponse;
    try {
      aiResponse = JSON.parse(aiText);
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Failed to parse JSON", raw: aiText },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: aiResponse });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
