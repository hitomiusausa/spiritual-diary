import { describe, expect, it, vi } from "vitest";
import { exportBackupNative, isShareCancel } from "@/lib/backupShare";

function makeDeps({ shareError = null, writeError = null, deleteError = null } = {}) {
  const calls = [];
  const deps = {
    Directory: { Cache: "CACHE" },
    Encoding: { UTF8: "utf8" },
    Filesystem: {
      writeFile: vi.fn(async (options) => {
        calls.push(["writeFile", options]);
        if (writeError) throw writeError;
        return { uri: `file:///cache/${options.path}` };
      }),
      deleteFile: vi.fn(async (options) => {
        calls.push(["deleteFile", options]);
        if (deleteError) throw deleteError;
      }),
    },
    Share: {
      share: vi.fn(async (options) => {
        calls.push(["share", options]);
        if (shareError) throw shareError;
        return { activityType: "com.apple.DocumentManagerUICore.SaveToFiles" };
      }),
    },
  };
  return { deps, calls };
}

describe("exportBackupNative", () => {
  it("writes the JSON to the cache directory, shares its uri, then deletes the temp file", async () => {
    const { deps, calls } = makeDeps();
    const result = await exportBackupNative({
      json: '{"app":"spiritual-diary"}',
      fileName: "kiri-backup-2026-10-09.json",
      title: "Kiriのバックアップ",
      deps,
    });

    expect(result).toEqual({ shared: true });
    expect(calls.map(([name]) => name)).toEqual(["writeFile", "share", "deleteFile"]);
    expect(calls[0][1]).toEqual({
      path: "kiri-backup-2026-10-09.json",
      data: '{"app":"spiritual-diary"}',
      directory: "CACHE",
      encoding: "utf8",
    });
    expect(calls[1][1]).toEqual({
      title: "Kiriのバックアップ",
      files: ["file:///cache/kiri-backup-2026-10-09.json"],
    });
    expect(calls[2][1]).toEqual({ path: "kiri-backup-2026-10-09.json", directory: "CACHE" });
  });

  it("returns {shared:false} when the share sheet is cancelled, and still deletes the temp file", async () => {
    const { deps, calls } = makeDeps({ shareError: new Error("Share canceled") });
    const result = await exportBackupNative({ json: "{}", fileName: "a.json", deps });
    expect(result).toEqual({ shared: false });
    expect(calls.map(([name]) => name)).toEqual(["writeFile", "share", "deleteFile"]);
  });

  it("rethrows other share failures after deleting the temp file", async () => {
    const { deps, calls } = makeDeps({ shareError: new Error("boom") });
    await expect(exportBackupNative({ json: "{}", fileName: "a.json", deps })).rejects.toThrow("boom");
    expect(calls.map(([name]) => name)).toEqual(["writeFile", "share", "deleteFile"]);
  });

  it("does not share or delete when writing the file fails", async () => {
    const { deps, calls } = makeDeps({ writeError: new Error("disk full") });
    await expect(exportBackupNative({ json: "{}", fileName: "a.json", deps })).rejects.toThrow("disk full");
    expect(calls.map(([name]) => name)).toEqual(["writeFile"]);
  });

  it("ignores a failure to delete the temp file (the export itself succeeded)", async () => {
    const { deps } = makeDeps({ deleteError: new Error("gone") });
    await expect(exportBackupNative({ json: "{}", fileName: "a.json", deps })).resolves.toEqual({ shared: true });
  });
});

describe("isShareCancel", () => {
  it("recognises the iOS cancel rejection", () => {
    expect(isShareCancel(new Error("Share canceled"))).toBe(true);
    expect(isShareCancel({ message: "Share cancelled" })).toBe(true);
    expect(isShareCancel(new Error("boom"))).toBe(false);
    expect(isShareCancel(null)).toBe(false);
  });
});
