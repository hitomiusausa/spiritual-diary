// @capacitor/privacy-screen 2.0.1 の iOS 実装を Kiri 版に差し替える判定（DECISIONS.md D-25・ロック監査 P2-2）。
// 差し替え先は scripts/patches/privacy-screen/PrivacyScreenPlugin.swift（UIKit をメインスレッドに載せ、
// 覆いを「表示中のビューコントローラ」ではなくウィンドウの上の素のビューにした版）。
// 上流のファイルが 2.0.1 の中身と完全一致するときだけ置き換える。既に差し替え済みなら何もしない。
// どちらとも違えば（プラグインの更新など）止めて知らせる。
import { createHash } from "node:crypto";

export const PRIVACY_SCREEN_VERSION = "2.0.1";
export const PRIVACY_SCREEN_TARGET =
  "node_modules/@capacitor/privacy-screen/ios/Sources/PrivacyScreenPlugin/PrivacyScreenPlugin.swift";
export const PRIVACY_SCREEN_PATCH = "scripts/patches/privacy-screen/PrivacyScreenPlugin.swift";
// 上流 2.0.1 の PrivacyScreenPlugin.swift（npm の tarball のまま）の SHA-256。
export const UPSTREAM_SHA256 = "4d778c39e5aa0921ad46690f905c47705cbf4ca50edd6e3203f9e8605197100c";

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// status: "patched"（置き換える）/ "already"（差し替え済み）/ "unexpected"（版か中身が想定外）
export function decidePrivacyScreenPatch({ installed, patch, version, upstreamSha256 = UPSTREAM_SHA256 }) {
  if (version !== PRIVACY_SCREEN_VERSION) {
    return { status: "unexpected", reason: `version ${version} (expected ${PRIVACY_SCREEN_VERSION})` };
  }
  const current = sha256(installed);
  if (current === sha256(patch)) return { status: "already" };
  if (current === upstreamSha256) return { status: "patched" };
  return { status: "unexpected", reason: `unknown PrivacyScreenPlugin.swift (sha256 ${current})` };
}
