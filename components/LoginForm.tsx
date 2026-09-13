"use client";

import { useState } from "react";
import { readErrorMessage } from "@/lib/client";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      // 整頁跳轉，讓 proxy 重新看到 cookie
      window.location.assign(nextPath());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <h1>PitchCue</h1>
      </header>
      <form className="card login-card" onSubmit={(e) => void submit(e)}>
        <p className="mb-3 text-sm text-ink-2">登入後才能使用主控台：</p>
        <input
          type="email"
          className="text-input mb-2"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          className="text-input mb-3"
          autoComplete="current-password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="密碼"
        />
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !email || !pw}>
          {busy ? "登入中…" : "登入"}
        </button>
        {err && <p className="login-error mt-2">{err}</p>}
      </form>
    </main>
  );
}
