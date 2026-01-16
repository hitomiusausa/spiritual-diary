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
  const birthElement = getElement(birthSaju.day);
  const todayElement = getElement(todaySaju.day);
  const baseCompatibility = getElementCompatibility(birthElement, todayElement);
  
  const positiveEmojis = ['😊', '🥰', '😆', '😌', '❤️', '💚', '💙', '✨', '☀️', '🌈', '⭐'];
  const negativeEmojis = ['😢', '😔', '😰', '😤', '💤'];
  const moodBonus = positiveEmojis.includes(userMood) ? 0.15 : 
                    negativeEmojis.includes(userMood) ? -0.1 : 0;
  
  const scores = {
    love: Math.max(0, Math.min(1, 
      baseCompatibility * 0.4 +
      (biorhythm.e / 100 * 0.5 + 0.5) * 0.3 +
      (0.5 + moodBonus)
    )),
    money: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      (biorhythm.i / 100 * 0.5 + 0.5) * 0.3 +
      (0.5 + moodBonus * 0.7)
    )),
    work: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      ((biorhythm.p + biorhythm.i) / 200 * 0.5 + 0.5) * 0.3 +
      (0.5 + moodBonus * 0.8)
    )),
    health: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      (biorhythm.p / 100 * 0.5 + 0.5) * 0.3 +
      (0.5 + moodBonus)
    ))
  };
  
  return {
    love: Math.round(scores.love * 100),
    money: Math.round(scores.money * 100),
    work: Math.round(scores.work * 100),
    health: Math.round(scores.health * 100)
  };
}

