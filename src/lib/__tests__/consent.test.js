import { describe, expect, it } from "vitest";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, hasConsent, recordConsent, revokeConsent } from "@/lib/consent";
import { createMemoryStorage } from "@/lib/storage";

describe("consent", () => {
  it("is false when nothing is recorded", () => {
    expect(hasConsent(createMemoryStorage())).toBe(false);
  });

  it("is false for a null storage", () => {
    expect(hasConsent(null)).toBe(false);
  });

  it("is true after recording and stores version and timestamp", () => {
    const s = createMemoryStorage();
    const now = new Date("2026-10-09T01:00:00Z");
    recordConsent(s, now);
    expect(hasConsent(s)).toBe(true);
    expect(JSON.parse(s.getItem(CONSENT_STORAGE_KEY))).toEqual({
      version: CONSENT_VERSION,
      acceptedAt: "2026-10-09T01:00:00.000Z",
    });
  });

  it("requires consent again when the stored version is older", () => {
    const s = createMemoryStorage({
      [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION - 1, acceptedAt: "2026-01-01T00:00:00Z" }),
    });
    expect(hasConsent(s)).toBe(false);
  });

  it("is false for corrupt data", () => {
    expect(hasConsent(createMemoryStorage({ [CONSENT_STORAGE_KEY]: "{oops" }))).toBe(false);
    expect(hasConsent(createMemoryStorage({ [CONSENT_STORAGE_KEY]: "null" }))).toBe(false);
  });

  it("is false after revoking", () => {
    const s = createMemoryStorage();
    recordConsent(s);
    revokeConsent(s);
    expect(hasConsent(s)).toBe(false);
    expect(s.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("is not part of the backup keys", async () => {
    const { buildBackup } = await import("@/lib/backup");
    const s = createMemoryStorage();
    recordConsent(s);
    expect(JSON.stringify(buildBackup(s))).not.toContain("consent");
  });

  it("細工したバックアップに同意キーが入っていても、取り込みで同意は立たない", async () => {
    const { applyBackup, parseBackup, BACKUP_APP_NAME, BACKUP_SCHEMA_VERSION } = await import("@/lib/backup");
    const consentRecord = { version: CONSENT_VERSION, acceptedAt: "2026-10-09T00:00:00.000Z" };
    const crafted = JSON.stringify({
      app: BACKUP_APP_NAME,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      profile: { birthDate: "1990-01-01", nickname: "x", consent: consentRecord },
      history: [],
      chat: [],
      consent: consentRecord,
      [CONSENT_STORAGE_KEY]: JSON.stringify(consentRecord),
    });
    const s = createMemoryStorage();
    applyBackup(s, parseBackup(crafted));
    expect(hasConsent(s)).toBe(false);
    expect(s.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });
});
