// iOS アプリ（Capacitor）でのバックアップ書き出し（設計 Ruling 6）。
// WKWebView では <a download> が効かないため、端末の Cache に一時ファイルを書いて
// シェアシート（"ファイル"に保存・AirDrop など）へ渡し、終わったら一時ファイルを消す。
// Web は呼ばない（現行の <a download> のまま）。依存は deps で差し替えられる（テスト用）。

const SHARE_CANCEL_PATTERN = /cancel/i;

export function isShareCancel(error) {
  return Boolean(error) && SHARE_CANCEL_PATTERN.test(String(error.message ?? ""));
}

async function loadNativeDeps() {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  return { Filesystem, Directory, Encoding, Share };
}

// 戻り値: { shared: true }（共有先を選んだ）/ { shared: false }（シェアシートを閉じた）。
// 書き込み失敗・共有の失敗（キャンセル以外）は例外を投げる。
export async function exportBackupNative({ json, fileName, title, deps }) {
  const { Filesystem, Directory, Encoding, Share } = deps ?? (await loadNativeDeps());
  const location = { path: fileName, directory: Directory.Cache };

  const { uri } = await Filesystem.writeFile({ ...location, data: json, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title, files: [uri] });
    return { shared: true };
  } catch (error) {
    if (isShareCancel(error)) return { shared: false };
    throw error;
  } finally {
    try {
      await Filesystem.deleteFile(location);
    } catch {
      // 一時ファイルは OS が Cache ごと掃除する。書き出し自体の成否は変えない。
    }
  }
}
