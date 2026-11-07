// 同期保存窓口と永続化の完了/失敗通知（D-22、B-01/B-05）。本文・例外詳細は通知しない。
import { ANALYSIS_CACHE_STORAGE_KEY } from "./analysisCache";
import { LOCK_STORAGE_KEY } from "./appLock";
import { CHAT_HISTORY_STORAGE_KEY } from "./chatHistory";
import { CONSENT_STORAGE_KEY } from "./consent";
import { HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY } from "./history";
import { isNativePlatform } from "./native";

export const NATIVE_STORAGE_KEYS = Object.freeze([
  HISTORY_STORAGE_KEY, PROFILE_STORAGE_KEY, CHAT_HISTORY_STORAGE_KEY,
  ANALYSIS_CACHE_STORAGE_KEY, CONSENT_STORAGE_KEY, LOCK_STORAGE_KEY,
]);
export const MIGRATION_MARKER_KEY = "spiritual-diary.migrated.v1";
const MIGRATION_VERSION = 1;
let resolved = null;
let initPromise = null;
let pendingWrites = new Map();
let pendingStorage = null;
let writeChains = new Map();
let latestIntents = new Map();
let failures = new Map();
let pendingCounts = new Map();
let sequence = 0;
const listeners = new Set();
const initialStatus = () => ({ phase: "idle", mode: "unknown", pendingKeys: [], failedKeys: [] });
let status = initialStatus();

