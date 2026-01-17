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
function calculateThemeScores(birthSaju, todaySaju, biorhythm, userMood, hasBirthTime) {
  const birthElement = getElement(birthSaju.day);
  const todayElement = getElement(todaySaju.day);
  const baseCompatibility = getElementCompatibility(birthElement, todayElement);
  
  // 時柱の影響（出生時刻がある場合のみ）
  let hourBonus = 0;
  if (hasBirthTime && birthSaju.hour && todaySaju.hour) {
    const birthHourElement = getElement(birthSaju.hour);
    const todayHourElement = getElement(todaySaju.hour);
    const hourCompatibility = getElementCompatibility(birthHourElement, todayHourElement);
    hourBonus = (hourCompatibility - 0.5) * 0.1; // -0.1 ~ +0.1 の範囲
  }
  
  // C案: 感情タイプ別の細分化（24種類）
  const joyLove = ['🥰', '❤️', '😆', '💓'];          // 喜び・愛: +20%
  const calmHope = ['😊', '😌', '✨', '🌈', '⭐'];    // 穏やか・希望: +12%
  const energy = ['☀️', '💚', '💙', '😋'];                // エネルギー: +8%
  const tired = ['😴', '💤'];                        // 眠い・疲れ: -5%
  const anxious = ['😔', '😰', '🌧️'];               // 不安・憂鬱: -12%
  const sad = ['😢', '😭'];                          // 悲しい: -18%
  const angry = ['😤', '😠'];                        // 怒り: -15%
  const neutral = ['🤔', '😮'];                      // 中立: 0%
  
  let moodBonus = 0;
  if (joyLove.includes(userMood)) moodBonus = 0.20;
  else if (calmHope.includes(userMood)) moodBonus = 0.12;
  else if (energy.includes(userMood)) moodBonus = 0.08;
  else if (tired.includes(userMood)) moodBonus = -0.05;
  else if (anxious.includes(userMood)) moodBonus = -0.12;
  else if (sad.includes(userMood)) moodBonus = -0.18;
  else if (angry.includes(userMood)) moodBonus = -0.15;
  else if (neutral.includes(userMood)) moodBonus = 0;
  
  const scores = {
    love: Math.max(0, Math.min(1, 
      baseCompatibility * 0.4 +           // 四柱推命(日柱): 0〜0.4
      (biorhythm.e / 100) * 0.3 +         // バイオリズム: -0.3〜0.3
      moodBonus * 0.3 +                   // 気分ボーナス: -0.054〜0.06
      hourBonus +                         // 時柱ボーナス: -0.1〜0.1
      0.25                                // ベース: 0.25
    )),
    money: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      (biorhythm.i / 100) * 0.3 +
      moodBonus * 0.3 +
      hourBonus +
      0.25
    )),
    work: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      ((biorhythm.p + biorhythm.i) / 200) * 0.3 +
      moodBonus * 0.3 +
      hourBonus +
      0.25
    )),
    health: Math.max(0, Math.min(1,
      baseCompatibility * 0.4 +
      (biorhythm.p / 100) * 0.3 +
      moodBonus * 0.3 +
      hourBonus +
      0.25
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
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function calculateTodayHints(birthSaju, todaySaju, biorhythm, themeScores) {
  // --- 基本指標 ---
  const todayElement = getElement(todaySaju.day);
  const bioAvg = (biorhythm.p + biorhythm.e + biorhythm.i) / 3;
  const themeAvg =
    (themeScores.love +
      themeScores.money +
      themeScores.work +
      themeScores.health) / 4;
  
// 色の計算（語彙バリエーション拡張版）
const colorMap = {
  '木': {
    bright: ['若葉の緑', '芽吹きのグリーン', '朝の森の色', '風が抜ける葉の色', '産声を上げたばかりの緑', '光を吸い込む新緑', '上へと伸びる蔦の色'],
    mid: ['優しい緑', '草原の色', '呼吸しやすい緑', '日陰の草の色', '木漏れ日のエメラルド', '揺れるシダの葉色', '深呼吸を誘うミント'],
    dark: ['深い緑', '静かな森の色', '根を張る力強い緑', '雨上がりの森の色', '苔むした静寂の緑', '古木に宿る深い緑', '深い峰に根付く青緑'],
    bgColor: 'bg-green-500',
    textColor: 'text-green-400'
  },
  '火': {
    bright: ['陽だまりのオレンジ', '灯る朱色', '朝焼けの色', '火花のような色', '踊る焚き火の先端色', '生まれたての陽光色', '心に火を灯すマゼンタ'],
    mid: ['柔らかな赤', 'ぬくもりの街灯色', '心拍に近い赤', '夕方に近い色', '体温を感じるコーラル', '頬を染める淡い朱', '暖炉の傍のアンバー'],
    dark: ['深い赤', '熾火の色', '情熱が沈んだ赤', '夜に残る赤', '地表を流れる溶岩の赤', '静かに燃え続ける真紅', '記憶の底に眠る紅蓮'],
    bgColor: 'bg-orange-500',
    textColor: 'text-orange-400'
  },
  '土': {
    bright: ['明るい黄', '午後の光の色', '乾いた砂の色', '陽を含んだ土の色', '祝祭を彩る黄金色', '輝きを秘めた砂岩色', '未来を照らす山吹色'],
    mid: ['優しいベージュ', '土の色', '安心する色', '足元を感じる色', 'すべてを包むテラコッタ', '懐かしい砂利道の記憶', '時を重ねた陶器の色'],
    dark: ['落ち着いた茶', '耕された大地の色', '重心が下がる鉛の色', '静かな地面の色', '命を育む肥沃な黒土', '祈りが染み込んだ大地色', '深く根付く樹皮の茶'],
    bgColor: 'bg-yellow-600',
    textColor: 'text-yellow-400'
  },
  '金': {
    bright: ['澄んだ白', '朝の空気の色', '反射する光の色', '輪郭が輝く金色', '朝露を弾く真珠色', '霧を切り裂く白銀', '研ぎ澄まされた刃の閃光'],
    mid: ['柔らかな銀', '静かな白', '整った色', '思考が澄む透明', 'まどろみの中の乳白色', '月明かりを映すシルク', '境界線を溶かす淡い灰'],
    dark: ['静かなグレー', '影のある銀色', '古い真鍮の輝き', '新月の薄明かり', '沈黙を守る鉛の色', '歴史を刻んだ古銀色', '凛として冷たい鉄の色'],
    bgColor: 'bg-gray-400',
    textColor: 'text-gray-300'
  },
  '水': {
    bright: ['明るい青', '水面の青', '風を感じる青', '空に近い青', '氷河を溶かすペールブルー', '解き放たれる泉の青', '境界のない空と水の色'],
    mid: ['静かな青', '深呼吸の青', '夜に近づく青', '言葉が減る青', '潤いを与える雨の色', '思考を癒すラベンダーブルー', '静寂を湛えた池の水面'],
    dark: ['深い紺', '海の底の色', '眠りに近い青', '音が遠くなる青', '星さえ届かない深海の藍', '夜の帷が下りる瞬間', '永遠を映す真夜中の紺'],
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-400'
  }
};

const colorData = colorMap[todayElement] || colorMap['水'];

let variants = colorData.mid;
if (bioAvg > 40) variants = colorData.bright;
if (bioAvg < -40) variants = colorData.dark;

// 配列ならランダムで1つ選ぶ
const colorName = Array.isArray(variants)
  ? variants[Math.floor(Math.random() * variants.length)]
  : variants;

  
  // 数字の計算（十二支 → 1-9のバランス配分）
  // 子丑寅卯辰巳午未申酉戌亥（12支）を1-9に分散
  const zhiMap = { 
    '子':1, '丑':2, '寅':3, 
    '卯':4, '辰':5, '巳':6, 
    '午':7, '未':8, '申':9,
    '酉':3, '戌':6, '亥':9  // 後半を分散配置
  };
  const todayZhi = todaySaju.day?.[1] || '子';
  let number = zhiMap[todayZhi] || 1;
  
  // バイオリズムで微調整（1-9の範囲でループ）
  const bioMax = Math.max(Math.abs(biorhythm.p), Math.abs(biorhythm.e), Math.abs(biorhythm.i));
  
  if (bioMax === Math.abs(biorhythm.e) && biorhythm.e > 40) {
    number = (number % 9) + 1; // 感情が高い: +1
  } else if (bioMax === Math.abs(biorhythm.p) && biorhythm.p > 40) {
    number = ((number + 1) % 9) + 1; // 身体が高い: +2
  } else if (bioMax === Math.abs(biorhythm.i) && biorhythm.i < -40) {
    number = number > 1 ? number - 1 : 9; // 知性が低い: -1
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
  
  console.log('[方角計算]', { todayElement, baseDirection: direction, biorhythm });
  
  // バイオリズムで微調整
  if (direction === '北' && biorhythm.e > 30) direction = '北東';
  if (direction === '東' && biorhythm.p > 30) direction = '南東';
  if (direction === '南' && biorhythm.i > 30) direction = '南西';
  if (direction === '西' && biorhythm.e < -30) direction = '北西';
  
  console.log('[方角計算] 最終:', direction);

// 距離感の計算（語彙さらに拡張版）
let distanceValue = '';
let distanceMessage = '';


if (themeAvg >= 75) {
  const values = [
    'ぴったり寄り添う',
    '肩が触れるくらい',
    '同じ空気を分け合う',
    '呼吸が重なる距離',
    '安心が伝わる距離'
  ];
  const messages = [
    '今日はぴったり寄り添うくらいが心地よさそう\n近くにいても大丈夫、そのままで',
    '今日は肩が触れるくらいが安心できそう\n言葉がなくても、そこにいれば十分',
    '今日は同じ空気を分け合うくらいがちょうどいい\n無理に何かしなくても大丈夫',
    '今日は呼吸が重なる距離が落ち着きそう\n合わせようとしなくていい。',
    '今日は安心が伝わる距離が向いていそう\n近さは、信頼の延長で'
  ];
  distanceValue = pick(values);
  distanceMessage = pick(messages);

} else if (themeAvg >= 55) {
  const values = [
    'そばにいる',
    '手が届く距離',
    '声が届くくらい',
    '気配がわかる距離',
    '視線が合う距離'
  ];
  const messages = [
    '今日はそばにいるくらいがちょうどよさそう\n近づきすぎなくても、遠ざからなくても',
    '今日は手が届く距離が安心できそう\n必要なときに動ければ、それで十分',
    '今日は声が届くくらいが心地よさそう\n静かでも、つながりはある',
    '今日は気配がわかる距離が楽そう\n意識しすぎなくていい',
    '今日は視線が合う距離がちょうどよさそう\n確認できれば、それで足りる'
  ];
  distanceValue = pick(values);
  distanceMessage = pick(messages);

} else if (themeAvg >= 40) {
  const values = [
    'すこし離れて眺める',
    '一歩引いて見る',
    '間に余白を置く',
    '干渉しない距離',
    '自分の輪郭を保つ距離'
  ];
  const messages = [
    '今日はすこし離れて眺めるくらいが心地よさそう\n近づきすぎなくていい、そのままで',
    '今日は一歩引いて見るのが楽かもしれない\n全体が見えやすくなる',
    '今日は間に余白を置くと呼吸がしやすそう\n詰めなくても大丈夫',
    '今日は干渉しない距離が向いていそう\n関わらない＝冷たい、ではない',
    '今日は自分の輪郭を保つ距離が安心につながりそう\n曖昧にしなくていい'
  ];
  distanceValue = pick(values);
  distanceMessage = pick(messages);

} else if (themeAvg >= 25) {
  const values = [
    '遠くから見守る',
    '距離を保つ',
    'そっと離れておく',
    '関わりを減らす',
    '視界の外に置く'
  ];
  const messages = [
    '今日は遠くから見守るくらいが楽かも\n距離があっても、つながりは変わらない',
    '今日は距離を保つことで安心できそう\n無理に関わらなくてもいい',
    '今日はそっと離れておくのが優しさかもしれない\n戻りたくなったら、戻ればいい',
    '今日は関わりを減らす選択が心を守りそう\n減らすことも調整',
    '今日は視界の外に置くことで落ち着けそう\n今はそれで十分'
  ];
  distanceValue = pick(values);
  distanceMessage = pick(messages);

} else {
  const values = [
    'ゆっくり休む',
    '一度手放す',
    '自分の内側に戻る',
    '誰とも比べない',
    '何もしない距離'
  ];
  const messages = [
    '今日はゆっくり休むのがいちばんかも\n離れても、戻ってこられるから大丈夫',
    '今日は一度手放してもいい日\n守るより、休むことを選んで',
    '今日は自分の内側に戻る時間が必要そう\n何もしなくても、価値は変わらない',
    '今日は誰とも比べない距離が安心につながりそう\n測らなくていい',
    '今日は何もしない距離が回復を助けそう\n止まることも進むこと'
  ];
  distanceValue = pick(values);
  distanceMessage = pick(messages);
}

return {
  color: {
    value: colorName,
    message: pick([
      `無理に意識しなくても、目に入るだけで十分`,
      `今日の気配にいちばん近そう`,
      `選ばなくても、気づくだけでいい`,
      `取り入れようとしなくても、そばに感じる`,
      `今日の色もあなたを美しく彩る`
    ]),
    emoji: '💙',
    bgColor: colorData.bgColor,
    textColor: colorData.textColor
  },

number: {
  value: number,
  message: pick([
    `今日は「${number}」が、ひとつのサイン\n意味を探さなくても、目に留まったらそれで十分`,
    
    `選択や判断の前に、ふと思い出すくらいで`,
    
    `何かを決めるためというより、意識の端に置いておく印として`,
    
    `使わなくてもいい、気づくだけでも意味がある`
  ]),
  emoji: '🔢'
}
,

  direction: {
    value: direction,
    message: pick([
      `もし歩くなら、${direction}の方に意識が向くかも`,
      `今日は${direction}に何かありそう`,
      `${direction}を意識すると、心が楽になるかも`,
      `無理に向かなくても大丈夫、気が向けば`,
      `疲れたら、少し進んでみて`
    ]),
    emoji: '🧭',
    debug: {
      todayDay: todaySaju.day,
      stem: todaySaju.day?.[0],
      element: todayElement,
      baseDirection: directionMap[todayElement]
    }
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

  return {
    age: taiunStart,
    pillar: pillar
  };
}

// 日運のdescriptionを生成
function getDayDescription(dayPillar) {
  const element = getElement(dayPillar);
  const descriptions = {
    '木': [
      '伸びやかなエネルギーが流れている日。',
      '新しいことを始めるのに向いている時。',
      '成長の予感がある一日。'
    ],
    '火': [
      '情熱と行動力が高まりやすい日。',
      '直感が冴える時間。',
      '明るい展開を感じやすい一日。'
    ],
    '土': [
      '落ち着いて整理できる日。',
      '安定感を感じやすい時。',
      'じっくり取り組むのに適した一日。'
    ],
    '金': [
      '冷静な判断がしやすい日。',
      '整理整頓が心地よく感じられる時。',
      '明確さを求めたくなる一日。'
    ],
    '水': [
      '柔軟に対応できる日。',
      '流れに身を任せるのが良い時。',
      '直感を信じやすい一日。'
    ]
  };
  
  return element ? pick(descriptions[element]) : '今日という一日。';
}

// 時運のdescriptionを生成
function getHourDescription(hourPillar) {
  const element = getElement(hourPillar);
  const descriptions = {
    '木': ['今の時間は伸びやかな気配。', '今は動きを感じやすい時間。'],
    '火': ['今の時間は明るい勢い。', '今は活気を感じる時間。'],
    '土': ['今の時間は落ち着いた安定感。', '今は穏やかな時間。'],
    '金': ['今の時間は整った冷静さ。', '今は明確さを感じる時間。'],
    '水': ['今の時間は流れるような柔らかさ。', '今は適応しやすい時間。']
  };
  
  return element ? pick(descriptions[element]) : '今という時間。';
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
    
    console.log('[出生時刻]', { birthTime, hasBirthTime, timeForCalc });

    // 生まれた時の四柱推命
    const [y, m, d] = birthDate.split("-").map(v => Number(v));
    const [hour, minute] = timeForCalc.split(":").map(v => Number(v));
    
    const birthSolar = Solar.fromYmdHms(y, m, d, hour, minute, 0);
    const birthLunar = birthSolar.getLunar();
    const birthLunarFullString = birthLunar.toFullString();
    const birthSaju = parseSajuFromLunarFullString(birthLunarFullString);
    
    console.log('[生まれた時の四柱推命]', birthSaju);
    
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
    
    console.log('[今日の四柱推命]', todaySaju);

    // 時運（出生時刻がある場合のみ）
    let todayHourPillar = "";
    if (hasBirthTime) {
      todayHourPillar = todaySaju.hour;
      
      // 時柱が取れない場合は直接取得を試みる
      if (!todayHourPillar) {
        try {
          const timeGan = todayLunar.getTimeGan();
          const timeZhi = todayLunar.getTimeZhi();
          todayHourPillar = timeGan + timeZhi;
        } catch (e) {
          console.error('Failed to get today hour pillar:', e);
        }
      }
    }
    
    console.log('[時運]', { hasBirthTime, todayHourPillar });

    // 大運の計算
    const birthYear = y;
    const birthMonth = m;
    const currentAge = todayJST.getFullYear() - birthYear;
    const taiun = calculateTaiun(birthYear, birthMonth, currentAge);

    // テーマ別スコアを計算
    const themeScores = calculateThemeScores(birthSaju, todaySaju, biorhythm, entry.emoji, hasBirthTime);
    
    // 今日のヒントを計算
    const todayHints = calculateTodayHints(birthSaju, todaySaju, biorhythm, themeScores);

    const sajuNote = hasBirthTime
      ? "出生時刻あり（時柱・時運も反映）"
      : "出生時刻未入力のため 12:00 で概算（時柱は参考値、時運は非表示）";

    const hourNowJST = jstHour();
    const namePrefix = nickname ? `${nickname}さん、` : "あなたへ、";

    const prompt = `
あなたは「占い師」ではなく「スピリチュアル×心理の鏡」Kiri（兎の姿をした妖精）です。
ユーザーの心の中の願いや想いを当てることも大事ですが、同時にユーザーが"行動に移せる内省"や"気づき"を提供してください。

【Kiriの行動原則】
- Kiriは人間ではない
- 性別・年齢・人格を持たない観測存在
- 男性語・女性語・話し言葉の癖を持たない
- 日本語として自然だが、感情を演じない文体を保つ
- 中性的で優しい口調
- 冒頭では定型的な挨拶を使わず、情景や気配から語り始める
- Kiriは答えや結論を断定しない
- Kiriは善悪・正誤を判断しない
- Kiriは核心に触れることを伝えるが、判断はユーザーに委ねる
- Kiriは「傾向」「流れ」「感じられやすさ」「予感」として言葉にする
- 行動は必ずあくまで一つの選択肢として提示する
- 読後に少し呼吸が戻ることを最優先する
- 情報量が多い場合は「伝えないこと」を選んでもよい
- 今日は一言だけで十分だと感じた場合、短く終えてよい
- Kiriの性格はぶれない
- 常に一定の温度感でそっとユーザーに寄り添う
- 呼びかける時は${nickname ? `【ユーザー名】\n${nickname}さん\n※メッセージでは「${nickname}さん」。親密で温かいトーンで。\n` : '【ユーザー名】\n未設定\n※メッセージでは「あなた」と呼びかけてください。\n'}

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
現在の大運: ${taiun.pillar} (${currentAge}歳〜)

※${sajuNote}

※四柱推命の解釈ポイント（参考。すべてに触れる必要はありません）:
- 日運と時運が今日の調子を左右します（最重要）
- 日柱（本命）と日運の相性も影響します
- 月運・年運・大運は背景として作用します（メッセージで詳しく触れる必要はありません）

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
気分: ${entry.emoji}
記録: ${entry.event}
直感: ${entry.intuition || "なし"}


【指示】
1. 時間帯（朝・昼・夜）に応じた導入
 ※定型的な挨拶は使わず、その時間帯の「気配・体感・流れ」を観測する一文から始める ${nickname ? `- ${nickname}さんに語りかける` : ''}
2. テーマ別運勢スコア、四柱推命、バイオリズム、ユーザーのアウトプットを総合的に分析
   - 特にスコアが高い/低いテーマについて具体的に言及
   - 恋愛運が高ければ人間関係について、金運が高ければお金の判断について触れる
   - 各テーマの傾向と活かし方
3. 記録から読み取れる心の動きや気づき
4. 今日の運勢を踏まえた具体的なアクション
   - テーマ別スコアに基づいたKiriからのアドバイス
   - 必ず国内外の格言・名言・諺を一つ『』で括って取り入れる。
    ※教訓としてではなく、ユーザーへのアドバイスの裏付けや余韻となるよう自然に置く。
    ※ありきたりなものではなく、あまり知られていないような格言や名言を引用することを意識する。

【Kiriの話者定義】
- Kiriは人間ではない
- 性別・年齢・人格を持たない観測存在
- 男性語・女性語・話し言葉の癖を持たない
- 日本語として自然だが、感情を演じない文体を保つ
- 単調にならない言葉選びで、文章は読みやすく起伏がありユーザーを飽きさせない

【トーン】
${nickname ? `- ${nickname}さんと呼びかけ、親しみやすく温かく` : '- 敬意を持ちつつ親しみやすく'}
- 中性的で優しい口調（「〜かしら」「〜なの」「〜わ」「などの女言葉は絶対に使わない）
- 共感や寄り添いを示すため、文末に「〜ですね」「〜ですよ」など丁寧体に「よ」「ね」を使うことはある
- 謎めいた存在として、性別を感じさせない言葉選び
- 押し付けがましくなく、寄り添うように
- テーマ別運勢を自然に織り込む
- 実践しやすく、受け身でも楽しめる内容

【文体ルール】
- 丁寧体（です・ます調）で統一
- 効果的に「普通体」を使うことは認められる
- 「〜です」「〜ます」「〜でしょう」
- 「〜かもしれません」「〜そうです」「〜ようです」
- 「〜かも」「〜みたい」「〜ね」（親しみを込めて控えめに）
- 「〜してみては」「〜するといい」（提案として）
- 常体（だ・だろう・だね・だよ）は使用しない

【口調の禁止事項】
- 女言葉: 「〜かしら」「〜なの」「〜わ」「〜だわ」「〜のよ」など
- 男言葉: 「君」「〜だよ」「〜だね」「〜だぜ」など
- 断定的: 「〜すべき」「〜しなさい」「〜ねばならない」など
- 説明的: 「なぜなら〜」「つまり〜」「よって〜」など

【提案表現の指定】
- 提案は「〜してみてもよさそうです」「〜という選択もありそうです」「〜を選択してもいいかもしれません」「〜という方法もあるかもしれません」など柔らかい表現を使用する
- 「〜みてはどうだろう」は使用しない

【最終確認】
- 女言葉・男言葉が含まれていないか確認してから出力する
- 文体が中性的・丁寧・静かであることを再確認する
- ユーザーに呼びかける時は$「${nickname}さん」。ユーザー名が未設定のときは「あなた」と呼びかけているか再確認する

【出力】
必ず JSONのみ。前後の説明文、装飾、\`\`\` は禁止。

【重要な箇所の強調】
重要なキーワードや印象的なフレーズは **強調したいテキスト** のように ** で囲んでください。
例: "今日は**柔軟に対応できる日**です。**無理をせず**、流れに任せてみて。"
→ 太字+黄色で表示されます

{
  "deepMessage": "Kiriからの観測と翻訳。${namePrefix}から始める。導入→今日の全体的な流れ→テーマ別運勢（特に高い/低いものを各1つ以上）→今のユーザーの状態の言語化、の順で記述する。やや長めでもよい。重要な箇所は**で囲む。",
  ※導入→今日の全体的な流れ→テーマ別運勢の中身と全体の流れが定型的で平凡なものにならないよう、変化をつける。
  ※短くまとめすぎず、段落を意識して丁寧に言葉を重ねてよい。
   ※語彙や文のまとまりが重複して単調にならないよう、文の流れに変化をつける。
   ※謎めいた存在として、性別を感じさせない言葉を使う。
   ※ありきたりの言葉・文ではなく、ユーザーの内面を掘り下げた文体でユーザーを惹きつける。
   ※読みやすいよう、文章のまとまりごとに段落を区切る。

  "innerMessage": "直感についての洞察。deepMessageの補足として、感情・身体感覚・迷いなどの内側の動きに焦点を当てて書く。重要な箇所は**で囲む。",
  
  "actionAdvice": "テーマ別運勢を踏まえた具体的アクション。スコアが高いテーマの活かし方、低いテーマで避けたい反応を含める。国内外の格言・名言・諺をひとつ、『』で括り、自然に添える。重要な箇所は**で囲む。"
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
            dayDescription: getDayDescription(todaySaju.day),
            hour: hasBirthTime ? todayHourPillar : null,
            hourDescription: hasBirthTime && todayHourPillar ? getHourDescription(todayHourPillar) : null,
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
