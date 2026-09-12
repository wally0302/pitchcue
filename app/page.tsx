"use client";

import dynamic from "next/dynamic";

// 整個工具只在瀏覽器執行（需要麥克風與 localStorage），關閉 SSR 避免 hydration 不一致
const App = dynamic(() => import("@/components/App").then((m) => m.App), {
  ssr: false,
  loading: () => <p className="page text-ink-2">載入中…</p>,
});

export default function Page() {
  return <App />;
}
