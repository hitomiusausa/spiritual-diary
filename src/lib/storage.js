// 端末保存のアクセス窓口。呼び出し側は同期の getItem/setItem/removeItem だけを使う（設計 Ruling 5）。
// - Web: window.localStorage をそのまま返す（従来どおり）。
// - iOS アプリ（Capacitor）: 起動時に Preferences（UserDefaults。iCloud バックアップの対象）から
//   メモリへ読み込み、書き込みはメモリを即時更新して Preferences へ write-through する（キーごとに直列化）。
//   初回だけ WKWebView の localStorage から一度きりの移行をする（D-09 第二段階）。
//
// 移行の優先順位（既存データを消さない・新しいものを古いもので上書きしない）:
//   1. 移行済みの印（MIGRATION_MARKER_KEY）が Preferences にあれば、localStorage は二度と読まない。
//   2. 印が無ければ、既知のキーごとに「Preferences に値がある → そのまま（localStorage では上書きしない）」
//      「Preferences に無く localStorage にある → Preferences へコピー」。
//   3. すべてのコピーが成功したときだけ印を置く。失敗したキーはメモリには載せ（画面には出る）、次回起動で再試行。
//   4. localStorage 側は消さない・書き換えない（戻し用の控えとして残る）。
//   5. initStorage の完了前に getStorage() で書いた値は保留し、完了後に上から適用する（最も新しい操作が勝つ）。

import { ANALYSIS_CACHE_STORAGE_KEY } from "./analysisCache";
import { LOCK_STORAGE_KEY } from "./appLock";
import { CHAT_HISTORY_STORAGE_KEY } from "./chatHistory";
import { CONSENT_STORAGE_KEY } from "./consent";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "./history";
import { isNativePlatform } from "./native";

// iOS で Preferences に永続化し、移行対象にするキー。同意（consent）を外すと起動のたびに同意画面が出る（台帳 L-2）。
// アプリのロック設定（lock）も端末ごとの設定。consent と同じくバックアップ JSON には含めない（backup.js は 3 キーだけを書き出す）。
export const NATIVE_STORAGE_KEYS = Object.freeze([
  HISTORY_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  CHAT_HISTORY_STORAGE_KEY,
  ANALYSIS_CACHE_STORAGE_KEY,
  CONSENT_STORAGE_KEY,
  LOCK_STORAGE_KEY,
]);
export const MIGRATION_MARKER_KEY = "spiritual-diary.migrated.v1";
const MIGRATION_VERSION = 1;

let resolved = null;
let initPromise = null;
// initStorage 完了前（ネイティブ）の書き込み。key → 値（null は削除）。挿入順に適用する。
let pendingWrites = new Map();
let pendingStorage = null;
// write-through のキーごとの直列チェーン。
let writeChains = new Map();

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

function readLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // localStorage へのアクセス自体が例外になる環境(プライベートブラウズ等)
  }
  return null;
}

function webStorage() {
  return readLocalStorage() ?? createMemoryStorage();
}

function warnStorage(message) {
  // 値（日記本文など）はログに出さない。
  console.warn(`[kiri-storage] ${message}`);
}

function enqueueWrite(key, operation) {
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(operation).catch(() => {
    warnStorage(`write-through failed for ${key}`);
  });
  writeChains.set(key, next);
  return next;
}

function createNativeStorage(initial, preferences) {
  const memory = createMemoryStorage(initial);
  return {
    getItem: (key) => memory.getItem(key),
    setItem: (key, value) => {
      const text = String(value);
      memory.setItem(key, text);
      enqueueWrite(key, () => preferences.set({ key, value: text }));
    },
    removeItem: (key) => {
      memory.removeItem(key);
      enqueueWrite(key, () => preferences.remove({ key }));
    },
  };
}

