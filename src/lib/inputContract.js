// 入力と送信の上限。JS string.length（UTF-16単位）でUIとAPIをそろえる。
export const NICKNAME_MAX_CHARS = 40;
export const ENTRY_EVENT_MAX_CHARS = 1200;
export const ENTRY_INTUITION_MAX_CHARS = 600;
export const CHAT_CONTEXT_MESSAGES = 12;
export const CHAT_USER_MAX_CHARS = 1200;
export const CHAT_REPLY_MAX_CHARS = 1800;
export const ANALYZE_UPSTREAM_TIMEOUT_MS = 60_000;
export const CHAT_UPSTREAM_TIMEOUT_MS = 30_000;

// 最大の通常入力（日本語/絵文字とJSONエスケープを含む）に余裕を持たせる。
// 履歴保存1000件とは別で、会話APIへは直近12件だけを送る。
export const ANALYZE_BODY_MAX_BYTES = 32 * 1024;
export const CHAT_BODY_MAX_BYTES = 192 * 1024;

const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BIRTH_DATE_TIME_ZONE = "Asia/Tokyo";

// 生年月日が日本時間の今日より後でないか（L-08）。UIの「はじめる」とAPIの両方で使う。
// 形式（YYYY-MM-DD）でなければ false。実在する日付かどうかは saju.js の parseBirthInput が確かめる。
export function isBirthDateNotFuture(birthDate, now = new Date()) {
  if (typeof birthDate !== "string" || !BIRTH_DATE_PATTERN.test(birthDate)) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: BIRTH_DATE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return birthDate <= today;
}
