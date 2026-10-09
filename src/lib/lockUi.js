// アプリのロックの画面まわりの純粋関数（T-L3・T-L4）。React から切り離して vitest で確かめる。
// 文言の規律（設計 Ruling 16）: 画面に「暗号化」「パスワード」を出さない。

import { AUTO_LOCK_CHOICES } from "./appLock";

const METHODS = {
  faceId: { kind: "faceId", label: "Face IDでひらく" },
  touchId: { kind: "touchId", label: "Touch IDでひらく" },
};
const PASSCODE_METHOD = { kind: "passcode", label: "パスコードでひらく" };

// checkLockAvailability().biometryType（"faceId" | "touchId" | "none"）→ ボタンの文言とアイコンの種類。
export function unlockMethod(biometryType) {
  return { ...(METHODS[biometryType] ?? PASSCODE_METHOD) };
}

// 「認証できませんでした。もう一度お試しください。」→ 1 行目と 2 行目（見た目 A の 2 段組み）。
function splitMessage(text) {
  if (!text) return { message: null, detail: null };
  const index = text.indexOf("。");
  if (index === -1 || index === text.length - 1) return { message: text, detail: null };
  return { message: text.slice(0, index + 1), detail: text.slice(index + 1) };
}

// reduceLock の状態 → ロック画面（A 静かな扉）の表示。
// idle: 錠前＋「ロックされています」＋ボタン 1 つ / failed: 失敗文言＋「もう一度」＋「端末のパスコードでひらく」。
export function lockScreenView(state, biometryType) {
  const method = unlockMethod(biometryType);
  const failed = Boolean(state?.message) && !state?.failOpen;
  // 失敗文言は Face ID 前提で書かれているので、Touch ID の端末では名前を差し替える。
  const text = failed && method.kind === "touchId" ? state.message.replaceAll("Face ID", "Touch ID") : state?.message;
  const { message, detail } = failed ? splitMessage(text) : { message: null, detail: null };
  return {
    mode: failed ? "failed" : "idle",
    busy: Boolean(state?.authenticating),
    primaryLabel: failed ? "もう一度" : method.label,
    method: method.kind,
    showPasscode: failed && method.kind !== "passcode",
    message,
    detail,
  };
}

// ---- 設定・再認証の結線（T-L4）----


const AUTO_LOCK_LABELS = { 0: "すぐに", 1: "1分", 5: "5分", 15: "15分" };
export const AUTO_LOCK_OPTIONS = Object.freeze(
  AUTO_LOCK_CHOICES.map((value) => Object.freeze({ value, label: AUTO_LOCK_LABELS[value] })),
);

// ロック画面が出てから自動で OS 認証を呼ぶまでの待ち（復帰直後はアプリがまだ前面になりきっておらず、
// すぐ呼ぶと notInteractive で失敗するため）。
export const AUTO_AUTH_DELAY_MS = 400;

// 再認証に通ってから、次の画面（共有シート）を出すまでの待ち。OS の認証画面が閉じきる前に共有シートを出すと
// 表示に失敗し、プラグインが「共有中」のまま固まる（T-L5 シミュレータで再現: Can't share while sharing is in progress）。
export const REAUTH_SETTLE_MS = 700;

export const LOCK_SETTINGS_NOTE = "他の人に記録を見られないようにする機能です。端末の中の保存データは、これまでどおりのままです。";

// OS の認証画面（Touch ID・パスコード）に出る理由文。Face ID は Info.plist の NSFaceIDUsageDescription が出る。
export const LOCK_AUTH_REASONS = Object.freeze({
  unlock: "Kiri のロックを解除します",
  enable: "アプリのロックをオンにするために確認します",
  disable: "アプリのロックをオフにするために確認します",
  export: "バックアップを書き出すために確認します",
});

const RETRY_NOTICE = "確認できませんでした。もう一度お試しください。";
const NEEDS_PASSCODE_NOTICE = "端末のパスコードを設定すると使えます。";
const UNAVAILABLE_NOTICE = "いまはこの端末でアプリのロックを使えません。";
const CANCEL_CODES = new Set(["userCancel", "appCancel", "systemCancel"]);
const NO_PASSCODE_CODES = new Set(["passcodeNotSet", "noDeviceCredential"]);
// 認証プラグインが読み込めない・ネイティブ側に無い（lockAuth.js。監査 P1-3）。
const PLUGIN_UNAVAILABLE_CODE = "pluginUnavailable";
// 自動の 1 回目は、キャンセルや「まだ前面でない」で失敗しても黙ってボタン待ちにする。
const SILENT_AUTO_CODES = new Set([...CANCEL_CODES, "notInteractive"]);

// 設定に「アプリのロック」を出すか（Ruling 16）。Web では決して出さない（オーナー決定 Q2）。
// ロックがオンのまま端末のパスコードが外された場合も、オフにできるよう項目は残す。
export function shouldOfferLockSettings({ native, availability, enabled }) {
  if (!native) return false;
  return Boolean(availability?.available) || enabled === true;
}

// 切り替え画面の目隠しは、ロックがオン かつ「切り替え画面で記録を隠す」がオンのときだけ（Ruling 5）。
export function privacyScreenWanted(settings) {
  return Boolean(settings?.enabled && settings?.hideInSwitcher);
}

export function lockToggleDescription(biometryType) {
  if (biometryType === "faceId") return "Face ID・端末のパスコードで、アプリを開くときに確認します。";
  if (biometryType === "touchId") return "Touch ID・端末のパスコードで、アプリを開くときに確認します。";
  return "端末のパスコードで、アプリを開くときに確認します。";
}

export function autoAuthFailEvent(code) {
  return { type: "authFail", code: SILENT_AUTO_CODES.has(code) ? "userCancel" : code };
}

// 再認証が要る操作（バックアップの書き出し・ロックのオフ。Ruling 11）は、ロックがオンのときだけ確認する。
export function needsReauth(lockState) {
  return lockState?.enabled === true;
}

// 書き出し・オフの前の再認証の結果 → 続けるか。
// 端末のパスコードが無い端末ではロック自体が働かないので、フェイルオープン（Ruling 9）。
export function reauthOutcome(result) {
  if (result?.ok) return { proceed: true, failOpen: false, notice: null };
  const code = result?.code;
  if (NO_PASSCODE_CODES.has(code) || code === PLUGIN_UNAVAILABLE_CODE) return { proceed: true, failOpen: true, notice: null };
  if (CANCEL_CODES.has(code)) return { proceed: false, failOpen: false, notice: null };
  return { proceed: false, failOpen: false, notice: RETRY_NOTICE };
}

// ロックをオンにする前の確認の結果 → オンにするか。パスコードの無い端末ではオンにできない（Ruling 3）。
export function enableOutcome(result) {
  if (result?.ok) return { enable: true, notice: null };
  const code = result?.code;
  if (NO_PASSCODE_CODES.has(code)) return { enable: false, notice: NEEDS_PASSCODE_NOTICE };
  if (code === PLUGIN_UNAVAILABLE_CODE) return { enable: false, notice: UNAVAILABLE_NOTICE };
  if (CANCEL_CODES.has(code)) return { enable: false, notice: null };
  return { enable: false, notice: RETRY_NOTICE };
}
