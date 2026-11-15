import { DEFAULT_TIME_ZONE, normalizeTimeZone } from './localTime';

// 経過24時間ではなく、利用者の地域（timeZone・既定は日本時間）の暦日差。同じ暦日なら同じ値を保つ（D-45）。
export function calculateBiorhythm(birthDate, now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error('Invalid birth date');
  const [year, month, day] = birthDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error('Invalid birth date');
  const birth = { year, month, day };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: normalizeTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const today = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const elapsedDays = Math.round((Date.UTC(today.year, today.month - 1, today.day)
    - Date.UTC(birth.year, birth.month - 1, birth.day)) / 86400000);
  return Object.fromEntries([['p', 23], ['e', 28], ['i', 33]].map(([key, period]) =>
    [key, Math.round(Math.sin(2 * Math.PI * elapsedDays / period) * 100)]));
}
