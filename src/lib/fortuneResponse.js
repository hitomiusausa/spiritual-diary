const FORTUNE_FIELDS = ["deepMessage", "innerMessage", "actionAdvice"];
const MAX_FIELD_CHARS = 2400;
const HIGH_SURROGATE_AT_END = /[\ud800-\udbff]$/;

// 文字列の中に生のまま入った改行・タブを JSON のエスケープに直す（L-03）。文字列の外は変えない。
function escapeRawControlsInStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += char;
    } else if (char === "\\") {
      escaped = true;
      out += char;
    } else if (char === '"') {
      inString = false;
      out += char;
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      out += "\\n";
    } else if (char === "\n") {
      out += "\\n";
    } else if (char === "\t") {
      out += "\\t";
    } else {
      out += char;
    }
  }
  return out;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// モデルの返事から JSON オブジェクトを取り出す。前後の一言（「はい、こちらです」など）やコードブロックは捨て、
// 最初の { から最後の } までを読む。だめなら文字列の中の生の改行を直してもう一度だけ読む。
function parseObject(raw) {
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  const candidate = text.slice(start, end + 1);
  return tryParse(candidate) ?? tryParse(escapeRawControlsInStrings(candidate));
}

export function parseFortuneResponse(raw) {
  const parsed = parseObject(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const result = {};
  for (const field of FORTUNE_FIELDS) {
    if (typeof parsed[field] !== "string") return null;
    // サロゲートペアの途中で切らない（L-05 と同じ理由）。
    const value = parsed[field].trim().slice(0, MAX_FIELD_CHARS).replace(HIGH_SURROGATE_AT_END, "");
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
  if (/\p{Extended_Pictographic}/u.test(allText)) {
    warnings.push("絵文字");
  }

  return warnings;
}
