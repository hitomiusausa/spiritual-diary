// アプリが背景へ回った／前景へ戻ったことの通知（自動ロック用。設計 Ruling 7）。
// - iOS: @capacitor/app の pause（didEnterBackground）/ resume（willEnterForeground）。
//   appStateChange（resignActive）は使わない: コントロールセンター・通知・Face ID 自身の画面で誤ってロックするため。
// - Web: document の visibilitychange（Web にロックは出さないが、窓口は共通にしておく）。
// 解除関数を同期で返す。ネイティブのリスナー登録は非同期なので、登録前に解除されたら登録後すぐに外す。

import { isNativePlatform } from "./native";

const loadApp = () => import("@capacitor/app");

function defaultDocument() {
  return typeof document === "undefined" ? null : document;
}

// subscribeAppVisibility({ onHide(nowMs), onShow(nowMs) }, options) → unsubscribe()
export function subscribeAppVisibility(
  { onHide, onShow } = {},
  { native = isNativePlatform(), load = loadApp, doc = defaultDocument(), now = Date.now } = {},
) {
  const hide = () => onHide?.(now());
  const show = () => onShow?.(now());

  if (!native) {
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
    for (const handle of handles.splice(0)) removeHandle(handle);
  };
}
