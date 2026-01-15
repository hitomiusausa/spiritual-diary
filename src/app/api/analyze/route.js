
import { NextResponse } from "next/server";
import { Solar } from "lunar-javascript";

// 干支（甲子…癸亥）を抽出するための正規表現
const GZ = "[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]";

function parseSajuFromLunarFullString(full) {
  // 例（READMEの出力例の形式）:
  // "... 丙寅(虎)年 癸巳(蛇)月 癸酉(鸡)日 子(鼠)时 ..." :contentReference[oaicite:1]{index=1}
  const year = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)年`))?.[1] || "";
  const month = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)月`))?.[1] || "";
  const day = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)日`))?.[1] || "";
  const hour = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)时`))?.[1] || "";

  const zodiac = full.match(new RegExp(`${GZ}\\(([^\\)]*)\\)年`))?.[1] || ""; // 虎など
  return { year, month, day, hour, zodiac, raw: full };
}

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

    // ---- 四柱推命（素材）を生成 ----
    const birthDate = String(userProfile.birthDate); // "YYYY-MM-DD"
    const birthTime = (userProfile.birthTime || "").trim(); // "HH:MM" 任意
    const gender = (userProfile.gender || "").trim(); // 任意

    // birthTime未入力なら「12:00」で概算（注記つき）
    const timeForCalc = /^\d{2}:\d{2}$/.test(birthTime) ? birthTime : "12:00";
    const hasBirthTime = /^\d{2}:\d{2}$/.test(birthTime);

    // JSTとしてDate生成（Vercel対策）
    const dt = new Date(`${birthDate}T${timeForCalc}:00+09:00`);

    // SolarをDateから作る（fromDateが無い環境でも落ちないようにフォールバック）
    let solar;
    if (typeof Solar.fromDate === "function") {
      solar = Solar.fromDate(dt);
    } else {
      const [y, m, d] = birthDate.split("-").map((v) => Number(v));
      solar = Solar.fromYmd(y, m, d);
    }

    const lunar = solar.getLunar();
    const lunarFull = lunar.toFullString(); // 干支などを含む :contentReference[oaicite:2]{index=2}
    const saju = parseSajuFromLunarFullString(lunarFull);

    const sajuNote = hasBirthTime
      ? "出生時刻あり（時柱も反映）"
      : "出生時刻未入力のため 12:00 で概算（時柱は参考値）";

    // ---- プロンプト ----
    const hourNowJST = jstHour();

    const prompt = `
あなたは「占い師」ではなく「スピリチュアル×心理のコーチ」です。
当てることよりも、ユーザーが“行動に移せる内省”を提供してください。

【四柱推命（生年月日から算出）】
年柱: ${saju.year || "不明"}
月柱: ${saju.month || "不明"}
日柱: ${saju.day || "不明"}
時柱: ${saju.hour || "不明"}   ※${sajuNote}
生肖: ${saju.zodiac || "不明"}
性別（任意）: ${gender || "未入力"}

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
1. 時間帯（朝・昼・夜）に応じた“ひとこと導入”
2. バイオリズム×四柱推命×アウトプットから見える「今日の心理傾向」
   - 強み（活かし方）
   - 反応パターン（注意点）
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 実行可能なアクションを3つ（具体的）

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "deepMessage": "300文字程度の深いメッセージ",
  "innerMessage": "150文字程度の直感についての洞察",
  "actionAdvice": "具体的なアクション3つ（文章でも箇条書きでもOK）"
}
    `.trim();

    // ---- Claude API ----
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
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to parse JSON", raw: aiText },
        { status: 500 }
      );
    }

    // 画面表示用に四柱推命データも返す（B）
    return NextResponse.json({
      success: true,
      data: {
        ...aiResponse,
        saju: {
          year: saju.year,
          month: saju.month,
          day: saju.day,
          hour: saju.hour,
          zodiac: saju.zodiac,
          note: sajuNote,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}

