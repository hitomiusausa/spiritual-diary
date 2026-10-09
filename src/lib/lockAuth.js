// アプリのロックの OS 認証窓口（iOS のみ。設計 Ruling 3・4・9）。Web では何もしない（Web にロックは出さない。オーナー決定 Q2）。
// - @aparajita/capacitor-biometric-auth を動的 import（Web では読み込まない）。
// - Face ID／Touch ID が使えなければ OS が端末パスコードを求める（allowDeviceCredential: true）。独自 PIN は作らない。
// - 失敗は BiometryErrorType の code をそのまま返す（挙動と文言は appLock.js の describeAuthFailure）。想定外は "unknown"。
// - プラグインが読み込めない・ネイティブ側に無い（cap sync 漏れ・登録失敗。Capacitor の UNIMPLEMENTED/UNAVAILABLE）は
//   "pluginUnavailable" として分ける。これはフェイルオープンにする（自分の記録に入れなくなる事故を防ぐ。監査 P1-3・D-09）。
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

// Capacitor がプラグイン未登録・未実装のときに返す code。
const PLUGIN_MISSING_CODES = new Set(["UNIMPLEMENTED", "UNAVAILABLE"]);
export const PLUGIN_UNAVAILABLE = "pluginUnavailable";

// BiometryType（数値 enum）→ UI 文言の出し分け用の名前。
const BIOMETRY_TYPE_NAMES = { 1: "touchId", 2: "faceId" };

const UNAVAILABLE = Object.freeze({
  available: false,
  biometryAvailable: false,
  deviceIsSecure: false,
  biometryType: "none",
  reason: PLUGIN_UNAVAILABLE,
});

// 設定に「アプリのロック」を出してよいか（Ruling 16: deviceIsSecure || isAvailable）。
// 戻り値: { available, biometryAvailable, deviceIsSecure, biometryType: "faceId" | "touchId" | "none",
//          reason: null | "notNative" | "pluginUnavailable" | "passcodeNotSet" }
export async function checkLockAvailability({ native = isNativePlatform(), load = loadBiometricAuth } = {}) {
  if (!native) return { ...UNAVAILABLE, reason: "notNative" };
  try {
    const { BiometricAuth } = await load();
    const result = await BiometricAuth.checkBiometry();
    const biometryAvailable = Boolean(result?.isAvailable);
    const deviceIsSecure = Boolean(result?.deviceIsSecure);
    const available = biometryAvailable || deviceIsSecure;
    return {
      available,
      biometryAvailable,
      deviceIsSecure,
      biometryType: biometryAvailable ? (BIOMETRY_TYPE_NAMES[result?.biometryType] ?? "none") : "none",
      reason: available ? null : "passcodeNotSet",
    };
  } catch {
    return { ...UNAVAILABLE };
  }
}

let inFlight = null;

function codeOf(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (BIOMETRY_ERROR_CODES.has(code)) return code;
  if (PLUGIN_MISSING_CODES.has(code)) return PLUGIN_UNAVAILABLE;
  return "unknown";
}

async function runAuthentication(options, load) {
  let BiometricAuth;
  try {
    ({ BiometricAuth } = await load());
  } catch {
    return { ok: false, code: PLUGIN_UNAVAILABLE };
  }
  try {
    await BiometricAuth.authenticate(options);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: codeOf(error) };
  }
}

// OS の認証を 1 回求める。reject しない。重なった呼び出し（ロック画面の自動認証とボタン連打など）は同じ結果を共有する。
// 戻り値: { ok: true } | { ok: false, code }（code は BiometryErrorType の値・"pluginUnavailable"・"unknown"・Web では "notNative"）
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
