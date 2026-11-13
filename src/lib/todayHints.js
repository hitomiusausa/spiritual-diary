// 今日のヒント（色・数字・方角・距離感）と日運・時運の短い説明。
// 同じJST日・同じ入力なら同じ結果になるよう、選択はすべてシードつき（D-04, L-04）。Math.random は使わない。

// ヒントの記録の引用に使う最大の文字数（コードポイント単位。絵文字を半分に割らない。L-05）
const RECORD_LABEL_MAX_CHARS = 36;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

// 五行の要素を取得
export function getElement(pillar) {
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

// ヒントのシード。命式・今日の柱・バイオリズム・記録の入力から作る。
export function buildHintSeed(birthSaju, todaySaju, biorhythm, entry = {}) {
  return [
    birthSaju.year, birthSaju.month, birthSaju.day, birthSaju.hour,
    todaySaju.year, todaySaju.month, todaySaju.day,
    biorhythm.p, biorhythm.e, biorhythm.i,
    entry.emoji || '', entry.type || '', entry.event || '', entry.intuition || '',
  ].join('|');
}

// シードから決まった順に候補を選ぶ関数を返す（FNV-1a）。呼ぶたびに次の数を使う。
export function stablePicker(seed) {
  let pickCount = 0;
  return (items) => {
    let hash = FNV_OFFSET_BASIS;
    for (const char of `${seed}:${pickCount++}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, FNV_PRIME);
    }
    return items[Math.abs(hash) % items.length];
  };
}

// 出来事の欄から、ヒントの文に引用する短いラベルを作る。サロゲートペアの途中で切らない。
export function recordLabel(event) {
  const text = String(event || '').trim().replace(/\s+/g, ' ');
  return Array.from(text).slice(0, RECORD_LABEL_MAX_CHARS).join('');
}

export function calculateTodayHints(birthSaju, todaySaju, biorhythm, themeScores, entry = {}, { gentle = false } = {}) {
  // --- 基本指標 ---
  const pick = stablePicker(buildHintSeed(birthSaju, todaySaju, biorhythm, entry));
  const todayElement = getElement(todaySaju.day);
  const bioAvg = (biorhythm.p + biorhythm.e + biorhythm.i) / 3;
  const themeAvg =
    (themeScores.love +
      themeScores.money +
      themeScores.work +
      themeScores.health) / 4;
  const themeLabels = {
    love: '人とのやりとり',
    money: 'お金や判断',
    work: '仕事や学び',
    health: '体と休息',
  };
  const dominantTheme = Object.entries(themeScores)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'work';
  const dominantLabel = themeLabels[dominantTheme];
  const eventLabel = recordLabel(entry.event);
  // 寄り添いモード(D-15)では、つらい言葉を色や数字の話の中で引用しない
  const recordLead = gentle
    ? 'ここに書いてくれた今日'
    : eventLabel ? `「${eventLabel}」と書いていた今日` : '今日の記録を振り返ると';
  
// 色の計算（語彙バリエーション拡張版）
const colorMap = {
  '木': {
    bright: ['若葉の緑', '芽吹きのグリーン', '朝の森の色', '風が抜ける葉の色', '産声を上げたばかりの緑', '光を吸い込む新緑', '上へと伸びる蔦の色'],
    mid: ['優しい緑', '草原の色', '呼吸しやすい緑', '日陰の草の色', '木漏れ日のエメラルド', '揺れるシダの葉色', '深呼吸を誘うミント'],
    dark: ['深い緑', '静かな森の色', '根を張る力強い緑', '雨上がりの森の色', '苔むした静寂の緑', '古木に宿る深い緑', '深い峰に根付く青緑'],
    bgColor: 'bg-kiri-wood',
    textColor: 'text-kiri-wood'
  },
  '火': {
    bright: ['陽だまりのオレンジ', '灯る朱色', '朝焼けの色', '火花のような色', '踊る焚き火の先端色', '生まれたての陽光色', '心に火を灯すマゼンタ'],
    mid: ['柔らかな赤', 'ぬくもりの街灯色', '心拍に近い赤', '夕方に近い色', '体温を感じるコーラル', '頬を染める淡い朱', '暖炉の傍のアンバー'],
    dark: ['深い赤', '熾火の色', '情熱が沈んだ赤', '夜に残る赤', '地表を流れる溶岩の赤', '静かに燃え続ける真紅', '記憶の底に眠る紅蓮'],
    bgColor: 'bg-kiri-fire',
    textColor: 'text-kiri-fire'
  },
  '土': {
    bright: ['明るい黄', '午後の光の色', '乾いた砂の色', '陽を含んだ土の色', '祝祭を彩る黄金色', '輝きを秘めた砂岩色', '未来を照らす山吹色'],
    mid: ['優しいベージュ', '土の色', '安心する色', '足元を感じる色', 'すべてを包むテラコッタ', '懐かしい砂利道の記憶', '時を重ねた陶器の色'],
    dark: ['落ち着いた茶', '耕された大地の色', '重心が下がる鉛の色', '静かな地面の色', '命を育む肥沃な黒土', '祈りが染み込んだ大地色', '深く根付く樹皮の茶'],
    bgColor: 'bg-kiri-earth',
    textColor: 'text-kiri-earth'
  },
  '金': {
    bright: ['澄んだ白', '朝の空気の色', '反射する光の色', '輪郭が輝く金色', '朝露を弾く真珠色', '霧を切り裂く白銀', '研ぎ澄まされた刃の閃光'],
    mid: ['柔らかな銀', '静かな白', '整った色', '思考が澄む透明', 'まどろみの中の乳白色', '月明かりを映すシルク', '境界線を溶かす淡い灰'],
    dark: ['静かなグレー', '影のある銀色', '古い真鍮の輝き', '新月の薄明かり', '沈黙を守る鉛の色', '歴史を刻んだ古銀色', '凛として冷たい鉄の色'],
    bgColor: 'bg-kiri-metal',
    textColor: 'text-kiri-metal'
  },
  '水': {
    bright: ['明るい青', '水面の青', '風を感じる青', '空に近い青', '氷河を溶かすペールブルー', '解き放たれる泉の青', '境界のない空と水の色'],
    mid: ['静かな青', '深呼吸の青', '夜に近づく青', '言葉が減る青', '潤いを与える雨の色', '思考を癒すラベンダーブルー', '静寂を湛えた池の水面'],
    dark: ['深い紺', '海の底の色', '眠りに近い青', '音が遠くなる青', '星さえ届かない深海の藍', '夜の帷が下りる瞬間', '永遠を映す真夜中の紺'],
    bgColor: 'bg-kiri-water',
    textColor: 'text-kiri-water'
  }
};

const colorData = colorMap[todayElement] || colorMap['水'];

let variants = colorData.mid;
if (bioAvg > 40) variants = colorData.bright;
if (bioAvg < -40) variants = colorData.dark;

// 配列ならシードで1つ選ぶ（同日同入力で同じ色名。L-04）
const colorName = Array.isArray(variants) ? pick(variants) : variants;

  
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
  
  // バイオリズムで微調整
  if (direction === '北' && biorhythm.e > 30) direction = '北東';
  if (direction === '東' && biorhythm.p > 30) direction = '南東';
  if (direction === '南' && biorhythm.i > 30) direction = '南西';
  if (direction === '西' && biorhythm.e < -30) direction = '北西';

// 距離感の計算（語彙さらに拡張版）
let distanceValue = '';
let distanceMessage = '';
const chooseDistance = (values, messages) => {
  const index = pick([...Array(Math.min(values.length, messages.length)).keys()]);
  return { value: values[index], message: messages[index] };
};


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
  ({ value: distanceValue, message: distanceMessage } = chooseDistance(values, messages));

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
  ({ value: distanceValue, message: distanceMessage } = chooseDistance(values, messages));

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
  ({ value: distanceValue, message: distanceMessage } = chooseDistance(values, messages));

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
  ({ value: distanceValue, message: distanceMessage } = chooseDistance(values, messages));

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
  ({ value: distanceValue, message: distanceMessage } = chooseDistance(values, messages));
}

return {
  color: {
    value: colorName,
    message: pick([
      `${recordLead}、${colorName}を身近なものの中からひとつ見つけてみる。${dominantLabel}を整理するときの目印にできそう`,
      `${colorName}は今日の気配を置いておく色。${recordLead}、画面や窓の外で見つけたら、ひと呼吸ぶんだけ手を止める合図に`,
      `身につけなくても大丈夫。${colorName}が目に入ったとき、${dominantLabel}をひとつだけ選び直す時間にできそう`
    ]),
    emoji: '💙',
    bgColor: colorData.bgColor,
    textColor: colorData.textColor
  },

number: {
  value: number,
  message: pick([
    `今日の数字は「${number}」。${dominantLabel}で迷ったら、候補を${number}個までに絞るための小さな目印に`,
    `「${number}」を見かけたら、${recordLead}に残したことを${number}分だけ整理する。答えを急がなくていい`,
    `意味を当てにいかなくて大丈夫。${number}回深く息を吐いてから、${dominantLabel}の次の一手をひとつ選ぶ`
  ]),
  emoji: '🔢'
}
,

  direction: {
    value: direction,
    message: pick([
      `${direction}へ移動する必要はないよ。窓や画面の${direction}側に視線を置いて、${dominantLabel}をひとつだけ見直す場所に`,
      `帰り道や部屋の中で${direction}が目に入ったら、${recordLead}の続きを一行だけ書く。そこから先は明日に置いていい`,
      `今日は${direction}を「進む方向」ではなく「視線を戻す方向」に。${dominantLabel}で急いでいたら、ひとつだけ余白を置けそう`
    ]),
    emoji: '🧭',
  },

  distance: {
    value: distanceValue,
    message: distanceMessage,
    emoji: '👥'
  }
};
}

// 日運のdescriptionを生成
export function getDayDescription(dayPillar, seed = "") {
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
  
  return element ? stablePicker(`${seed}|day`)(descriptions[element]) : '今日という一日。';
}

// 時運のdescriptionを生成
export function getHourDescription(hourPillar, seed = "") {
  const element = getElement(hourPillar);
  const descriptions = {
    '木': ['今の時間は伸びやかな気配。', '今は動きを感じやすい時間。'],
    '火': ['今の時間は明るい勢い。', '今は活気を感じる時間。'],
    '土': ['今の時間は落ち着いた安定感。', '今は穏やかな時間。'],
    '金': ['今の時間は整った冷静さ。', '今は明確さを感じる時間。'],
    '水': ['今の時間は流れるような柔らかさ。', '今は適応しやすい時間。']
  };
  
  return element ? stablePicker(`${seed}|hour`)(descriptions[element]) : '今という時間。';
}
