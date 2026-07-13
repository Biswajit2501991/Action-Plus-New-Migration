"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { readAuthSession } from "@/lib/auth-storage";
import {
  DEFAULT_GYM_DISPLAY_NAME,
  DEFAULT_LOGO_PATH,
} from "@/lib/domain/branch-branding";

const REMEMBER_KEY = "apg.auth.remember";

export function LoginForm() {
  const router = useRouter();
  const { login, forgotPassword, isAuthenticated, hydrated } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBER_KEY);
      if (remembered) {
        setIdentifier(remembered);
        setRemember(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (hydrated && (isAuthenticated || readAuthSession())) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthenticated, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (mode === "forgot") {
        await forgotPassword(identifier.trim());
        setMessage("Reset request submitted. Contact the owner if you need a new password.");
        return;
      }
      await login(identifier.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, identifier.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // ignore
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(13,148,136,0.18),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(15,23,42,0.08),transparent_35%),linear-gradient(180deg,#f8fafc,#eef2f7)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.12),transparent_40%),linear-gradient(180deg,#020617,#0f172a)]" />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md rounded-3xl border border-white/40 bg-white/80 p-8 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70"
      >
        <div className="flex flex-col items-center text-center">
          <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-teal-600/20 shadow-sm">
            <BranchLogo
              src={DEFAULT_LOGO_PATH}
              alt={DEFAULT_GYM_DISPLAY_NAME}
              className="h-full w-full"
            />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{DEFAULT_GYM_DISPLAY_NAME}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in with your staff credentials."
              : "Request a password reset."}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <Label htmlFor="identifier">Login ID or email</Label>
            <Input
              id="identifier"
              className="mt-1.5"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          {mode === "login" ? (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                className="mt-1.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          ) : null}
          {mode === "login" ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-border"
              />
              Remember me
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}

        <Button type="submit" className="mt-6 w-full" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Request reset"}
        </Button>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-teal-700 hover:underline dark:text-teal-400"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login");
            setError("");
            setMessage("");
          }}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </form>
    </div>
  );
}
