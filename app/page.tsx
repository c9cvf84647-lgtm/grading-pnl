"use client";

import { useEffect, useState } from "react";
import Tracker, { Masthead } from "@/components/Tracker";

type User = { email: string; premium: boolean };

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [database, setDatabase] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => { setUser(d.user); setDatabase(d.database); })
      .catch(() => setUser(null));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (user === undefined) return <Masthead />;
  if (!user) return (<><Masthead /><AuthForm onDone={setUser} database={database} /></>);

  const account = (
    <div className="account">
      {user.premium && <span className="badge">Premium</span>}
      <span>{user.email}</span>
      <button type="button" onClick={signOut}>Sign out</button>
    </div>
  );
  return <Tracker key={user.email} premium={user.premium} account={account} />;
}

function AuthForm({ onDone, database }: { onDone: (u: User) => void; database: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Something went wrong. Try again.");
      onDone(d.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="inner">
      <form className="auth" onSubmit={submit}>
        <h2>{mode === "signup" ? "Create your free account" : "Sign in"}</h2>
        <p>Track what you paid, what grading cost, and what each slab is worth now, with live market prices.</p>
        {!database && <p className="msg">The database isn&apos;t connected yet, so accounts reset when the server restarts.</p>}
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <span className="msg" role="alert">{error}</span>
        <span className="switch">
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <button type="button" className="link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </span>
      </form>
    </main>
  );
}
