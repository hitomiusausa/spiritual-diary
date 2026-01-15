import { NextResponse } from "next/server";
import { Solar } from "lunar-javascript";

const GZ = "[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]";

function parseSajuFromLunarFullString(full) {
  const year = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)年`))?.[1] || "";
  const month = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)月`))?.[1] || "";
  const day = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)日`))?.[1] || "";
  const hour = full.match(new RegExp(`(${GZ})\\([^\\)]*\\)时`))?.[1] || "";
  const zodiac = full.match(new RegExp(`${GZ}\\(([^\\)]*)\\)年`))?.[1] || "";
  
  return { year, month, day, hour, zodiac, raw: full };
}

// 大運を計算（簡易版）
function calculateTaiun(birthYear, birthMonth, currentAge) {
  // 10年ごとの大運
  const taiunStart = Math.floor(currentAge / 10) * 10;
  const taiunIndex = Math.floor(currentAge / 10);
  
  // 大運の干支を計算（簡略化）
  const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  const stemIndex = (taiunIndex + birthMonth) % 10;
  const branchIndex = (taiunIndex + birthMonth) % 12;
  
  const pillar = stems[stemIndex] + branches[branchIndex];
  
  // 大運の意味（簡易版）
  const descriptions = [
    '基盤を築く時期。じっくりと実力を蓄える',
    '変化と挑戦の時期。新しい可能性を探る',
    '成長と発展の時期。積極的に行動する',
    '安定と調和の時期。内面を充実させる',
    '変革の時期。古いものを手放し新しいものへ',
    '充実と達成の時期。努力が実を結ぶ',
    '調整の時期。バランスを整える',
    '内省と準備の時期。次の飛躍に備える'
  ];
  
  return {
    age: taiunStart,
    pillar: pillar,
    description: descriptions[taiunIndex % descriptions.length]
  };
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

    const birthDate = String(userProfile.birthDate);
    const birthTime = (userProfile.birthTime || "").trim();
    const gender = (userProfile.gender || "").trim();
    const nickname = (userProfile.nickname || "").trim();

    const timeForCalc = /^\d{2}:\d{2}$/.test(birthTime) ? birthTime : "12:00";
    const hasBirthTime = /^\d{2}:\d{2}$/.test(birthTime);

    // ---- 生まれた時の四柱推命 ----
    const birthDt = new Date(`${birthDate}T${timeForCalc}:00+09:00`);
    let birthSolar;
    if (typeof Solar.fromDate === "function") {
      birthSolar = Solar.fromDate(birthDt);
    } else {
      const [y, m, d] = birthDate.split("-").map((v) => Number(v));
      birthSolar = Solar.fromYmd(y, m, d);
    }
    const birthLunar = birthSolar.getLunar();
    const birthSaju = parseSajuFromLunarFullString(birthLunar.toFullString());

    // ---- 今日の四柱推命（日運・月運・年運） ----
    const today = new Date();
    const todayJST = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const currentHour = todayJST.getHours();
    
    let todaySolar;
    if (typeof Solar.fromDate === "function") {
      todaySolar = Solar.fromDate(todayJST);
    } else {
      todaySolar = Solar.fromYmd(todayJST.getFullYear(), todayJST.getMonth() + 1, todayJST.getDate());
    }
    const todayLunar = todaySolar.getLunar();
    const todaySaju = parseSajuFromLunarFullString(todayLunar.toFullString());

    // 時運（出生時刻がある場合のみ）
    let todayHourPillar = "";
    if (hasBirthTime) {
      // 現在時刻の時柱を取得
      const hourSolar = Solar.fromYmdHms(
        todayJST.getFullYear(),
        todayJST.getMonth() + 1,
        todayJST.getDate(),
        currentHour,
        0,
        0
      );
      const hourLunar = hourSolar.getLunar();
      const hourSaju = parseSajuFromLunarFullString(hourLunar.toFullString());
      todayHourPillar = hourSaju.hour || "";
    }

    // ---- 大運の計算 ----
    const birthYear = birthDt.getFullYear();
    const birthMonth = birthDt.getMonth() + 1;
    const currentAge = todayJST.getFullYear() - birthYear;
    const taiun = calculateTaiun(birthYear, birthMonth, currentAge);

    const sajuNote = hasBirthTime
      ? "出生時刻あり（時柱・時運も反映）"
      : "出生時刻未入力のため 12:00 で概算（時柱は参考値、時運は非表示）";

    // ---- プロンプト ----
    const hourNowJST = jstHour();
    const namePrefix = nickname ? `${nickname}さん、` : "あなたへ、";

    const prompt = `
あなたは「占い師」ではなく「スピリチュアル×心理のコーチ」です。
スピリチュアルな要素とユーザーの書き込んだメッセージを判断材料にしてユーザーの心理状態を推察しつつ、ユーザーが"行動に移せる内省"を提供してください。

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
日運: ${todaySaju.day} ← 今日の運勢（重要）
${hasBirthTime ? `時運: ${todayHourPillar} ← 現在時刻(${hourNowJST}時)の運勢` : ''}

【大運（10年周期の中長期運）】
現在の大運: ${taiun.pillar} (${currentAge}歳〜、${taiun.description})

※四柱推命の解釈ポイント:
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
2. 四柱推命（本命・日運・月運・年運・大運）× バイオリズム × 気分・出来事から「今日の心理傾向」を分析
   - 本命（日柱）と日運の相性
   - 月運・年運の影響
   - 大運の長期的な流れとの関連
   - 強み（活かし方）
   - 注意点（反応パターン）
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 実行可能なアクション3つ（具体的）

【トーン】
${nickname ? `- ${nickname}さんと呼びかけ、親しみやすく温かく` : '- 敬意を持ちつつ親しみやすく'}
- 押し付けがましくなく、寄り添うように
- 専門用語は避け、わかりやすく

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "deepMessage": "300文字程度の深いメッセージ（${namePrefix}から始める。四柱推命の日運・月運・年運・大運の影響を織り込む）",
  "innerMessage": "150文字程度の直感についての洞察",
  "actionAdvice": "具体的なアクション3つ（文章でも箇条書きでもOK。ありがちでありきたりな提案ではなく、今日の運勢を踏まえた実践的内容）"
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
        max_tokens: 1200,
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

    // 画面表示用に全ての四柱推命データを返す
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
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
