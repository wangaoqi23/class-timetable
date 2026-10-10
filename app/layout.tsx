import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "课间 · 课程表",
  description: "按班级、按周查看课程安排。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
