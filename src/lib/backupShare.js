// iOSの共有用Cacheは操作ごとの領域へ置く。共有中のファイルを別の操作から消さない。
const SHARE_CANCEL_PATTERN = /cancel/i;
export const BACKUP_CACHE_DIRECTORY = "kiri-backup-export-v1";
const LEGACY_FILE = /^kiri-(?:recovery-)?backup-\d{4}-\d{2}-\d{2}\.json$/;
const OPERATION_DIRECTORY = /^[a-f0-9]{32}$/;
let exportInFlight = false;
let cleanupInFlight = false;
const activePaths = new Set();

export function isShareCancel(error) {
  return Boolean(error) && SHARE_CANCEL_PATTERN.test(String(error.message ?? ""));
}
export const isBackupExportInProgress = () => exportInFlight;

async function loadNativeDeps() {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"), import("@capacitor/share"),
  ]);
  return { Filesystem, Directory, Encoding, Share };
}
const missing = (error) => error?.code === "OS-PLUG-FILE-0008" || error?.code === "ENOENT";
function operationId() {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "")
    ?? Array.from(globalThis.crypto?.getRandomValues?.(new Uint8Array(16)) ?? Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)), b => b.toString(16).padStart(2, "0")).join("");
}

export async function exportBackupNative({ json, fileName, title, deps }) {
  if (exportInFlight || cleanupInFlight) return { shared: false, busy: true };
  exportInFlight = true; // 同期で確保し、プラグイン読込/OS認証待ちの二重tapも止める。
  let location;
  let wrote = false;
  let cleanupFailed = false;
  let fs;
  try {
    const { Filesystem, Directory, Encoding, Share } = deps ?? (await loadNativeDeps());
    fs = Filesystem;
    // 呼出側のファイル名をpathとして信用しない。共有先に見せる既存の日付名は維持する。
    if (!LEGACY_FILE.test(fileName)) throw Object.assign(new Error("Invalid backup filename"), { code: "invalid_backup_filename" });
    location = { path: `${BACKUP_CACHE_DIRECTORY}/${operationId()}/${fileName}`, directory: Directory.Cache };
    activePaths.add(location.path);
    wrote = true; // writeFile失敗でも途中までできた一時ファイルの回収を試す。
    const { uri } = await Filesystem.writeFile({ ...location, data: json, encoding: Encoding.UTF8, recursive: true });
    let shared;
    try {
      await Share.share({ title, files: [uri] });
      shared = true;
    } catch (error) {
      if (!isShareCancel(error)) throw error;
      shared = false;
    }
    try { await Filesystem.deleteFile(location); }
    catch (error) { if (!missing(error)) cleanupFailed = true; }
    wrote = false;
    if (cleanupFailed) console.warn("[kiri-backup] cache cleanup incomplete");
    return { shared, ...(cleanupFailed ? { cleanupFailed: true } : {}) };
  } finally {
    if (wrote && location) {
      try { await fs.deleteFile(location); }
      catch { console.warn("[kiri-backup] cache cleanup incomplete"); }
    }
    if (location) activePaths.delete(location.path);
    exportInFlight = false;
  }
}

// 起動/全削除から呼ぶ。アプリが所有する既知のCacheファイルだけを回収する。
// 共有中は保留し、利用者が外へ保存したファイルや他プラグインのCacheへ触れない。
export async function cleanupBackupCacheNative({ deps } = {}) {
  if (exportInFlight || cleanupInFlight) return { removed: 0, failed: 0, pending: true };
  cleanupInFlight = true;
  let removed = 0;
  let failed = 0;
  try {
    const { Filesystem, Directory } = deps ?? (await loadNativeDeps());
    const directory = Directory.Cache;
    const remove = async (path) => {
      if (activePaths.has(path)) return;
      try { await Filesystem.deleteFile({ path, directory }); removed++; }
      catch (error) { if (!missing(error)) failed++; }
    };
    const list = async (path) => {
      try { return (await Filesystem.readdir({ path, directory })).files ?? []; }
      catch (error) { if (!missing(error)) failed++; return []; }
    };
    for (const entry of await list("")) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (LEGACY_FILE.test(name) && (typeof entry === "string" || entry.type === "file")) await remove(name);
    }
    for (const entry of await list(BACKUP_CACHE_DIRECTORY)) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (!OPERATION_DIRECTORY.test(name) || (typeof entry !== "string" && entry.type !== "directory")) continue;
      const operationPath = `${BACKUP_CACHE_DIRECTORY}/${name}`;
      for (const file of await list(operationPath)) {
        const filename = typeof file === "string" ? file : file.name;
        if (LEGACY_FILE.test(filename) && (typeof file === "string" || file.type === "file")) await remove(`${operationPath}/${filename}`);
      }
      // 空の操作用フォルダだけを消す。他の名前のファイルがあればrecursive=falseで残す。
      try { await Filesystem.rmdir?.({ path: operationPath, directory, recursive: false }); } catch { /* 空でなければ残す */ }
    }
  } catch {
    failed++;
  } finally {
    cleanupInFlight = false;
  }
  if (failed) console.warn("[kiri-backup] cache cleanup incomplete");
  return { removed, failed, pending: false };
}
