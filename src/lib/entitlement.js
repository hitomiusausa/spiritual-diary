// チャット(有料オプション)のサーバー側entitlement判定。
// 現在は開発プレビューの環境変数のみ。StoreKit/RevenueCat検証は将来この中に実装する。
// クライアントから渡されるフラグは判定に使わない(DECISIONS.md D-07)。

export function checkChatEntitlement() {
  const preview = String(process.env.KIRI_CHAT_PREVIEW || "").toLowerCase();
  const allowed = preview === "1" || preview === "true";
  return {
    allowed,
    mode: "preview",
    reason: allowed ? "preview_enabled" : "preview_disabled",
  };
}
