import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "oddk · 하루 계획",
  description: "할 일과 여유를 시간표에 배치하고 목표와 연결하는 하루 계획",
  applicationName: "oddk",
  appleWebApp: { capable: true, title: "oddk", statusBarStyle: "default" },
  icons: { apple: [{ url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/oddk-icon-192.png`, sizes: "192x192", type: "image/png" }] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
