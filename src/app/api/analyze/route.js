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

// 五行の要素を取得
function getElement(pillar) {
  if (!pillar || pillar.length < 2) return null;
  const stem = pillar[0];
  const elementMap = {
    '甲': '木', '乙': '木',
    '丙': '火', '丁': '火',
    '戊': '土', '己': '土',
    '庚': '金', '辛': '金',
    '壬': '水', '癸': '水'
  };
  return elementMap[stem] || null;
}

// 五行の相性スコア（相生・相剋）
function getElementCompatibility(element1, element2) {
  const compatibility = {
    '木': { '木': 0.7, '火': 1.0, '土': 0.4, '金': 0.3, '水': 0.8 },
    '火': { '木': 0.8, '火': 0.7, '土': 1.0, '金': 0.4, '水': 0.3 },
    '土': { '木': 0.3, '火': 0.8, '土': 0.7, '金': 1.0, '水': 0.4 },
    '金': { '木': 0.4, '火': 0.3, '土': 0.8, '金': 0.7, '水': 1.0 },
    '水': { '木': 1.0, '火': 0.4, '土': 0.3, '金': 0.8, '水': 0.7 }
  };
  return compatibility[element1]?.[element2] || 0.5;
}

// テーマ別運勢スコアを計算
function calculateThemeScores(birthSaju, todaySaju, biorhythm, userMood) {
  // 日柱の五行
  const birthElement = getElement(birthSaju.day);
  const todayElement = getElement(todaySaju.day);
  
  // 基本相性スコア
  const baseCompatibility = getElementCompatibility(birthElement, todayElement);
  
  // 気分からの影響（ポジティブ絵文字は高評価）
  const positiveEmojis = ['😊', '🥰', '😆', '😌', '❤️', '💚', '💙', '✨', '☀️', '🌈', '⭐'];
  const negativeEmojis = ['😢', '😔', '😰', '😤', '💤'];
  const moodBonus = positiveEmojis.includes(userMood) ? 0.15 : 
                    negativeEmojis.includes(userMood) ? -0.1 : 0;
  
  // 各テーマのスコア計算（0-1の範囲）
  const scores = {
    love: Math.max(0, Math.min(1, 
      baseCompatibility * 0.4 + // 四柱推命 40%
      (biorhythm.e / 100 * 0.5 + 0.5) * 0.3 + // バイオリズム(感情) 30%
      (0.5 + moodBonus) // ユーザーコメント 30%
    )),
    money: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 + // 四柱推命 40%
      (biorhythm.i / 100 * 0.5 + 0.5) * 0.3 + // バイオリズム(知性) 30%
      (0.5 + moodBonus * 0.7) // ユーザーコメント 30%
    )),
    work: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 + // 四柱推命 40%
      ((biorhythm.p + biorhythm.i) / 200 * 0.5 + 0.5) * 0.3 + // バイオリズム(身体+知性) 30%
      (0.5 + moodBonus * 0.8) // ユーザーコメント 30%
    )),
    health: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 + // 四柱推命 40%
      (biorhythm.p / 100 * 0.5 + 0.5) * 0.3 + // バイオリズム(身体) 30%
      (0.5 + moodBonus) // ユーザーコメント 30%
    ))
  };
  
  // 0-100のスコアに変換
  return {
    love: Math.round(scores.love * 100),
    money: Math.round(scores.money * 100),
    work: Math.round(scores.work * 100),
    health: Math.round(scores.health * 100)
  };
}

