// 同意画面の「プライバシーポリシーを読む」で /privacy へ移る間だけ、書きかけの記録を退避する。
// 保存先は呼び出し側が渡す（画面では sessionStorage: タブを閉じれば消え、サーバーへは送らない）。
// 戻ってきて取り出したら消す。古いものは捨てる。
export const ENTRY_DRAFT_KEY = "spiritual-diary.entryDraft.v1";
export const ENTRY_DRAFT_TTL_MS = 60 * 60 * 1000; // 1時間
const ENTRY_FIELDS = ["emoji", "mood", "type", "event", "intuition"];

export function saveEntryDraft(storage, entry, now = new Date()) {
  if (!storage || !(entry?.event || entry?.intuition)) return;
  try {
    storage.setItem(ENTRY_DRAFT_KEY, JSON.stringify({ savedAt: now.getTime(), entry }));
  } catch {
    // 保存できない環境では退避しない（遷移は止めない）
  }
}

export function takeEntryDraft(storage, now = new Date()) {
  if (!storage) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(storage.getItem(ENTRY_DRAFT_KEY) || "null");
    storage.removeItem(ENTRY_DRAFT_KEY);
  } catch {
    try {
      storage.removeItem(ENTRY_DRAFT_KEY);
    } catch {
      // 何もしない
    }
    return null;
  }
  if (!parsed || typeof parsed.entry !== "object" || parsed.entry === null) return null;
  if (!(now.getTime() - Number(parsed.savedAt) <= ENTRY_DRAFT_TTL_MS)) return null;
  const draft = {};
  for (const field of ENTRY_FIELDS) {
    if (typeof parsed.entry[field] === "string") draft[field] = parsed.entry[field];
  }
  return draft.event || draft.intuition ? draft : null;
}

// 画面から使う保存先。使えない環境（プライベートブラウズ等）では null（退避しないだけ）。
export function browserSessionStorage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
