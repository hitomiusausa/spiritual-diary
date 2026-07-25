const FORTUNE_FIELDS = ["deepMessage", "innerMessage", "actionAdvice"];
const MAX_FIELD_CHARS = 2400;

export function parseFortuneResponse(raw) {
  const text = String(raw ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const result = {};
  for (const field of FORTUNE_FIELDS) {
    if (typeof parsed[field] !== "string") return null;
    const value = parsed[field].trim().slice(0, MAX_FIELD_CHARS);
    if (!value) return null;
    result[field] = value;
  }

  return result;
}

export function validateFortuneText(fortune) {
  if (!fortune) return ["empty"];
  const warnings = [];
  const allText = FORTUNE_FIELDS.map((field) => fortune[field] ?? "").join("\n");

  if (/です|ます|ましょう|ございます|ください/.test(allText)) {
    warnings.push("敬語定型");
  }
  if (/頑張って|元気を出して|無理しないで|リフレッシュ|〜すべき|しましょう/.test(allText)) {
    warnings.push("励まし・断定定型");
  }
  if ((allText.match(/🐰|🌙/g) ?? []).length > 3) {
    warnings.push("絵文字過多");
  }

  return warnings;
}
