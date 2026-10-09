// アプリのロックの画面まわりの純粋関数（T-L3・T-L4）。React から切り離して vitest で確かめる。
// 文言の規律（設計 Ruling 16）: 画面に「暗号化」「パスワード」を出さない。

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