// ネイティブで initStorage 完了前に返す保存先。読み込みは保留中の書き込み → localStorage の順、
// 書き込みは保留して完了後に適用する（ここで localStorage に書くと、移行済みなら読まれず消えたように見えるため）。
function getPendingStorage() {
  if (!pendingStorage) {
    pendingStorage = {
      getItem: (key) => {
        if (pendingWrites.has(key)) return pendingWrites.get(key);
        try {
          return readLocalStorage()?.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        if (process.env.NODE_ENV !== "production") warnStorage(`setItem before initStorage: ${key}`);
        pendingWrites.delete(key);
        pendingWrites.set(key, String(value));
      },
      removeItem: (key) => {
        if (process.env.NODE_ENV !== "production") warnStorage(`removeItem before initStorage: ${key}`);
        pendingWrites.delete(key);
        pendingWrites.set(key, null);
      },
    };
  }
  return pendingStorage;
}

function applyPendingWrites(storage) {
  for (const [key, value] of pendingWrites) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
  pendingWrites = new Map();
}

async function loadFromPreferences(preferences, now) {
  const { keys = [] } = (await preferences.keys()) ?? {};
  const keySet = new Set([...NATIVE_STORAGE_KEYS, ...keys]);
  keySet.delete(MIGRATION_MARKER_KEY);

  const values = {};
  for (const key of keySet) {
    const { value } = await preferences.get({ key });
    if (value !== null && value !== undefined) values[key] = value;
  }

  const { value: marker } = await preferences.get({ key: MIGRATION_MARKER_KEY });
  if (marker) return values;

  // 一度きりの移行（印が無いときだけ）。localStorage は読むだけ。
  const local = readLocalStorage();
  const copiedKeys = [];
  let allCopied = true;
  for (const key of NATIVE_STORAGE_KEYS) {
    if (key in values) continue; // Preferences の値を優先し、古い localStorage で上書きしない
    let localValue = null;
    try {
      localValue = local?.getItem(key) ?? null;
    } catch {
      localValue = null;
    }
    if (localValue === null) continue;
    values[key] = localValue; // コピーに失敗しても画面には出す
    try {
      await preferences.set({ key, value: localValue });
      copiedKeys.push(key);
    } catch {
      allCopied = false;
      warnStorage(`migration copy failed for ${key}; will retry on next launch`);
    }
  }

  if (allCopied) {
    await preferences.set({
      key: MIGRATION_MARKER_KEY,
      value: JSON.stringify({ version: MIGRATION_VERSION, migratedAt: now.toISOString(), copiedKeys }),
    });
  }
  return values;
}

// Capacitor のプラグインは Proxy で、未知のプロパティ（`then` を含む）をすべてネイティブ呼び出しにする。
// async 関数から Proxy そのものを返す・await すると、Promise の解決が Preferences.then() を呼んで
// 「not implemented」で止まり、initStorage が永遠に終わらない（T13 で起動が白紙のまま止まった原因）。
// だから必ずオブジェクトに包んで受け渡す。
async function loadPreferencesPlugin() {
  const { Preferences } = await import("@capacitor/preferences");
  return { plugin: Preferences };
}

async function initNative({ preferences, now }) {
  try {
    const plugin = preferences ?? (await loadPreferencesPlugin()).plugin;
    const values = await loadFromPreferences(plugin, now);
    resolved = createNativeStorage(values, plugin);
  } catch {
    // Preferences が使えない（想定外）。この起動中は localStorage で動かし、画面は止めない。
    warnStorage("Preferences unavailable; falling back to localStorage for this launch");
    resolved = webStorage();
  }
  applyPendingWrites(resolved);
}

// 起動時に1回呼ぶ。Web では即解決する。reject しない。
// options はテスト用（native: 判定の上書き、preferences: Preferences の代役、now: 移行時刻）。
export function initStorage({ native, preferences, now = new Date() } = {}) {
  if (!initPromise) {
    const isNative = native ?? isNativePlatform();
    initPromise = isNative
      ? initNative({ preferences, now })
      : Promise.resolve().then(() => {
          resolved = webStorage();
        });
  }
  return initPromise;
}

// 同期取得。
// - initStorage 完了後: その保存先。
// - サーバー描画（window なし）: 毎回新しい空のメモリ（キャッシュしない。リクエストをまたいで共有しないため）。
// - ネイティブで完了前: 保留用の保存先（書き込みは完了後に適用）。
// - Web で完了前: localStorage（従来どおり）。
export function getStorage() {
  if (resolved) return resolved;
  if (typeof window === "undefined") return createMemoryStorage();
  if (isNativePlatform()) return getPendingStorage();
  resolved = webStorage();
  return resolved;
}

// 保留中の write-through がすべて終わるまで待つ（テスト・将来のアプリ終了時処理用）。
export async function flushStorageWrites() {
  for (;;) {
    const snapshot = [...writeChains.values()];
    await Promise.all(snapshot);
    const current = [...writeChains.values()];
    if (current.length === snapshot.length && current.every((chain, i) => chain === snapshot[i])) return;
  }
}

export function resetStorageForTests() {
  resolved = null;
  initPromise = null;
  pendingWrites = new Map();
  pendingStorage = null;
  writeChains = new Map();
}
