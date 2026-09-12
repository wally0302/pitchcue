import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_NAME = "PitchCue";
const TAGLINE = "評審 Q&A 即時提詞助手";
const DESCRIPTION =
  "黑客松、Demo Day 評審提問時的即時提詞工具：錄下問題 → 語音轉文字 → 依據你的專案文件產生重點條列與可直接唸的口語稿。";

// Vercel 會注入 VERCEL_PROJECT_PRODUCTION_URL；自架時可設 NEXT_PUBLIC_SITE_URL
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} · ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${TAGLINE}`,
    description: DESCRIPTION,
    locale: "zh_TW",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${TAGLINE}`,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f2ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
