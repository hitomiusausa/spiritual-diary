// 利用者のスマホの時計・タイムゾーンで「今日」と「いまの時刻」を決める（D-45）。
// 画面の日付、四柱推命の日運・時運、バイオリズム、朝昼夜、端末キャッシュの日付はすべてこの暦で数える。
// サーバー全体の回数上限（apiGuard.js）だけは運営側の都合で日本時間のまま。

export const DEFAULT_TIME_ZONE = "Asia/Tokyo";
const TIME_ZONE_MAX_CHARS = 64;

// IANA 名として使えるものだけを通す。使えないもの・空・長すぎるものは日本時間に倒す。
export function normalizeTimeZone(value) {
  if (typeof value !== "string") return DEFAULT_TIME_ZONE;
  const zone = value.trim();
  if (!zone || zone.length > TIME_ZONE_MAX_CHARS) return DEFAULT_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// 端末の標準タイムゾーン。取れなければ日本時間。
export function deviceTimeZone() {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// その地域の年・月・日・時・分（数値）。
export function zonedParts(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = Number(part.value);
    return result;
  }, {});
}

// その地域の暦日（YYYY-MM-DD）。
export function zonedDateKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// その地域の時（0〜23）。
export function zonedHour(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return zonedParts(date, timeZone).hour;
}
