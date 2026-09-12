"use client";

import dynamic from "next/dynamic";

// 觀看頁只在瀏覽器執行（需要讀 URL 與輪詢），關閉 SSR
const Viewer = dynamic(() => import("@/components/Viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => <p className="page text-ink-2">載入中…</p>,
});

export default function ViewPage() {
  return <Viewer />;
}
