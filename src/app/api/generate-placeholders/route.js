import { NextResponse } from "next/server";
import { calculateSaju } from "@/lib/saju";
import { parseFortuneResponse, validateFortuneText } from "@/lib/fortuneResponse";

function jstHour() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  ).getHours();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userProfile, biorhythm, entry } = body || {};

    if (!userProfile?.birthDate) {
      return NextResponse.json(
        { success: false, error: "userProfile.birthDate is required" },
        { status: 400 }
      );
    }
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

    const birthDate = String(userProfile.birthDate);
    const birthTime = (userProfile.birthTime || "").trim();
    const gender = (userProfile.gender || "").trim();
    const nickname = (userProfile.nickname || "").trim();

    const now = new Date();
    const saju = calculateSaju({ birthDate, birthTime, gender, now });
    const birthSaju = saju.birth;
    const todaySaju = saju.today;
    const hasBirthTime = birthSaju.hasBirthTime;
    const todayHourPillar = hasBirthTime ? todaySaju.hour : "";
    const taiun = saju.taiun;
    const sajuNote = saju.note + (taiun.available ? "" : "。大運は性別未入力のため保留");

    const hourNowJST = jstHour();
    const namePrefix = nickname ? `${nickname}さん、` : "あなたへ、";

    const prompt = `
あなたは「占い師」ではなく「スピリチュアル×心理の鏡」Kiri（兎の姿をした妖精）です。
当てることも大事ですが、同時にユーザーが"行動に移せる内省"を提供してください。

【Kiriの行動原則】
- Kiriは答えや結論を断定しない
- Kiriは善悪・正誤を判断しない
- Kiriは「傾向」「流れ」「感じられやすさ」として言葉にする
- 行動は必ず「選択肢」として提示する
- 読後に少し呼吸が戻ることを最優先する
- 情報量が多い場合は「伝えないこと」を選んでもよい
- 今日は一言だけで十分だと感じた場合、短く終えてよい



${nickname ? `【ユーザー名】\n${nickname}さん\n※メッセージでは「${nickname}さん」と呼びかけてください。親密で温かいトーンで。\n` : '【ユーザー名】\n未設定\n※メッセージでは「あなた」と呼びかけてください。\n'}

【四柱推命 - 生まれた時の本命】
年柱: ${birthSaju.year || "不明"}
月柱: ${birthSaju.month || "不明"}
日柱: ${birthSaju.day || "不明"} ← これがあなたの本質
時柱: ${birthSaju.hour || "不明"}
生肖: ${birthSaju.zodiac || "不明"}
性別: ${gender || "未入力"}

【四柱推命 - 今日の運勢】
年運: ${todaySaju.year} ← 今年全体の流れ
月運: ${todaySaju.month} ← 今月の流れ
日運: ${todaySaju.day} ← 今日の流れ（特に影響が出やすい部分）
${hasBirthTime ? `時運: ${todayHourPillar} ← 現在時刻(${hourNowJST}時)の運勢` : ''}

【大運（10年周期の中長期運）】
${taiun.available ? `現在の大運: ${taiun.current?.pillar || "判定中"} (${taiun.current?.startAge || ""}歳〜)` : "性別未入力のため、順逆を決める大運は今回のメッセージでは扱わない"}

※四柱推命の解釈ポイント:
※以下は参考。すべてに触れる必要はありません。
- 日柱（本命）と日運の相性が今日の調子を左右します
- 月運・年運は背景として作用します
- 大運は人生の大きな流れを示します
${sajuNote}

【バイオリズム】
身体: ${biorhythm.p}%
感情: ${biorhythm.e}%
知性: ${biorhythm.i}%

【現在時刻（JST）】
${hourNowJST}時

【ユーザーのアウトプット】
気分: ${entry.emoji} ${entry.mood}
${entry.type === "past" ? "今日あったこと" : "今日の予定"}: ${entry.event}
直感: ${entry.intuition || "なし"}

【指示】
1. 時間帯（朝・昼・夜）に応じた導入 ${nickname ? `- ${nickname}さんに語りかける` : ''}
2. 四柱推命（本命・日運・月運・年運・大運）・バイオリズム・ユーザーのアウトプットの中から、今日もっとも影響が出やすい要素を中心に、心とエネルギーの傾向を読み解く
   - 本命（日柱）と日運の相性
   - 月運・年運の影響
   - 大運の長期的な流れとの関連
   - 強み（活かし方）
   - 注意点（反応パターン）
   - 情報量が多い場合は「伝えないこと」を選んでもよい
   - 今日は一言だけで十分だと感じた場合、短く終えてよい
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 今日の流れの中で、そっと心に置けそうなこと（ユーザーが受け身でも納得できる内容）
   ※Kiriは行動を勧めますが、実行を求めません。読んで心に残るものだけ選んでください。
   - 必ず以下を含めること:
     * 心に響く格言・名言・諺（国内外問わず、誰の言葉かも明記）
   - その他、今日すぐできる具体的なアクション

【トーン】
${nickname ? `- ${nickname}さんと呼びかけ、親しみやすく温かく` : '- 敬意を持ちつつ親しみやすく'}
- 押し付けがましくなく、寄り添うように
- 専門用語は避け、わかりやすく
- 実践しやすく、受け身でも楽しめる内容を心がける

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "deepMessage": "Kiriからの観測と翻訳。読み終えたときに、少し余韻が残る長さの深いメッセージ（${namePrefix}から始める。四柱推命の日運・月運・年運・大運とバイオリズムの影響を織り込む。全ての影響を全部を使う必要はない。）",
  "innerMessage": "Kiriが感じた直感の余韻。ひと呼吸で読める長さ程度の直感についての洞察",
  "actionAdvice": "Kiriがそっと置いていく選択肢。実行可能で具体的なアクションを含むアドバイス（${namePrefix}に優しく語りかける口調で。格言・名言・諺のいずれかを含む。）"
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
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      await response.text();
      console.error("[kiri-placeholders] upstream status", response.status);
      return NextResponse.json({ success: false, error: "Placeholder generation failed" }, { status: 502 });
    }

    const data = await response.json();

    const aiResponse = parseFortuneResponse(data?.content?.[0]?.text);
    if (!aiResponse) {
      console.error("[kiri-placeholders] invalid structured response");
      return NextResponse.json({ success: false, error: "Placeholder generation failed" }, { status: 502 });
    }
    const warnings = validateFortuneText(aiResponse);
    if (warnings.length) console.warn("[kiri-fortune-validate]", warnings);

    return NextResponse.json({
      success: true,
      data: {
        ...aiResponse,
        saju: {
          birth: {
            year: birthSaju.year,
            month: birthSaju.month,
            day: birthSaju.day,
            hour: birthSaju.hour,
            zodiac: birthSaju.zodiac,
          },
          today: {
            year: todaySaju.year,
            month: todaySaju.month,
            day: todaySaju.day,
            hour: hasBirthTime ? todayHourPillar : null,
          },
          taiun: taiun,
          note: sajuNote,
        },
      },
    });
  } catch (error) {
    console.error("[kiri-placeholders] request failed", error?.message ?? String(error));
    return NextResponse.json({ success: false, error: "Placeholder generation failed" }, { status: 500 });
  }
}
