import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { timeOfDay } = body || {};

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      // API Keyがない場合はデフォルト値を返す
      return NextResponse.json({
        success: true,
        placeholders: {
          mood: '例: 穏やかで少し眠い',
          event: '例: 朝のコーヒーが美味しくて気分が上がった',
          intuition: '例: 今日は大切な人との繋がりを感じる日'
        }
      });
    }

    const timeContext = timeOfDay === '朝' 
      ? '朝の始まり' 
      : timeOfDay === '昼' 
        ? '日中の活動時間' 
        : '夜のリラックスタイム';

    const prompt = `
あなたはスピリチュアル日記アプリのプレースホルダーテキスト生成AIです。
ユーザーが日記を書く際の「例文」として、自然で親しみやすい文章を生成してください。

【時間帯】
${timeContext}（${timeOfDay}）

【指示】
以下の3つのフィールドの例文を生成してください。毎回違う内容にすること。
1. mood: 気分を表す短い一言（10-15文字程度、具体的な感情表現）
2. event: 今日あった出来事の例文（30-45文字程度、リアルで共感できる日常。2文、3文程度で）
3. intuition: 直感的な一言の例文（15-25文字程度、スピリチュアルで前向き）

【注意点】
- 自然で親しみやすい表現
- ポジティブすぎず、リアルな日常感
- 時間帯に合った内容
- 押し付けがましくない、さりげない例文
- 平凡すぎず、年齢・性別にあった内容

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "mood": "例文",
  "event": "例文",
  "intuition": "例文"
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
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      // API呼び出し失敗時はデフォルト値を返す
      return NextResponse.json({
        success: true,
        placeholders: {
          mood: '例: 穏やかで少し眠い',
          event: '例: 朝のコーヒーが美味しくて気分が上がった',
          intuition: '例: 今日は大切な人との繋がりを感じる日'
        }
      });
    }

    const data = await response.json();
    let aiText = data?.content?.[0]?.text ?? "";
    aiText = aiText.replace(/```json\n?|```/g, "").trim();

    let placeholders;
    try {
      placeholders = JSON.parse(aiText);
    } catch {
      // パース失敗時はデフォルト値
      placeholders = {
        mood: '例: 穏やかで少し眠い',
        event: '例: 朝のコーヒーが美味しくて気分が上がった',
        intuition: '例: 今日は大切な人との繋がりを感じる日'
      };
    }

    // "例: " プレフィックスを追加（AIが付けていない場合）
    Object.keys(placeholders).forEach(key => {
      if (!placeholders[key].startsWith('例:')) {
        placeholders[key] = `例: ${placeholders[key]}`;
      }
    });

    return NextResponse.json({
      success: true,
      placeholders
    });

  } catch (error) {
    // エラー時もデフォルト値を返す（ユーザー体験を損なわない）
    return NextResponse.json({
      success: true,
      placeholders: {
        mood: '例: 穏やかで少し眠い',
        event: '例: 朝のコーヒーが美味しくて気分が上がった',
        intuition: '例: 今日は大切な人との繋がりを感じる日'
      }
    });
  }
}
