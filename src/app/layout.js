import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body
        className={`${shipporiMincho.variable} ${zenKakuGothic.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
