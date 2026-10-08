import { nextConfigFor } from "./scripts/lib/nextConfigFor.mjs";

// 切り替えの中身は scripts/lib/nextConfigFor.mjs（テストあり）。iOS 用は npm run ios:build。
/** @type {import('next').NextConfig} */
const nextConfig = nextConfigFor(process.env);

export default nextConfig;
