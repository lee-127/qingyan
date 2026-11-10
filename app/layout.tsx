import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "清研 · 考研复习工作台",
  description: "把资料、错题与每一次进步，收进同一个工作台。",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
