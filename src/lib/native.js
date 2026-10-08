// iOS アプリ（Capacitor）のネイティブ機能への窓口（設計 Ruling 7）。Web では何もしない。
// ネイティブ判定は同期で行う: iOS では起動時にネイティブ側が window.Capacitor を注入済み。
// プラグインは動的 import にして、Web では読み込まない。失敗しても画面の動作は止めない。

export const NIGHT_COLOR = "#171522";
// 起動処理がどこかで止まっても、スプラッシュを出しっぱなしにしない上限（ミリ秒）。
export const SPLASH_FALLBACK_MS = 3000;

export function isNativePlatform() {
  try {
    return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

const loadHaptics = () => import("@capacitor/haptics");
const loadStatusBar = () => import("@capacitor/status-bar");
const loadSplashScreen = () => import("@capacitor/splash-screen");

// 触覚の割り当て: 「読み解く」=軽い衝撃 / 気分選択=選択 / 結果表示=成功通知 / 削除確定=中くらいの衝撃。
const HAPTIC_ACTIONS = {
  analyze: ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }),
  select: async ({ Haptics }) => {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  },
  success: ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }),
  delete: ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }),
};

export async function haptic(kind, { native = isNativePlatform(), load = loadHaptics } = {}) {
  const action = HAPTIC_ACTIONS[kind];
  if (!native || !action) return;
  try {
    await action(await load());
  } catch {
    // 触覚は飾り。失敗しても操作は続ける。
  }
}

// ステータスバーは明るい文字（Style.Dark）。背景色の指定は Android 向けで、iOS では無視されうる。
export async function applyStatusBar({ native = isNativePlatform(), load = loadStatusBar } = {}) {
  if (!native) return;
  let mod;
  try {
    mod = await load();
  } catch {
    return;
  }
  try {
    await mod.StatusBar.setStyle({ style: mod.Style.Dark });
  } catch {
    // 何もしない
  }
  try {
    await mod.StatusBar.setBackgroundColor({ color: NIGHT_COLOR });
  } catch {
    // iOS では未対応のことがある
  }
}

let splashHidden = false;

// 端末保存の復元が終わったら呼ぶ。何度呼んでも1回だけ隠す（失敗したら次の呼び出しで再試行）。
export async function hideSplash({ native = isNativePlatform(), load = loadSplashScreen } = {}) {
  if (!native || splashHidden) return;
  try {
    const { SplashScreen } = await load();
    await SplashScreen.hide();
    splashHidden = true;
  } catch {
    // 次の呼び出し（フォールバックのタイマー）で再試行する
  }
}

// 起動処理が終わらない・例外で抜けた場合の保険。戻り値で取り消せる。
export function armSplashFallback({ native = isNativePlatform(), load = loadSplashScreen, ms = SPLASH_FALLBACK_MS } = {}) {
  if (!native) return () => {};
  const timer = setTimeout(() => {
    hideSplash({ native, load });
  }, ms);
  return () => clearTimeout(timer);
}

export function resetNativeForTests() {
  splashHidden = false;
}
