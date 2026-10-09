import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";
import { DYNAMIC_TYPE_BOOT_SCRIPT, DYNAMIC_TYPE_ENABLED } from "@/lib/dynamicType";

// D-13: 見出しとKiriの言葉=しっぽり明朝、UI本文=Zen角ゴ新
const shipporiMincho = Shippori_Mincho({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-kiri-display",
  display: "swap",
  preload: false,
});

const zenKakuGothic = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-kiri-body",
  display: "swap",
  preload: false,
});

export const metadata = {
  title: "Mind & Energy Note | Kiri",
  description: "バイオリズムと四柱推命から、Kiriが今日の心の流れをやわらかく読み解くノート",
};

// iOS アプリ（Capacitor）でノッチ・ホームバーの下まで夜色を広げ、本文は env(safe-area-inset-*) で避ける。
// 通常のブラウザでは inset が 0 なので見た目は変わらない（Ruling 7 ⑥）。
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: iOS アプリでは head のスクリプトが html に文字サイズと目印を付ける（Dynamic Type）。
    <html lang="ja" suppressHydrationWarning>
      {DYNAMIC_TYPE_ENABLED ? (
        <head>
          {/* iOS アプリでだけ「文字を大きく」に追従する（src/lib/dynamicType.js）。Web では何もしない */}
          <script dangerouslySetInnerHTML={{ __html: DYNAMIC_TYPE_BOOT_SCRIPT }} />
        </head>
      ) : null}
      <body
        className={`${shipporiMincho.variable} ${zenKakuGothic.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
