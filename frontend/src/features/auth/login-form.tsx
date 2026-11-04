"use client";

import { FormEvent, PointerEvent, useEffect, useState } from "react";
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

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty("--mx", `${x}%`);
    e.currentTarget.style.setProperty("--my", `${y}%`);
  }

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
      onPointerMove={onPointerMove}
    >
      <div className="login-colour-stage pointer-events-none fixed inset-0" aria-hidden>
        <div className="login-colour-wash absolute inset-0" />
        <div className="login-cursor-glow" />
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
        <span className="login-orb login-orb-c" />
        <span className="login-ring login-ring-a" />
        <span className="login-ring login-ring-b" />
        <span className="login-streak" />
        <span className="login-dot" style={{ left: "18%", top: "24%" }} />
        <span className="login-dot" style={{ left: "72%", top: "32%", animationDelay: "1.2s" }} />
        <span className="login-dot" style={{ left: "44%", top: "68%", animationDelay: "0.6s" }} />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[100dvh] min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-2 lg:gap-12 lg:px-8">
        <div className="login-brand hidden text-left lg:block">
          <div className="login-logo relative h-16 w-16 overflow-hidden rounded-full ring-1 ring-[#C4B5FD]/35">
            <BranchLogo
              src={DEFAULT_LOGO_PATH}
              alt={DEFAULT_GYM_DISPLAY_NAME}
              className="h-full w-full"
            />
          </div>
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C4B5FD]">
            {DEFAULT_GYM_DISPLAY_NAME}
          </p>
          <h1
            className="mt-3 text-5xl font-semibold tracking-tight text-white xl:text-6xl"
            style={{ fontFamily: "var(--font-login-display), var(--font-login-sans), sans-serif" }}
          >
            Welcome
            <span className="block bg-gradient-to-r from-white via-[#C4B5FD] to-[#906BFF] bg-clip-text text-transparent">
              Back
            </span>
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-[#AAB3C5]">
            Your Journey. Your Strength. Your Progress.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="login-panel relative w-full max-w-[440px] justify-self-center rounded-[1.75rem] border border-[#C4B5FD]/25 bg-[#0B1020]/80 p-7 shadow-[0_40px_100px_-28px_rgba(0,0,0,0.75),0_0_80px_-24px_rgba(144,107,255,0.45)] backdrop-blur-2xl sm:p-9 lg:justify-self-end"
        >
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="login-logo relative h-14 w-14 overflow-hidden rounded-full ring-1 ring-[#C4B5FD]/30 lg:hidden">
              <BranchLogo
                src={DEFAULT_LOGO_PATH}
                alt={DEFAULT_GYM_DISPLAY_NAME}
                className="h-full w-full"
              />
            </div>
            <h2
              className="mt-4 text-2xl font-semibold tracking-tight text-white lg:mt-0"
              style={{ fontFamily: "var(--font-login-display), var(--font-login-sans), sans-serif" }}
            >
              Sign in
            </h2>
            <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-[#AAB3C5] lg:hidden">
              Your Journey. Your Strength. Your Progress.
            </p>
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
