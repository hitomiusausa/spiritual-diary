/** @type {import('next').NextConfig} */
const nextConfig = {
  // devサーバー起動時にAGENTS.mdを自動生成させない
  agentRules: false,
  images: {
    // Cloudflare Workers（OpenNext）では Next.js の画像最適化サーバーが動かないため、
    // 画像は public/ の静的ファイルをそのまま配信する（画像は数枚のみ。DECISIONS.md D-19）。
    unoptimized: true,
  },
};

export default nextConfig;
