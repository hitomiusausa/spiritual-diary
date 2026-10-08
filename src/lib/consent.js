// 第三者AI(Anthropic社のClaude)への送信に対する同意。App Store審査ガイドライン5.1.2(i)対応。
// 端末ごとの同意なのでバックアップには含めない。文言を変えて再同意が必要になったら CONSENT_VERSION を上げる。
export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "spiritual-diary.consent.v1";

export function hasConsent(storage) {
  try {
    const raw = storage?.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed) && Number(parsed.version) >= CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function recordConsent(storage, now = new Date()) {
  storage?.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: CONSENT_VERSION, acceptedAt: now.toISOString() }),
  );
}

export function revokeConsent(storage) {
  storage?.removeItem(CONSENT_STORAGE_KEY);
}
