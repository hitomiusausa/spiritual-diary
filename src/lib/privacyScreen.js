// アプリ切り替え画面の目隠し（iOS のみ。設計 Ruling 5）。ロックがオン かつ「切り替え画面で記録を隠す」がオンのときだけ有効にする。
// Web では何もしない。@capacitor/privacy-screen を動的 import する。失敗しても画面の動作は止めない。

import { isNativePlatform } from "./native";

const loadPrivacyScreen = () => import("@capacitor/privacy-screen");

export const PRIVACY_SCREEN_CONFIG = Object.freeze({ ios: Object.freeze({ blurEffect: "dark" }) });

// 戻り値: 切り替えに成功したら true（Web・失敗時は false）。reject しない。
export async function setPrivacyScreen(enabled, { native = isNativePlatform(), load = loadPrivacyScreen } = {}) {
  if (!native) return false;
  try {
    const { PrivacyScreen } = await load();
    const result = enabled
      ? await PrivacyScreen.enable({ ios: { ...PRIVACY_SCREEN_CONFIG.ios } })
      : await PrivacyScreen.disable();
    return result?.success !== false;
  } catch {
    return false;
  }
}
