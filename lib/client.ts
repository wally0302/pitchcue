"use client";

/** fetch 包裝：401（未登入或登入過期）就導向登入頁，登入後接續原本的頁面 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, init);
  if (res.status === 401) {
    const next = window.location.pathname + window.location.search;
    // 整頁跳轉而不是 router.push：讓 proxy 重新讀 cookie，並清掉客戶端狀態
    window.location.assign(new URL(`/login?next=${encodeURIComponent(next)}`, window.location.origin).href);
    throw new Error("需要登入，正在前往登入頁…");
  }
  return res;
}

export async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {}
  return `HTTP ${res.status}`;
}
