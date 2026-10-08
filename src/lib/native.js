// iOS アプリ（Capacitor）のネイティブ機能への窓口。Web では何もしない。
// ネイティブ判定は同期で行う: iOS では起動時にネイティブ側が window.Capacitor を注入済み。
// プラグインは動的 import にして、Web のバンドルの初期読み込みに乗せない。

export function isNativePlatform() {
  try {
    return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}
