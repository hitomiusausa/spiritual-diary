// アプリのロックの OS 認証窓口（iOS のみ。設計 Ruling 3・4・9）。Web では何もしない（Web にロックは出さない。オーナー決定 Q2）。
// - @aparajita/capacitor-biometric-auth を動的 import（Web では読み込まない）。
// - Face ID／Touch ID が使えなければ OS が端末パスコードを求める（allowDeviceCredential: true）。独自 PIN は作らない。
// - 失敗は BiometryErrorType の code をそのまま返す（挙動と文言は appLock.js の describeAuthFailure）。想定外は "unknown"。
// - 理由文・エラー詳細はログに出さない。
// - Capacitor のプラグインは Proxy なので、async 関数から返したり await したりしない（storage.js の注意書き参照）。

import { isNativePlatform } from "./native";

const loadBiometricAuth = () => import("@aparajita/capacitor-biometric-auth");

export const LOCK_AUTH_OPTIONS = Object.freeze({
  reason: "Kiri のロックを解除します",
  allowDeviceCredential: true,
  iosFallbackTitle: "パスコードを使う",
  cancelTitle: "あとで",
});

// BiometryErrorType（10.0.0）の値。これ以外の code は "unknown" にまとめる。
const BIOMETRY_ERROR_CODES = new Set([
  "appCancel",
  "authenticationFailed",
  "invalidContext",
  "notInteractive",
  "passcodeNotSet",
  "systemCancel",
  "userCancel",
  "userFallback",
  "biometryLockout",
  "biometryNotAvailable",
  "biometryNotEnrolled",
  "noDeviceCredential",
]);

// BiometryType（数値 enum）→ UI 文言の出し分け用の名前。
const BIOMETRY_TYPE_NAMES = { 1: "touchId", 2: "faceId" };

const UNAVAILABLE = Object.freeze({
  available: false,
  biometryAvailable: false,
  deviceIsSecure: false,
  biometryType: "none",
});

// 設定に「アプリのロック」を出してよいか（Ruling 16: deviceIsSecure || isAvailable）。
// 戻り値: { available, biometryAvailable, deviceIsSecure, biometryType: "faceId" | "touchId" | "none" }
export async function checkLockAvailability({ native = isNativePlatform(), load = loadBiometricAuth } = {}) {
  if (!native) return { ...UNAVAILABLE };
  try {
    const { BiometricAuth } = await load();
    const result = await BiometricAuth.checkBiometry();
    const biometryAvailable = Boolean(result?.isAvailable);
    const deviceIsSecure = Boolean(result?.deviceIsSecure);
    return {
      available: biometryAvailable || deviceIsSecure,
      biometryAvailable,
      deviceIsSecure,
      biometryType: biometryAvailable ? (BIOMETRY_TYPE_NAMES[result?.biometryType] ?? "none") : "none",
    };
  } catch {
    return { ...UNAVAILABLE };
  }
}

let inFlight = null;

async function runAuthentication(options, load) {
  try {
    const { BiometricAuth } = await load();
    await BiometricAuth.authenticate(options);
    return { ok: true };
  } catch (error) {
    const code = typeof error?.code === "string" && BIOMETRY_ERROR_CODES.has(error.code) ? error.code : "unknown";
    return { ok: false, code };
  }
}

// OS の認証を 1 回求める。reject しない。重なった呼び出し（ロック画面の自動認証とボタン連打など）は同じ結果を共有する。
// 戻り値: { ok: true } | { ok: false, code }（code は BiometryErrorType の値・"unknown"・Web では "notNative"）
export function authenticateForLock({ reason, native = isNativePlatform(), load = loadBiometricAuth } = {}) {
  if (!native) return Promise.resolve({ ok: false, code: "notNative" });
  if (inFlight) return inFlight;
  const options = { ...LOCK_AUTH_OPTIONS, ...(reason ? { reason } : {}) };
  inFlight = runAuthentication(options, load).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetLockAuthForTests() {
  inFlight = null;
}
