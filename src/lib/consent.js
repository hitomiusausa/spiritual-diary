// 第三者AI(Anthropic社のClaude)への送信に対する同意。App Store審査ガイドライン5.1.2(i)対応。
// 端末ごとの同意なのでバックアップには含めない。文言を変えて再同意が必要になったら CONSENT_VERSION を上げる。
export const CONSENT_VERSION = 3; // v3: 送信先が米国の会社であることを明記（D-45）
export const CONSENT_STORAGE_KEY = "spiritual-diary.consent.v1";
let revokedThisSession = false;

export function hasConsent(storage) {
  if (revokedThisSession) return false;
  try {
    const raw = storage?.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed) && parsed.version === CONSENT_VERSION
      && typeof parsed.acceptedAt === "string" && Number.isFinite(Date.parse(parsed.acceptedAt));
  } catch {
    return false;
  }
}

export function recordConsent(storage, now = new Date()) {
  storage?.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: CONSENT_VERSION, acceptedAt: now.toISOString() }),
  );
  revokedThisSession = false;
}

export function revokeConsent(storage) {
  // 保存先の削除に失敗しても、この起動中の送信許可は直ちに取り消す。
  revokedThisSession = true;
  storage?.removeItem(CONSENT_STORAGE_KEY);
}

export function resetConsentSessionForTests() {
  revokedThisSession = false;
}
