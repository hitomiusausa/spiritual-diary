// iOS アプリ（Capacitor）の設定。設計 Ruling 1・7・11・14。
// - Web 資産は同梱の静的書き出し（npm run ios:build → out/）だけを使う。server.url は置かない
//   （審査 4.2 対策と、オフライン起動のため）。開発中にローカル API を叩きたいときは
//   `npm run ios:build -- --dev`（NEXT_PUBLIC_KIRI_API_BASE をビルド時に埋める）で切り替える。
// - CapacitorHttp は使わない（fetch は WKWebView のまま。CORS は Ruling 4 でサーバー側が許可する）。
import type { CapacitorConfig } from "@capacitor/cli";

const NIGHT_COLOR = "#171522";

const config: CapacitorConfig = {
  appId: "com.kugainc.kiri",
  appName: "Kiri",
  webDir: "out",
  backgroundColor: NIGHT_COLOR,
  ios: {
    contentInset: "never",
    backgroundColor: NIGHT_COLOR,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
    // 以下は T9 でプラグインを入れた時点で効く値（Ruling 7・Q5）。
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: NIGHT_COLOR,
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK", // 明るい文字
      backgroundColor: NIGHT_COLOR,
    },
  },
};

export default config;
