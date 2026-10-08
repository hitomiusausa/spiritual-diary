// 端末保存のアクセス窓口。呼び出し側は同期の getItem/setItem/removeItem だけを使う。
// Web は window.localStorage をそのまま返す。ネイティブ(Preferences)分岐は Phase 2 の T10 で足す。

let resolved = null;
let initPromise = null;

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function webStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // localStorage へのアクセス自体が例外になる環境(プライベートブラウズ等)
  }
  return createMemoryStorage();
}

// 起動時に1回呼ぶ。Web では即解決する。
export function initStorage() {
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      resolved = webStorage();
    });
  }
  return initPromise;
}

// 同期取得。initStorage 前に呼ばれた場合は Web の保存先へフォールバックする。
export function getStorage() {
  if (!resolved) resolved = webStorage();
  return resolved;
}

export function resetStorageForTests() {
  resolved = null;
  initPromise = null;
}
