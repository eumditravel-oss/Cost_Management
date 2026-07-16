import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "현장 원가관리 시스템",
  description: "현장 원가관리 시스템 개발 기반",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
