// 気分の唯一の定義。値(value)は履歴・バックアップ・分析キャッシュとの互換のため絵文字のまま保つ。
// 画面には絵文字を出さず、UI側で icon 名を Lucide アイコンに対応させて表示する（D-17）。
// bonus はテーマ別スコアへの気分補正（route.js で 0.3 倍して加算される）。

export const MOODS = [
  { value: "😆", label: "うれしい", icon: "Laugh", bonus: 0.20 },
  { value: "🥰", label: "愛おしい", icon: "Heart", bonus: 0.18 },
  { value: "😌", label: "おだやか", icon: "Leaf", bonus: 0.12 },
  { value: "✨", label: "わくわく", icon: "Sparkles", bonus: 0.15 },
  { value: "🎵", label: "るんるん", icon: "Music", bonus: 0.16 },
  { value: "☀️", label: "元気", icon: "Sun", bonus: 0.08 },
  { value: "😴", label: "ねむい", icon: "Moon", bonus: -0.05 },
  { value: "😰", label: "不安", icon: "CloudRain", bonus: -0.12 },
  { value: "😢", label: "悲しい", icon: "Droplet", bonus: -0.18 },
  { value: "😤", label: "イライラ", icon: "Angry", bonus: -0.15 },
  { value: "🤔", label: "もやもや", icon: "CloudFog", bonus: -0.05 },
  { value: "😮", label: "ふつう", icon: "Meh", bonus: 0 },
];

export const DEFAULT_MOOD = "😌";

// 選択肢から外した旧い気分。過去の履歴・バックアップの表示と、旧値で届いた分析の補正に使う。
const LEGACY_MOODS = {
  "❤️": { label: "愛", icon: "Heart", bonus: 0.20 },
  "💓": { label: "ときめき", icon: "Heart", bonus: 0.20 },
  "😊": { label: "にこにこ", icon: "Smile", bonus: 0.12 },
  "🌈": { label: "希望", icon: "Star", bonus: 0.12 },
  "⭐": { label: "きらきら", icon: "Star", bonus: 0.12 },
  "😋": { label: "満足", icon: "Smile", bonus: 0.08 },
  "💚": { label: "のびのび", icon: "Heart", bonus: 0.08 },
  "💙": { label: "すっきり", icon: "Heart", bonus: 0.08 },
  "💤": { label: "つかれた", icon: "Moon", bonus: -0.05 },
  "😔": { label: "落ちこみ", icon: "Frown", bonus: -0.12 },
  "🌧️": { label: "ゆううつ", icon: "Cloud", bonus: -0.12 },
  "😭": { label: "号泣", icon: "Frown", bonus: -0.18 },
  "😠": { label: "怒り", icon: "Angry", bonus: -0.15 },
};

export function findMood(value) {
  return MOODS.find((mood) => mood.value === value) || LEGACY_MOODS[value] || null;
}

export function moodBonus(value) {
  return findMood(value)?.bonus ?? 0;
}

export function moodLabel(value) {
  return findMood(value)?.label ?? "";
}
