"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Lock, User } from "lucide-react";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { readAuthSession } from "@/lib/auth-storage";
import {
  DEFAULT_GYM_DISPLAY_NAME,
  DEFAULT_LOGO_PATH,
} from "@/lib/domain/branch-branding";
import { cn } from "@/lib/utils";

const REMEMBER_KEY = "apg.auth.remember";

export function LoginForm() {
  const router = useRouter();
  const { login, forgotPassword, isAuthenticated, hydrated } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        setMessage(
          "Reset request sent. The owner will get a notification and can set a new password for you.",
        );
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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{
        fontFamily: "var(--font-login-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* Atmospheric full-bleed plane */}
      <div className="pointer-events-none absolute inset-0 bg-[#070b12]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 15% 10%, rgba(20,184,166,0.28), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 85%, rgba(14,116,144,0.22), transparent 50%), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(15,23,42,0.5), transparent 70%)",
        }}
      />
      <div
        className="login-ambient pointer-events-none absolute -left-1/4 top-[-20%] h-[70vh] w-[70vw] rounded-full bg-teal-500/15 blur-3xl"
        aria-hidden
      />
      <div
        className="login-ambient-delay pointer-events-none absolute -right-1/4 bottom-[-10%] h-[55vh] w-[55vw] rounded-full bg-cyan-600/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
        }}
        aria-hidden
      />

      <form
        onSubmit={onSubmit}
        className="login-panel relative w-full max-w-[420px] rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:p-9"
      >
        <div className="flex flex-col items-center text-center">
          <div className="login-logo relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-full ring-1 ring-teal-300/30 shadow-[0_0_40px_-8px_rgba(45,212,191,0.55)]">
            <BranchLogo
              src={DEFAULT_LOGO_PATH}
              alt={DEFAULT_GYM_DISPLAY_NAME}
              className="h-full w-full"
            />
          </div>
          <h1
            className="mt-5 text-[1.85rem] font-semibold tracking-tight text-white sm:text-[2.05rem]"
            style={{ fontFamily: "var(--font-login-display), var(--font-login-sans), sans-serif" }}
          >
            {DEFAULT_GYM_DISPLAY_NAME}
          </h1>
          <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-slate-400">
            {mode === "login"
              ? "Sign in to your staff workspace."
              : "Ask the owner to reset your password."}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label htmlFor="identifier" className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              Username
            </label>
            <div className="relative mt-2">
              <User
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-300/80"
                aria-hidden
              />
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                placeholder="Login ID or email"
                className={cn(
                  "h-12 w-full rounded-2xl border border-white/10 bg-black/25 pl-11 pr-3.5 text-sm text-white",
                  "placeholder:text-slate-500 shadow-inner outline-none transition",
                  "focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/25",
                )}
              />
            </div>
          </div>

          {mode === "login" ? (
            <div>
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Password
              </label>
              <div className="relative mt-2">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-300/80"
                  aria-hidden
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  className={cn(
                    "h-12 w-full rounded-2xl border border-white/10 bg-black/25 pl-11 pr-12 text-sm text-white",
                    "placeholder:text-slate-500 shadow-inner outline-none transition",
                    "focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/25",
                  )}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-teal-200"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-teal-400/20 bg-teal-400/5 px-3.5 py-3 text-left text-xs leading-relaxed text-slate-300">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium text-teal-200">
                <KeyRound className="h-3.5 w-3.5" />
                Owner notification
              </div>
              Enter your username or email. We&apos;ll notify the owner that you&apos;re requesting a
              password reset. They can approve it and set a new password from Notifications.
            </div>
          )}

          {mode === "login" ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/30 text-teal-500 focus:ring-teal-400/40"
              />
              Remember me on this device
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200" role="status">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className={cn(
            "mt-6 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold tracking-wide transition",
            "bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400 text-slate-950",
            "shadow-[0_12px_40px_-10px_rgba(45,212,191,0.65)]",
            "hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Send reset request"}
        </button>

        <button
          type="button"
          className="mt-5 w-full text-center text-sm text-teal-300/90 transition hover:text-teal-200"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login");
            setError("");
            setMessage("");
            setShowPassword(false);
          }}
        >
          {mode === "login" ? "Reset my password" : "Back to sign in"}
        </button>
      </form>

    </div>
  );
}
