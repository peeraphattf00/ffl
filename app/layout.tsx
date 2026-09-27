import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FC Friends League | FC27 Ultimate Team",
  description: "ตารางคะแนน โปรแกรมการแข่งขัน และสโมสรของเพื่อน",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
