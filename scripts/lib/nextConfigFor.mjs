// next.config.mjs の中身を、ビルド先（Web/Workers か iOS 静的書き出しか）で切り替える純粋関数（設計 Ruling 2）。
// - Web / Workers（既定）: API ルート（route.api.js）を含める。静的書き出しはしない。
// - KIRI_BUILD_TARGET=ios: API ルートを pageExtensions で外し、out/ へ静的書き出しする。
//   distDir は使わない（Next 16.4 は distDir を書き出し先にしてしまう）。
// Workers Builds の環境変数に KIRI_BUILD_TARGET を置かないこと（本番が静的化して API が消える）。

export const IOS_BUILD_TARGET = "ios";

export function nextConfigFor(env = process.env) {
  const ios = env.KIRI_BUILD_TARGET === IOS_BUILD_TARGET;
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
  };
  if (ios) {
    config.output = "export";
    config.trailingSlash = true;
  }
  return config;
}