// 今日のヒントを計算
function calculateTodayHints(birthSaju, todaySaju, biorhythm, themeScores) {
  const todayElement = getElement(todaySaju.day);
  const bioAvg = (biorhythm.p + biorhythm.e + biorhythm.i) / 3;
  const themeAvg = (themeScores.love + themeScores.money + themeScores.work + themeScores.health) / 4;
  
  // 色の計算
  const colorMap = {
    '木': { bright: '明るい緑', mid: '優しい緑', dark: '深い緑', bgColor: 'bg-green-500', textColor: 'text-green-400' },
    '火': { bright: '温かいオレンジ', mid: '柔らかな赤', dark: '深い赤', bgColor: 'bg-orange-500', textColor: 'text-orange-400' },
    '土': { bright: '明るい黄', mid: '優しいベージュ', dark: '落ち着いた茶', bgColor: 'bg-yellow-600', textColor: 'text-yellow-400' },
    '金': { bright: '輝く白', mid: '柔らかな銀', dark: '静かなグレー', bgColor: 'bg-gray-400', textColor: 'text-gray-300' },
    '水': { bright: '明るい青', mid: '静かな青', dark: '深い紺', bgColor: 'bg-blue-500', textColor: 'text-blue-400' }
  };
  
  const colorData = colorMap[todayElement] || colorMap['水'];
  let colorName = colorData.mid;
  if (bioAvg > 40) colorName = colorData.bright;
  if (bioAvg < -40) colorName = colorData.dark;
  
  // 数字の計算
  const zhiMap = { '子':1, '丑':2, '寅':3, '卯':4, '辰':5, '巳':6, '午':7, '未':8, '申':9, '酉':1, '戌':2, '亥':3 };
  const todayZhi = todaySaju.day?.[1] || '子';
  let number = zhiMap[todayZhi] || 1;
  
  // バイオリズムで調整
  if (Math.abs(biorhythm.e) > Math.abs(biorhythm.p) && Math.abs(biorhythm.e) > Math.abs(biorhythm.i)) {
    number = (number + 1) % 9 + 1; // 感情優勢なら+1
  }
  
  // 方角の計算
  const directionMap = {
    '木': '東',
    '火': '南',
    '土': '中央',
    '金': '西',
    '水': '北'
  };
  let direction = directionMap[todayElement] || '東';
  
  // バイオリズムで微調整
  if (direction === '北' && biorhythm.e > 30) direction = '北東';
  if (direction === '東' && biorhythm.p > 30) direction = '南東';
  if (direction === '南' && biorhythm.i > 30) direction = '南西';
  if (direction === '西' && biorhythm.e < -30) direction = '北西';
  
  // 距離感の計算
  let distanceValue = '';
  let distanceMessage = '';
  
  if (themeAvg >= 75) {
    distanceValue = 'ぴったり寄り添う';
    distanceMessage = '今日はぴったり寄り添うくらいが心地よさそう。\n近くにいても大丈夫、そのままで。';
  } else if (themeAvg >= 55) {
    distanceValue = 'そばにいる';
    distanceMessage = '今日はそばにいるくらいがちょうどよさそう。\n無理に近づかなくても、遠ざからなくても。';
  } else if (themeAvg >= 40) {
    distanceValue = 'すこし離れて眺める';
    distanceMessage = '今日はすこし離れて眺めるくらいが心地よさそう。\n近づきすぎなくていい、そのままで。';
  } else if (themeAvg >= 25) {
    distanceValue = '遠くから見守る';
    distanceMessage = '今日は遠くから見守るくらいが楽かも。\n距離があっても、つながりは変わらない。';
  } else {
    distanceValue = 'ゆっくり休む';
    distanceMessage = '今日はゆっくり休むのがいちばんかも。\n離れても、戻ってこられるから大丈夫。';
  }
  
  return {
    color: {
      value: colorName,
      message: `今日のエネルギーを色に例えると、${colorName}に近い気がする。\n無理に使わなくても、目に入るだけで十分。`,
      emoji: '💙',
      bgColor: colorData.bgColor,
      textColor: colorData.textColor
    },
    number: {
      value: number,
      message: `今日のリズムは、「${number}」みたいな間隔で進むと楽そう。\n一気に決めなくていい、少しずつ。`,
      emoji: '🔢'
    },
    direction: {
      value: direction,
      message: `もし歩くなら、${direction}の方に意識が向くかも。\n向かなくてもいいけど、なんとなく。`,
      emoji: '🧭'
    },
    distance: {
      value: distanceValue,
      message: distanceMessage,
      emoji: '👥'
    }
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
    
    // 今日のヒントを計算
    const todayHints = calculateTodayHints(birthSaju, todaySaju, biorhythm, themeScores);

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
- Kiriは核心に触れることを伝えるが判断はユーザーに委ねる
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

※${sajuNote}

※四柱推命の解釈ポイント（参考。すべてに触れる必要はありません）:
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

※このスコアは、四柱推命(40%) + バイオリズム(40%) + ユーザーの気分(20%)から算出されています。
※特にスコアが高いテーマ（70%以上）や低いテーマ（40%以下）については、メッセージとアドバイスで必ず言及してください。

【現在時刻（JST）】
${hourNowJST}時

【ユーザーのアウトプット】
気分: ${entry.emoji} ${entry.mood}
${entry.type === "past" ? "今日あったこと" : "今日の予定"}: ${entry.event}
直感: ${entry.intuition || "なし"}

【指示】
1. 時間帯（朝・昼・夜）に応じた導入 ${nickname ? `- ${nickname}さんに語りかける` : ''}
2. テーマ別運勢スコア、四柱推命、バイオリズム、ユーザーのアウトプットを総合的に分析
   - 特にスコアが高い/低いテーマについて具体的に言及
   - 恋愛運が高ければ人間関係について、金運が高ければお金の判断について触れる
   - 各テーマの傾向と活かし方
3. ${entry.type === "past" ? "出来事から学べること" : "予定に向けての心構え"}
4. 今日の運勢を踏まえた具体的なアクション
   - テーマ別スコアに基づいたKiriからのアドバイス
   - 必ず格言・名言・諺を含める（『』で括り強調する）

【トーン】
${nickname ? `- ${nickname}さんと呼びかけ、親しみやすく温かく` : '- 敬意を持ちつつ親しみやすく'}
- 押し付けがましくなく、寄り添うように
- テーマ別運勢を自然に織り込む
- 実践しやすく、受け身でも楽しめる内容

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。
{
  "deepMessage": "Kiriからの観測と翻訳。テーマ別運勢（特に高い/低いもの）を必ず含めた深いメッセージ（${namePrefix}から始める）"。余韻を残すほど、程よい文量で,
  "innerMessage": "直感についての洞察（テーマ別運勢との関連も必要なら示唆）",
  "actionAdvice": "テーマ別運勢を踏まえた具体的アクションの提案（格言・名言を含む。スコアが高いテーマを活かす方法、低いテーマへの注意点を含める。全てを織り込む必要はない。）"
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
        themeScores: themeScores,
        todayHints: todayHints,
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
