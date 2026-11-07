import { describe, expect, it, vi } from "vitest";
import { BACKUP_CACHE_DIRECTORY, cleanupBackupCacheNative, exportBackupNative, isBackupExportInProgress, isShareCancel } from "@/lib/backupShare";

const FILE = "kiri-backup-2026-11-06.json";
function makeDeps({ shareError = null, writeError = null, deleteError = null, share, initial = [] } = {}) {
  const files = new Map(initial.map(path => [path, "old"]));
  const calls = [];
  const deps = {
    Directory: { Cache: "CACHE" }, Encoding: { UTF8: "utf8" },
    Filesystem: {
      writeFile: vi.fn(async options => {
        calls.push(["write", options.path]);
        files.set(options.path, options.data); // A failed write may have created a partial file.
        if (writeError) throw writeError;
        return { uri: `file:///cache/${options.path}` };
      }),
      deleteFile: vi.fn(async ({ path }) => {
        calls.push(["delete", path]);
        if (deleteError) throw deleteError;
        files.delete(path);
      }),
      readdir: vi.fn(async ({ path }) => {
        const prefix = path ? `${path}/` : "";
        const children = new Map();
        for (const name of files.keys()) {
          if (!name.startsWith(prefix)) continue;
          const rest = name.slice(prefix.length);
          const [first, ...remaining] = rest.split("/");
          children.set(first, { name: first, type: remaining.length ? "directory" : "file" });
        }
        return { files: [...children.values()] };
      }),
      rmdir: vi.fn(async () => {}),
    },
    Share: { share: vi.fn(async options => { calls.push(["share", options.files[0]]); if (shareError) throw shareError; return share ? share(options) : {}; }) },
  };
  return { deps, calls, files };
}

describe("native backup file lifecycle", () => {
  it("preserves the visible filename under a unique private operation folder, shares then removes only its file", async () => {
    const { deps, calls, files } = makeDeps();
    expect(await exportBackupNative({ json: "{}", fileName: FILE, title: "Kiri", deps })).toEqual({ shared: true });
    const path = calls[0][1];
    expect(path).toMatch(new RegExp(`^${BACKUP_CACHE_DIRECTORY}/[a-f0-9]{32}/${FILE.replace(/\./g, "\\.")}$`));
    expect(calls.map(c => c[0])).toEqual(["write", "share", "delete"]);
    expect(deps.Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({ directory: "CACHE", recursive: true }));
    expect(files.size).toBe(0);
    await exportBackupNative({ json: "{}", fileName: FILE, deps });
    expect(calls[3][1]).not.toBe(path);
  });

  it("exports the strict recovery filename and later cleans only its known orphan", async () => {
    const recovery = "kiri-recovery-backup-2026-11-06.json";
    const { deps, calls } = makeDeps();
    expect(await exportBackupNative({ json: '{"raw":"recovery"}', fileName: recovery, deps })).toEqual({ shared: true });
    expect(calls[0][1]).toMatch(new RegExp(`^${BACKUP_CACHE_DIRECTORY}/[a-f0-9]{32}/${recovery.replace(/\./g, "\\.")}$`));
    const folder = `${BACKUP_CACHE_DIRECTORY}/${"b".repeat(32)}`;
    const cleanup = makeDeps({ initial: [recovery, `${folder}/${recovery}`, "recovery-kiri-backup-2026-11-06.json", `${folder}/private.json`] });
    expect(await cleanupBackupCacheNative({ deps: cleanup.deps })).toEqual({ removed: 2, failed: 0, pending: false });
    expect([...cleanup.files.keys()].sort()).toEqual(["recovery-kiri-backup-2026-11-06.json", `${folder}/private.json`].sort());
  });

  it("blocks duplicate calls synchronously while the first share remains open", async () => {
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    const { deps, files } = makeDeps({ share: () => hold });
    const first = exportBackupNative({ json: "{}", fileName: FILE, deps });
    const second = await exportBackupNative({ json: "new", fileName: FILE, deps });
    expect(second).toEqual({ shared: false, busy: true });
    await vi.waitFor(() => expect(deps.Share.share).toHaveBeenCalledTimes(1));
    expect(isBackupExportInProgress()).toBe(true);
    expect(files.size).toBe(1);
    expect(await cleanupBackupCacheNative({ deps })).toEqual({ removed: 0, failed: 0, pending: true });
    expect(files.size).toBe(1);
    release(); await first;
    expect(isBackupExportInProgress()).toBe(false);
    expect(files.size).toBe(0);
  });

  it("cleans its own file after cancellation, share failure, or a partial write failure", async () => {
    for (const failure of ["cancel", "share", "write"]) {
      const { deps, files } = makeDeps({
        shareError: failure === "cancel" ? new Error("Share canceled") : failure === "share" ? new Error("share failed") : null,
        writeError: failure === "write" ? new Error("disk full") : null,
      });
      const operation = exportBackupNative({ json: "{}", fileName: FILE, deps });
      if (failure === "cancel") expect(await operation).toEqual({ shared: false });
      else await expect(operation).rejects.toThrow();
      expect(files.size).toBe(0);
      expect(isBackupExportInProgress()).toBe(false);
    }
  });

  it("reports cleanup failure after sharing, without including JSON in its warning", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps } = makeDeps({ deleteError: new Error("PRIVATE_MARKER") });
    expect(await exportBackupNative({ json: "PRIVATE_MARKER", fileName: FILE, deps })).toEqual({ shared: true, cleanupFailed: true });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("PRIVATE_MARKER");
    warning.mockRestore();
  });

  it("rejects paths outside the expected visible filename", async () => {
    const { deps } = makeDeps();
    await expect(exportBackupNative({ json: "{}", fileName: "../user-file.json", deps })).rejects.toMatchObject({ code: "invalid_backup_filename" });
    expect(deps.Filesystem.writeFile).not.toHaveBeenCalled();
  });
});

describe("orphan cleanup", () => {
  it("removes only known legacy root backups and known files in operation folders", async () => {
    const folder = `${BACKUP_CACHE_DIRECTORY}/${"a".repeat(32)}`;
    const { deps, files } = makeDeps({ initial: [FILE, `${folder}/${FILE}`, "other.json", "kiri-backup-not-a-date.json", `unrelated/${FILE}`, `${folder}/other.txt`, `${BACKUP_CACHE_DIRECTORY}/unrelated/${FILE}`] });
    expect(await cleanupBackupCacheNative({ deps })).toEqual({ removed: 2, failed: 0, pending: false });
    expect([...files.keys()].sort()).toEqual(["other.json", "kiri-backup-not-a-date.json", `unrelated/${FILE}`, `${folder}/other.txt`, `${BACKUP_CACHE_DIRECTORY}/unrelated/${FILE}`].sort());
  });

  it("treats a missing dedicated folder as empty but exposes permission/deletion errors", async () => {
    const { deps } = makeDeps();
    deps.Filesystem.readdir.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    expect(await cleanupBackupCacheNative({ deps })).toEqual({ removed: 0, failed: 0, pending: false });
    const broken = makeDeps({ initial: [FILE], deleteError: new Error("permission") });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await cleanupBackupCacheNative({ deps: broken.deps })).toEqual({ removed: 0, failed: 1, pending: false });
    warning.mockRestore();
  });
});

describe("isShareCancel", () => {
  it("recognises only the iOS cancellation rejection", () => {
    expect(isShareCancel(new Error("Share canceled"))).toBe(true);
    expect(isShareCancel({ message: "Share cancelled" })).toBe(true);
    expect(isShareCancel(new Error("boom"))).toBe(false);
    expect(isShareCancel(null)).toBe(false);
  });
});
