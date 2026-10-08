// Messages APIの応答から本文を取り出す。5.5世代は思考ブロックが先頭に来ることがあるため、
// content[0] を本文と決めつけない。拒否(refusal)や途中打ち切りは本文なしとして扱う。
export function extractReplyText(data) {
  if (!data || data.stop_reason === "refusal" || data.stop_reason === "max_tokens") return "";
  const blocks = Array.isArray(data.content) ? data.content : [];
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}
