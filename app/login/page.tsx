import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "登入" };

// 已登入的人會被 proxy.ts 直接導回，這頁本身不讀 cookie，可以靜態輸出
export default function LoginPage() {
  return <LoginForm />;
}
