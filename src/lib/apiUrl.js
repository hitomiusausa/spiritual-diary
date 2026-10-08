// APIのベースURL。Webは未設定(相対URL)、iOSの静的書き出しビルドでは絶対URLを埋め込む。
// NEXT_PUBLIC_* はビルド時に静的置換されるため、動的キーで参照しないこと。
export function apiUrl(path) {
  const base = (process.env.NEXT_PUBLIC_KIRI_API_BASE || "").trim().replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
