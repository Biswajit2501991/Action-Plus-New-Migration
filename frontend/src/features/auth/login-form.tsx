"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, User } from "lucide-react";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/services/api/client";
import { readAuthSession } from "@/lib/auth-storage";
import { firstAllowedWebHref } from "@/lib/domain/permissions";
import {
  DEFAULT_GYM_DISPLAY_NAME,
  DEFAULT_LOGO_PATH,
} from "@/lib/domain/branch-branding";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import { PinResetPanel } from "@/features/auth/pin-reset-panel";

const REMEMBER_KEY = "apg.auth.remember";

const fieldClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-11 pr-3.5 text-sm text-white placeholder:text-[#AAB3C5]/70 shadow-inner outline-none transition focus:border-[#906BFF]/60 focus:ring-2 focus:ring-[#906BFF]/25";

export function LoginForm() {
  const router = useRouter();
  const { login, forgotPassword, isAuthenticated, hydrated } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"login" | "forgot" | "pin">("login");
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
      const u = useAuthStore.getState().user;
      router.replace(firstAllowedWebHref(u));
    }
  }, [hydrated, isAuthenticated, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (mode === "pin") return;
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
      const u = useAuthStore.getState().user;
      router.replace(firstAllowedWebHref(u));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const subtitle =
    mode === "login"
      ? "Sign in with your password or PIN."
      : mode === "pin"
        ? "Reset your login PIN."
        : "Ask the owner to reset your password.";

  return (
    <div
      className="login-shell relative min-h-[100dvh] min-h-screen overflow-hidden"
      style={{
        fontFamily: "var(--font-login-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="login-colour-stage pointer-events-none fixed inset-0" aria-hidden />

      <div className="login-signature">
        <div className="login-signature-mark">
          <BranchLogo
            src={DEFAULT_LOGO_PATH}
            alt={DEFAULT_GYM_DISPLAY_NAME}
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0">
          <p className="login-signature-name">ACTION PLUS GYM</p>
          <p className="login-signature-sub">Fitness Club</p>
        </div>
      </div>

      <div className="login-stage-copy relative z-10 flex min-h-[100dvh] min-h-screen w-full items-center justify-center px-4">
        <form
          onSubmit={onSubmit}
          className="login-panel relative w-full max-w-[440px] rounded-[1.75rem] border border-white/15 bg-[#0B1020]/78 p-7 shadow-[0_40px_100px_-28px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-9"
        >
          <div className="flex flex-col items-center text-center">
            <h2
              className="text-2xl font-semibold tracking-tight text-white"
              style={{ fontFamily: "var(--font-login-display), var(--font-login-sans), sans-serif" }}
            >
              Sign in
            </h2>
            <p className="mt-1.5 text-sm text-[#AAB3C5]">{subtitle}</p>
          </div>

          {mode === "pin" ? (
            <PinResetPanel
              identifier={identifier}
              onIdentifier={setIdentifier}
              onBack={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            />
          ) : (
            <>
              <div className="mt-8 space-y-4">
                <div>
                  <label
                    htmlFor="identifier"
                    className="text-xs font-medium uppercase tracking-[0.14em] text-[#AAB3C5]"
                  >
                    Username
                  </label>
                  <div className="relative mt-2">
                    <User
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C4B5FD]"
                      aria-hidden
                    />
                    <input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                      placeholder="Login ID or email"
                      className={fieldClass}
                    />
                  </div>
                </div>

                {mode === "login" ? (
                  <div>
                    <label
                      htmlFor="password"
                      className="text-xs font-medium uppercase tracking-[0.14em] text-[#AAB3C5]"
                    >
                      Password
                    </label>
                    <div className="relative mt-2">
                      <Lock
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C4B5FD]"
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
                        className={cn(fieldClass, "pr-12")}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#AAB3C5] transition hover:bg-white/5 hover:text-[#C4B5FD]"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#906BFF]/25 bg-[#906BFF]/8 px-3.5 py-3 text-left text-xs leading-relaxed text-[#AAB3C5]">
                    <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[#C4B5FD]">
                      <KeyRound className="h-3.5 w-3.5" />
                      Owner notification
                    </div>
                    Enter your username or email. We&apos;ll notify the owner that you&apos;re requesting a
                    password reset. They can approve it and set a new password from Notifications.
                  </div>
                )}

                {mode === "login" ? (
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#AAB3C5]">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-black/30 text-[#906BFF] focus:ring-[#906BFF]/40"
                    />
                    Remember me on this device
                  </label>
                ) : null}
              </div>

              {error ? (
                <p
                  className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {message ? (
                <p
                  className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                  role="status"
                >
                  {message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "login-cta mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold tracking-wide transition",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {loading ? (
                  "Please wait…"
                ) : mode === "login" ? (
                  <>
                    LOGIN
                    <ArrowRight className="login-cta-arrow h-4 w-4" aria-hidden />
                  </>
                ) : (
                  "Send reset request"
                )}
              </button>

              <div className="mt-5 flex flex-col gap-2 text-center text-sm">
                <button
                  type="button"
                  className="text-[#C4B5FD] transition hover:text-white"
                  onClick={() => {
                    setMode(mode === "login" ? "forgot" : "login");
                    setError("");
                    setMessage("");
                    setShowPassword(false);
                  }}
                >
                  {mode === "login" ? "Reset my password" : "Back to sign in"}
                </button>
                {mode === "login" ? (
                  <button
                    type="button"
                    className="text-[#AAB3C5] transition hover:text-[#C4B5FD]"
                    onClick={() => {
                      setMode("pin");
                      setError("");
                      setMessage("");
                    }}
                  >
                    Forgot PIN
                  </button>
                ) : null}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
