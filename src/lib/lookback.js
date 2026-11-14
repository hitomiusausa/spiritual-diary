// 振り返り（月の暦）の計算。画面から切り離した純粋な関数だけを置く（D-44）。
// AI は呼ばない。端末の中の記録（history.js の配列・新しい順）だけを使う。
// 日付は端末の地域の暦で数える（一覧の「記入日」formatRecordTime と同じ日に見えるように）。

import { findMood } from "./moods";

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const TOP_MOOD_COUNT = 3;
// 記録の下に添える Kiri のひとことの長さの上限（長い文は途中で切らずに出さない）
const KIRI_LINE_MAX_CHARS = 60;

function pad2(value) {
  return String(value).padStart(2, "0");
}

// 記録の日付キー（例 "2026-11-14"）。読めない日時は ""。
export function recordDayKey(createdAt) {
  const time = Date.parse(createdAt ?? "");
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function dayKeyOf(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function monthOf(date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonth(a, b) {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

// 日付キーごとの記録（各日の中も新しい順のまま）。
export function groupRecordsByDay(history) {
  const byDay = new Map();
  for (const record of history ?? []) {
    const key = recordDayKey(record?.createdAt);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(record);
  }
  return byDay;
}

// その月の暦。週ごとの7マス（月の前後の空きは null）。
export function buildMonthGrid({ year, month }) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 移動できる月の範囲。いちばん古い記録の月から、今月まで（未来の記録があればその月まで）。
export function monthRange(history, now = new Date()) {
  const current = monthOf(now);
  let earliest = current;
  let latest = current;
  for (const record of history ?? []) {
    const time = Date.parse(record?.createdAt ?? "");
    if (!Number.isFinite(time)) continue;
    const month = monthOf(new Date(time));
    if (compareMonth(month, earliest) < 0) earliest = month;
    if (compareMonth(month, latest) > 0) latest = month;
  }
  return { earliest, latest };
}

// その月によく選んだ気分（多い順・同数なら新しく選んだ順）。気分の点数や良し悪しは付けない。
export function topMoodsOfMonth(byDay, { year, month }, limit = TOP_MOOD_COUNT) {
  const prefix = `${year}-${pad2(month)}-`;
  const counts = new Map();
  let order = 0;
  for (const [key, records] of byDay) {
    if (!key.startsWith(prefix)) continue;
    for (const record of records) {
      const value = record?.entry?.emoji;
      const mood = findMood(value);
      if (!mood) continue;
      const current = counts.get(value) ?? { value, label: mood.label, count: 0, firstSeen: order };
      current.count += 1;
      counts.set(value, current);
      order += 1;
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, limit)
    .map(({ value, label, count }) => ({ value, label, count }));
}

// 開いたときに選んでおく日。表示する月に記録があれば、その月でいちばん新しい記録の日。なければ null。
export function initialSelectedDay(byDay, { year, month }) {
  const prefix = `${year}-${pad2(month)}-`;
  let best = null;
  for (const key of byDay.keys()) {
    if (key.startsWith(prefix) && (best === null || key > best)) best = key;
  }
  return best;
}

// 記録に添える Kiri のひとこと（その時の読み解きの最初の一文）。
// 寄り添いモードの記録・長すぎる文・読み解きがない記録には出さない（null）。
export function kiriLineOf(record) {
  if (!record || record.result?.support) return null;
  const source = String(record.result?.innerMessage || record.result?.deepMessage || "").trim();
  if (!source) return null;
  const match = /^[^。！？!?\n]*[。！？!?]?/.exec(source);
  const line = (match?.[0] ?? "").trim();
  if (!line || line.length > KIRI_LINE_MAX_CHARS) return null;
  return line;
}

export function formatMonthJa({ year, month }) {
  return `${year}年${month}月`;
}

export function formatDayJa(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey || "");
  if (!match) return "";
  return `${Number(match[2])}月${Number(match[3])}日`;
}