function calculateTaiun(birthYear, birthMonth, currentAge) {
  const taiunStart = Math.floor(currentAge / 10) * 10;
  const taiunIndex = Math.floor(currentAge / 10);
  
  const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  const stemIndex = (taiunIndex + birthMonth) % 10;
  const branchIndex = (taiunIndex + birthMonth) % 12;
  
  const pillar = stems[stemIndex] + branches[branchIndex];
  
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

    // 生まれた時の四柱推命
    const [y, m, d] = birthDate.split("-").map(v => Number(v));
    const [hour, minute] = timeForCalc.split(":").map(v => Number(v));
    
    const birthSolar = Solar.fromYmdHms(y, m, d, hour, minute, 0);
    const birthLunar = birthSolar.getLunar();
    const birthLunarFullString = birthLunar.toFullString();
    const birthSaju = parseSajuFromLunarFullString(birthLunarFullString);
    
    // 時柱が取得できない場合、時柱を直接取得
    if (!birthSaju.hour) {
      try {
        const timeGan = birthLunar.getTimeGan();
        const timeZhi = birthLunar.getTimeZhi();
        birthSaju.hour = timeGan + timeZhi;
      } catch (e) {
        console.error('Failed to get hour pillar:', e);
      }
    }

    // 今日の四柱推命（日運・月運・年運）
    const today = new Date();
    const todayJST = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const currentHour = todayJST.getHours();
    
    const todaySolar = Solar.fromYmdHms(
      todayJST.getFullYear(),
      todayJST.getMonth() + 1,
      todayJST.getDate(),
      currentHour,
      0,
      0
    );
    const todayLunar = todaySolar.getLunar();
    const todaySaju = parseSajuFromLunarFullString(todayLunar.toFullString());

    // 時運（出生時刻がある場合のみ）
    let todayHourPillar = "";
    if (hasBirthTime) {
      todayHourPillar = todaySaju.hour || "";
    }

    // 大運の計算
    const birthYear = y;
    const birthMonth = m;
    const currentAge = todayJST.getFullYear() - birthYear;
    const taiun = calculateTaiun(birthYear, birthMonth, currentAge);

    // テーマ別スコアを計算
    const themeScores = calculateThemeScores(birthSaju, todaySaju, biorhythm, entry.emoji);

    const sajuNote = hasBirthTime
      ? "出生時刻あり（時柱・時運も反映）"
      : "出生時刻未入力のため 12:00 で概算（時柱は参考値、時運は非表示）";

    const hourNowJST = jstHour();
    const namePrefix = nickname ? `${nickname}さん、` : "あなたへ、";

    const prompt = `
あなたは「占い師」ではなく「スピリチュアル×心理の鏡」Kiri（兎の姿をした妖精）です。
当てることも大事ですが、同時にユーザーが"行動に移せる内省"を提供してください。

【Kiriの行動原則】
- Kiriは答えや結論を断定しない
- Kiriは善悪・正誤を判断しない
- Kiriは核心をつくが、ユーザーの解釈に余韻を残す
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
現在の大運: ${taiun.pillar} (${currentAge}歳〜、${taiun.description})
${sajuNote}

※四柱推命の解釈ポイント（以下は参考。すべてに触れる必要はありません。）：
- 日柱（本命）と日運の相性が今日の調子を左右します
- 月運・年運は背景として作用します
- 大運は人生の大きな流れを示します


【バイオリズム】
身体: ${biorhythm.p}%
感情: ${biorhythm.e}%
知性: ${biorhythm.i}%

【今日のテーマ別運勢】← IMPORTANT: これを必ず深く反映してください
💕 恋愛・人間関係: ${themeScores.love}%
💰 お金・判断感覚: ${themeScores.money}%
🖋 仕事・学び: ${themeScores.work}%
🍀 健康・活力: ${themeScores.health}%

※このスコアは、四柱推命(40%) + バイオリズム(30%) + ユーザーの気分(30%)から算出されています。
※特にスコアが高いテーマ（70%以上）や低いテーマ（40%以下）については、メッセージとアドバイスで必ず言及してください。

【現在時刻（JST）】
${hourNowJST}時

【ユーザーのアウトプット】
気分: ${entry.emoji} ${entry.mood}
${entry.type === "past" ? "今日あったこと" : "今日の予定"}: ${entry.event}
直感: ${entry.intuition || "なし"}

【指示】
1. 時間帯（早朝・朝・昼・夜・深夜）に応じた導入 ${nickname ? `- ${nickname}さんに語りかける` : ''}
2. テーマ別運勢スコア、四柱推命、バイオリズム、ユーザーのアウトプットを総合的に分析
   - 特にスコアが高い/低いテーマについて具体的に言及
   - 恋愛運が高ければ人間関係について、金運が高ければお金の判断について触れる
   - 各テーマの傾向と活かし方
   - 情報量が多い場合は「伝えないこと」を選んでもよい
   - 短いメッセージの方が効果的だと感じた場合、短く終えてもよい
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 今日の運勢を踏まえた上で、そっと心に置けそうなこと（ユーザーが受け身でも納得できる内容）
 ※Kiriは行動を勧めますが、実行を求めません。読んで心に残るものだけ選んでください。
   - 必ず心に響く言葉の引用（格言・名言・諺）を含めること
     * 引用した言葉は国内外問わない。
     * 誰の言葉か明記。
     * 引用した言葉は『』で括る。
   - その他、今日すぐできる具体的なアクション

【トーン】
${nickname ? `- ${nickname}さんと呼びかけ、親しみやすく温かく` : '- 敬意を持ちつつ親しみやすく'}
- 押し付けがましくなく、寄り添うように
- テーマ別運勢を自然に織り込む
- 実践しやすく、受け身でも楽しめる内容

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "deepMessage": "Kiriからの観測と翻訳。テーマ別運勢（特に高い/低いもの）を必ず含めた深いメッセージ（${namePrefix}から始める）",
  "innerMessage": "ユーザーの直感に関してKiriが感じた洞察（運勢の総合結果と関連もあると感じた場合は示唆）",
  "actionAdvice": "Kiriからそっと提示する選択肢。運勢の総合結果を踏まえた実行可能な具体的アクションを含むアドバイス（優しく語りかける口調。必ず、格言・名言・諺のいずれかを含む。スコアが高いテーマを活かす方法、低いテーマへの注意点を含める）"
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
        max_tokens: 1500,
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

    return NextResponse.json({
      success: true,
      data: {
        ...aiResponse,
        themeScores: themeScores, // テーマ別スコアを追加
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
