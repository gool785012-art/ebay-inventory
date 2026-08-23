import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eBay外注管理ツール",
  description: "eBay輸出の外注スタッフ作業管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
