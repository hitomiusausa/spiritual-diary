import { Solar } from "lunar-javascript";
import { DEFAULT_TIME_ZONE, zonedParts } from "./localTime";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const GENDER_FOR_YUN = {
  female: 0,
  male: 1,
};

// 大運の数（lunar-javascript の getDaYun に渡す。先頭の起運前の1つを除いて使う）と1つの長さ。
const DAYUN_COUNT = 12;
const DAYUN_YEARS = 10;

const pad2 = (value) => String(value).padStart(2, "0");

const ELEMENT_BY_STEM = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};

function assertValidDateParts(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("birthDate must be a valid ISO date");
  }
}

export function parseBirthInput(birthDate, birthTime = "") {
  const dateMatch = String(birthDate ?? "").match(DATE_PATTERN);
  if (!dateMatch) throw new Error("birthDate must use YYYY-MM-DD");

  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  assertValidDateParts(year, month, day);

  const normalizedTime = String(birthTime ?? "").trim();
  if (!normalizedTime) {
    return { year, month, day, hour: 12, minute: 0, hasBirthTime: false };
  }

  const timeMatch = normalizedTime.match(TIME_PATTERN);
  if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) {
    throw new Error("birthTime must use HH:mm");
  }

  return {
    year,
    month,
    day,
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    hasBirthTime: true,
  };
}

export function normalizeGender(gender) {
  return Object.prototype.hasOwnProperty.call(GENDER_FOR_YUN, gender)
    ? gender
    : null;
}

export function getStemElement(pillar) {
  return ELEMENT_BY_STEM[String(pillar ?? "")[0]] ?? null;
}

export function chartFromSolar(solar) {
  const eightChar = solar.getLunar().getEightChar();
  return {
    year: eightChar.getYear(),
    month: eightChar.getMonth(),
    day: eightChar.getDay(),
    hour: eightChar.getTime(),
    zodiac: solar.getLunar().getYearShengXiao(),
    dayMaster: eightChar.getDayGan(),
    dayMasterElement: getStemElement(eightChar.getDay()),
    raw: eightChar.toString(),
    _eightChar: eightChar,
  };
}

export function calculateBirthChart({ birthDate, birthTime = "" }) {
  const input = parseBirthInput(birthDate, birthTime);
  const solar = Solar.fromYmdHms(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    0,
  );
  const chart = chartFromSolar(solar);

  return {
    ...chart,
    hasBirthTime: input.hasBirthTime,
    input,
    solar,
  };
}

// 利用者の地域（timeZone・既定は日本時間）の年月日時分（D-45）。
export function jstParts(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return zonedParts(date, timeZone);
}

function jstDateString(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = jstParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function calculateCurrentChart(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = jstParts(date, timeZone);
  const solar = Solar.fromYmdHms(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  );
  return { ...chartFromSolar(solar), solar, parts };
}

export function calculateDaYun({ birthChart, gender, now = new Date(), timeZone = DEFAULT_TIME_ZONE }) {
  const normalizedGender = normalizeGender(gender);
  if (!normalizedGender) {
    return {
      available: false,
      reason: "gender_required_for_direction",
      direction: null,
      current: null,
      start: null,
    };
  }

  const yun = birthChart._eightChar.getYun(GENDER_FOR_YUN[normalizedGender], 2);
  const startSolar = yun.getStartSolar();
  // 各大運は起運日の応当日（startYear-起運月-起運日）に始まり、次の大運の開始日の前日まで続く（L-02）。
  // 年齢は日本の読み方に合わせて、その開始日の満年齢にする（ライブラリの getStartAge は数え年。L-01）。
  const startMonthDay = `${pad2(startSolar.getMonth())}-${pad2(startSolar.getDay())}`;
  const birthInput = birthChart.input;
  const birthMonthDay = `${pad2(birthInput.month)}-${pad2(birthInput.day)}`;
  const today = jstDateString(now, timeZone);
  const periods = yun.getDaYun(DAYUN_COUNT).slice(1).map((period) => {
    const startYear = period.getStartYear();
    const startAge = startYear - birthInput.year - (startMonthDay < birthMonthDay ? 1 : 0);
    return {
      pillar: period.getGanZhi(),
      startDate: `${startYear}-${startMonthDay}`,
      startAge,
      endAge: startAge + DAYUN_YEARS - 1,
      startYear,
      endYear: period.getEndYear(),
    };
  });
  const current = periods.find((period, index) => {
    const nextStart = periods[index + 1]?.startDate
      ?? `${period.startYear + DAYUN_YEARS}-${startMonthDay}`;
    return today >= period.startDate && today < nextStart;
  }) ?? null;

  return {
    available: true,
    gender: normalizedGender,
    direction: yun.isForward() ? "forward" : "backward",
    start: {
      year: yun.getStartYear(),
      month: yun.getStartMonth(),
      day: yun.getStartDay(),
      solar: startSolar.toYmd(),
    },
    current,
    pillar: current?.pillar ?? null,
    age: current?.startAge ?? null,
    periods,
  };
}

export function calculateSaju({ birthDate, birthTime = "", gender, now = new Date(), timeZone = DEFAULT_TIME_ZONE }) {
  const birth = calculateBirthChart({ birthDate, birthTime });
  const today = calculateCurrentChart(now, timeZone);
  const taiun = calculateDaYun({ birthChart: birth, gender, now, timeZone });

  return {
    birth: stripInternalChart(birth),
    today: stripInternalChart(today),
    taiun,
    note: birth.hasBirthTime
      ? "出生時刻あり（時柱・時運も反映）"
      : "出生時刻未入力のため12:00で概算（時柱は参考値、時運は非表示）",
  };
}

function stripInternalChart(chart) {
  const { _eightChar, solar, ...publicChart } = chart;
  return publicChart;
}
