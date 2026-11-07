import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    // Xcodeが取得するSDK側テストや配布用の生成物をプロジェクトの検証へ混ぜない。
    exclude: [...configDefaults.exclude, "build/**", "ios/**", "out/**", ".next/**", ".open-next/**"],
  },
});
