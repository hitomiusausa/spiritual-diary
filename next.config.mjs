import { nextConfigFor } from "./scripts/lib/nextConfigFor.mjs";

// 切り替えの中身は scripts/lib/nextConfigFor.mjs（テストあり）。iOS 用は npm run ios:build。
// 関数形式にして phase を渡す（next dev のときだけモック購入を許すため。Phase 3）。
/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return nextConfigFor(process.env, { phase });
}
