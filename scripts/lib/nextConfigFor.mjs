// next.config.mjs の中身を、ビルド先（Web/Workers か iOS 静的書き出しか）で切り替える純粋関数（設計 Ruling 2）。
// - Web / Workers（既定）: API ルート（route.api.js）を含める。静的書き出しはしない。
// - KIRI_BUILD_TARGET=ios: API ルートを pageExtensions で外し、out/ へ静的書き出しする。
//   distDir は使わない（Next 16.4 は distDir を書き出し先にしてしまう）。
// Workers Builds の環境変数に KIRI_BUILD_TARGET を置かないこと（本番が静的化して API が消える）。

export const IOS_BUILD_TARGET = "ios";
// next.config の関数形式に渡る phase（next/constants の PHASE_DEVELOPMENT_SERVER と同じ値）。
export const DEV_SERVER_PHASE = "phase-development-server";

// アプリ内課金「Kiriと話す」のビルド時定数（Phase 3・設計 Ruling 10・ブリーフ「設計書からの変更 5」）。
// - Web（Workers の next build）: 常に IAP '0'・モック '0'・キー空。購入画面・入口・チャット欄はバンドルから消える（D-24 の性質）。
// - iOS（KIRI_BUILD_TARGET=ios）: scripts/build-ios.mjs が IAP・モック・公開キーを決めて渡す。ここでは
//   IAP='1' かつ（公開キー or モック）のときだけ有効にする。公開キーは iOS のときだけ埋め込む。
// - next dev: IAP='1' かつ MOCK='1' のときだけモック購入で試せる（キーは使わない）。
function iapEnvFor(env, { ios, devServer }) {
  const mock = (ios || devServer) && env.NEXT_PUBLIC_KIRI_IAP_MOCK === "1";
  const key = ios ? String(env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "").trim() : "";
  const iap = (ios || devServer) && env.NEXT_PUBLIC_KIRI_IAP === "1" && (Boolean(key) || mock);
  return {
    NEXT_PUBLIC_KIRI_IAP: iap ? "1" : "0",
    NEXT_PUBLIC_KIRI_IAP_MOCK: iap && mock ? "1" : "0",
    NEXT_PUBLIC_REVENUECAT_IOS_KEY: iap ? key : "",
  };
}

export function nextConfigFor(env = process.env, { phase } = {}) {
  const ios = env.KIRI_BUILD_TARGET === IOS_BUILD_TARGET;
  const devServer = phase === DEV_SERVER_PHASE;
  const config = {
    // devサーバー起動時にAGENTS.mdを自動生成させない
    agentRules: false,
    images: {
      // Cloudflare Workers（OpenNext）では Next.js の画像最適化サーバーが動かないため、
      // 画像は public/ の静的ファイルをそのまま配信する（画像は数枚のみ。DECISIONS.md D-19）。
      // iOS の静的書き出しでも最適化サーバーは無いので同じ。
      unoptimized: true,
    },
    // API ルートは route.api.js。iOS では拡張子 api.js を外してルートごと除外する。
    pageExtensions: ios ? ["js", "jsx"] : ["api.js", "js", "jsx"],
    // 未設定の NEXT_PUBLIC_* は静的置換されず、プレビュー用の文言がバンドルに残る。
    // 必ず '0' か '1' を埋め込み、未使用の分岐ごと消す（課金開始まで チャットは画面に出さない。Q4）。
    env: {
      NEXT_PUBLIC_KIRI_CHAT_PREVIEW: env.NEXT_PUBLIC_KIRI_CHAT_PREVIEW === "1" ? "1" : "0",
      ...iapEnvFor(env, { ios, devServer }),
    },
  };
  if (ios) {
    config.output = "export";
    config.trailingSlash = true;
  }
  return config;
}
