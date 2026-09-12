"use client";

const KEY_STORAGE = "speak:key";
export const UNAUTHORIZED_EVENT = "speak:unauthorized";

export function getAppKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAppKey(v: string) {
  try {
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {}
}

/** fetch 包裝：自動帶密碼 header；401 時廣播事件讓頁面顯示密碼欄 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = getAppKey();
  if (key) headers.set("x-app-key", key);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new Error("需要密碼：請在上方輸入密碼後按「重試」");
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
