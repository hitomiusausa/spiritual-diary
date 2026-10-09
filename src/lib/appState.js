// アプリが背景へ回った／前景へ戻ったことの通知（自動ロック用。設計 Ruling 7）。
// - iOS: @capacitor/app の pause（didEnterBackground）/ resume（willEnterForeground）。
//   appStateChange（resignActive）は使わない: コントロールセンター・通知・Face ID 自身の画面で誤ってロックするため。
// - Web: document の visibilitychange（Web にロックは出さないが、窓口は共通にしておく）。
// 解除関数を同期で返す。ネイティブのリスナー登録は非同期なので、登録前に解除されたら登録後すぐに外す。
// - pause が遅れて届く場合（監査 P1-2 補足）: WKWebView の JS は背景で止められ、pause が復帰時にまとめて届くことがある。
//   pause に時刻は付かない（@capacitor/app 8.1.1 は data: nil）ので、前景で回す心拍の最後の時刻を「背景に回った時刻」
//   とみなす（実際より早い＝ロックする側に倒れる）。心拍 2 回分より新しければ、届いた時刻をそのまま使う。

import { isNativePlatform } from "./native";

const loadApp = () => import("@capacitor/app");

// 前景で動いている印を残す間隔。背景に回った時刻の誤差はこの値以内（ロックが早まる側）。
export const HEARTBEAT_MS = 5_000;

const defaultTimers = () => ({
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle),
});

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

// subscribeAppVisibility({ onHide(nowMs), onShow(nowMs) }, options) → unsubscribe()
export function subscribeAppVisibility(
  { onHide, onShow } = {},
  { native = isNativePlatform(), load = loadApp, doc = defaultDocument(), now = Date.now, timers = defaultTimers() } = {},
) {
  if (!native) {
    const hide = () => onHide?.(now());
    const show = () => onShow?.(now());
    if (!doc) return () => {};
    const listener = () => {
      if (doc.visibilityState === "hidden") hide();
      else if (doc.visibilityState === "visible") show();
    };
    doc.addEventListener("visibilitychange", listener);
    return () => doc.removeEventListener("visibilitychange", listener);
  }

  let active = true;
  const handles = [];
  let lastAlive = now();
  const heartbeat = timers.setInterval(() => {
    lastAlive = now();
  }, HEARTBEAT_MS);
  const hide = () => {
    const current = now();
    onHide?.(current - lastAlive > 2 * HEARTBEAT_MS ? lastAlive : current);
  };
  const show = () => {
    const current = now();
    lastAlive = current;
    onShow?.(current);
  };
  const removeHandle = (handle) => {
    Promise.resolve()
      .then(() => handle?.remove?.())
      .catch(() => {});
  };

  (async () => {
    try {
      const { App } = await load();
      for (const [event, callback] of [
        ["pause", hide],
        ["resume", show],
      ]) {
        const handle = await App.addListener(event, () => {
          if (active) callback();
        });
        if (active) handles.push(handle);
        else removeHandle(handle);
      }
    } catch {
      // プラグインが無い（想定外）。自動ロックは効かないが、起動時のロックは効くので画面は止めない。
    }
  })();

  return () => {
    if (!active) return;
    active = false;
    timers.clearInterval(heartbeat);
    for (const handle of handles.splice(0)) removeHandle(handle);
  };
}