function publish(patch = {}) {
  const next = { ...status, ...patch, pendingKeys: [...pendingCounts.keys()], failedKeys: [...failures.keys()] };
  if (JSON.stringify(next) === JSON.stringify(status)) return;
  status = next;
  for (const listener of listeners) {
    try {
      const result = listener(status);
      if (result && typeof result.then === "function") Promise.resolve(result).catch(() => {});
    } catch { /* A subscriber must not reject a write chain. */ }
  }
}
export function getStorageStatus() { return status; }
export function subscribeStorageStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export class StorageWriteError extends Error {
  constructor(keys = []) {
    super("device storage write failed");
    this.name = "StorageWriteError";
    this.code = "storage_write_failed";
    this.failedKeys = [...keys];
  }
}
export class StorageInitError extends Error {
  constructor() {
    super("device storage could not be read");
    this.name = "StorageInitError";
    this.code = "storage_init_failed";
  }
}
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}
function readLocalStorage() {
  try { return typeof window !== "undefined" ? window.localStorage ?? null : null; }
  catch { return null; }
}
function rememberIntent(key, operation, value) {
  const intent = { sequence: ++sequence, operation, value };
  latestIntents.set(key, intent);
  return intent;
}
function completeIntent(key, intent, failed) {
  // Delayed old writes cannot replace the state of a later user operation.
  if (latestIntents.get(key) !== intent) return;
  if (failed) failures.set(key, intent);
  else failures.delete(key);
}
function enqueueWrite(key, operation, value) {
  const intent = rememberIntent(key, operation, value);
  pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
  publish();
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(operation).then(
    (result) => completeIntent(key, intent, result === false),
    () => completeIntent(key, intent, true),
  ).finally(() => {
    const count = (pendingCounts.get(key) ?? 1) - 1;
    if (count > 0) pendingCounts.set(key, count);
    else pendingCounts.delete(key);
    publish();
  });
  // No unhandled rejection. flush exposes the outcome of the latest intent.
  writeChains.set(key, next);
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
function createWebStorage() {
  const local = readLocalStorage();
  const memory = createMemoryStorage();
  const backend = local ?? memory;
  const overlay = new Map();
  const run = (key, value) => {
    // Failed synchronous Web writes need the same rescue/export view as native
    // writes. Keep the desired value separately; never erase the durable original.
    overlay.set(key, value);
    const operation = (recovering = false) => {
      // A recovered backend may contain unseen original records. Only an explicit
      // retry, after the preflight below, may write to it from a memory session.
      const target = local ?? (recovering ? readLocalStorage() : null);
      if (!target) return false;
      if (value === null) target.removeItem(key);
      else target.setItem(key, value);
      if (local && overlay.has(key) && overlay.get(key) === value) overlay.delete(key);
    };
    const intent = rememberIntent(key, operation, value);
    try {
      const result = operation();
      completeIntent(key, intent, result === false);
      publish();
    } catch {
      completeIntent(key, intent, true);
      publish();
      throw new StorageWriteError([key]);
    }
  };
  publish({ mode: local ? "web" : "memory" });
  return {
    getItem: (key) => overlay.has(key) ? overlay.get(key) : backend.getItem(key),
    setItem: (key, value) => {
      const text = String(value);
      run(key, text);
    },
    removeItem: (key) => run(key, null),
  };
}
function getPendingStorage() {
  if (!pendingStorage) pendingStorage = {
    // An unread native store is not permission to revive its stale migration source.
    getItem: (key) => pendingWrites.get(key) ?? null,
    setItem: (key, value) => { pendingWrites.delete(key); pendingWrites.set(key, String(value)); },
    removeItem: (key) => { pendingWrites.delete(key); pendingWrites.set(key, null); },
  };
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
  const local = readLocalStorage();
  const copiedKeys = [];
  for (const key of NATIVE_STORAGE_KEYS) {
    if (key in values) continue;
    // A read/copy failure stops hydration. Both original copies remain recoverable.
    const localValue = local?.getItem(key) ?? null;
    if (localValue === null) continue;
    await preferences.set({ key, value: localValue });
    values[key] = localValue;
    copiedKeys.push(key);
  }
  await preferences.set({
    key: MIGRATION_MARKER_KEY,
    value: JSON.stringify({ version: MIGRATION_VERSION, migratedAt: now.toISOString(), copiedKeys }),
  });
  return values;
}
// Wrap the Capacitor proxy: resolving it directly would call its implicit then().
async function loadPreferencesPlugin() {
  const { Preferences } = await import("@capacitor/preferences");
  return { plugin: Preferences };
}
export function initStorage({ native, preferences, now = new Date() } = {}) {
  if (initPromise) return initPromise;
  publish({ phase: "initializing" });
  const isNative = native ?? isNativePlatform();
  initPromise = (async () => {
    if (isNative) {
      const plugin = preferences ?? (await loadPreferencesPlugin()).plugin;
      const values = await loadFromPreferences(plugin, now);
      resolved = createNativeStorage(values, plugin);
      publish({ mode: "native" });
      applyPendingWrites(resolved);
    } else resolved = createWebStorage();
    publish({ phase: "ready" });
  })().catch(() => {
    resolved = null;
    initPromise = null;
    publish({ phase: "error", mode: isNative ? "native" : "unknown" });
    throw new StorageInitError();
  });
  return initPromise;
}
export function getStorage() {
  if (resolved) return resolved;
  if (typeof window === "undefined") return createMemoryStorage();
  if (isNativePlatform() || status.phase === "error") return getPendingStorage();
  resolved = createWebStorage();
  return resolved;
}
export async function flushStorageWrites({ keys } = {}) {
  const selected = keys ? new Set(keys) : null;
  const chains = () => [...writeChains].filter(([key]) => !selected || selected.has(key)).map(([, chain]) => chain);
  for (;;) {
    const snapshot = chains();
    await Promise.all(snapshot);
    const current = chains();
    if (current.length === snapshot.length && current.every((chain, i) => chain === snapshot[i])) break;
  }
  const failedKeys = [...failures.keys()].filter((key) => !selected || selected.has(key));
  if (failedKeys.length) throw new StorageWriteError(failedKeys);
}
export async function retryStorageWrites() {
  if (status.mode === "memory") {
    const local = readLocalStorage();
    if (!local) throw new StorageWriteError(failures.keys());
    const conflicts = [];
    try {
      for (const [key, intent] of failures) {
        const original = local.getItem(key);
        if (original !== null && original !== intent.value) conflicts.push(key);
      }
    } catch { throw new StorageWriteError(failures.keys()); }
    if (conflicts.length) {
      const error = new StorageWriteError(conflicts);
      error.code = "storage_recovery_conflict";
      error.conflictKeys = conflicts;
      throw error;
    }
  }
  for (const [key, intent] of [...failures]) {
    if (latestIntents.get(key) === intent) enqueueWrite(key, () => intent.operation(true), intent.value);
  }
  await flushStorageWrites();
  if (status.mode === "memory" && readLocalStorage()) {
    resolved = createWebStorage();
    publish({ phase: "ready" });
  }
}
export function resetStorageForTests() {
  resolved = null; initPromise = null; pendingWrites = new Map(); pendingStorage = null;
  writeChains = new Map(); latestIntents = new Map(); failures = new Map(); pendingCounts = new Map();
  sequence = 0; status = initialStatus(); listeners.clear();
}
