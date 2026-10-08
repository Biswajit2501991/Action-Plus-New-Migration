"use client";

import { useState } from "react";
import { ApiError } from "@/services/api/client";
import {
  recoverPinPassword,
  recoverPinQuestions,
  requestPinReset,
  setRecoveredPin,
} from "@/services/api/auth";
import { cn } from "@/lib/utils";
import { STAFF_PIN_QUESTIONS } from "@/features/auth/pin-questions";
import { SecretField } from "@/features/auth/secret-field";

type Stage = "password" | "questions" | "set-pin" | "request-owner" | "sent";

export function PinResetPanel({
  identifier,
  onIdentifier,
  onBack,
}: {
  identifier: string;
  onIdentifier: (value: string) => void;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<Stage>("password");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recoveryToken, setRecoveryToken] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : "Could not continue");
  };

  const onPassword = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await recoverPinPassword(identifier.trim(), password);
      if (result.stage === "set-pin" && result.recoveryToken) {
        setRecoveryToken(result.recoveryToken);
        setStage("set-pin");
        return;
      }
      if (result.stage === "questions") {
        setStage("questions");
        return;
      }
      if (result.stage === "request-owner") {
        setStage("request-owner");
        return;
      }
      setAttemptsLeft(result.attemptsLeft ?? null);
      setError("That does not match your password or PIN.");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const onQuestions = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await recoverPinQuestions(identifier.trim(), answers);
      if (result.stage === "set-pin" && result.recoveryToken) {
        setRecoveryToken(result.recoveryToken);
        setStage("set-pin");
        return;
      }
      setStage("request-owner");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const onSetPin = async () => {
    setError("");
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setError("PIN must be 4 to 8 digits.");
      return;
    }
    if (pin.trim() !== pinAgain.trim()) {
      setError("PINs do not match.");
      return;
    }
    setLoading(true);
    try {
      await setRecoveredPin(recoveryToken, pin.trim());
      setStage("sent");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  const onRequest = async () => {
    setError("");
    setLoading(true);
    try {
      await requestPinReset(identifier.trim());
      setStage("sent");
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-4 text-left">
      <div>
        <label htmlFor="pin-identifier" className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
          Username
        </label>
        <input
          id="pin-identifier"
          value={identifier}
          onChange={(e) => onIdentifier(e.target.value)}
          disabled={stage !== "password"}
          className={cn(
            "mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-3.5 text-sm text-white",
            "placeholder:text-slate-500 outline-none focus:border-teal-400/50",
          )}
          placeholder="Login ID or email"
        />
      </div>

      {stage === "password" ? (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-slate-300">
            Enter your current password or PIN.
          </p>
          <SecretField
            id="remembered-password"
            label="Password or PIN"
            value={password}
            onChange={setPassword}
            placeholder="Current password or current PIN"
            dark
          />
          {attemptsLeft != null ? (
            <p className="text-xs text-slate-400">{attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left, then security questions.</p>
          ) : null}
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <button type="button" onClick={() => void onPassword()} disabled={loading || !identifier.trim() || !password} className="h-12 w-full rounded-2xl bg-teal-400 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {loading ? "Checking…" : "Continue"}
          </button>
        </div>
      ) : null}

      {stage === "questions" ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-300">
            Answer all five. At least 4 correct answers let you set a new PIN.
          </p>
          {STAFF_PIN_QUESTIONS.map((q) => (
            <label key={q.key} className="block text-xs text-slate-300">
              {q.label}
              <input
                value={answers[q.key] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                placeholder={q.placeholder}
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none"
              />
            </label>
          ))}
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <button type="button" onClick={() => void onQuestions()} disabled={loading} className="h-12 w-full rounded-2xl bg-teal-400 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {loading ? "Checking…" : "Check answers"}
          </button>
        </div>
      ) : null}

      {stage === "set-pin" ? (
        <div className="space-y-4">
          <SecretField id="new-pin" label="New PIN" value={pin} onChange={setPin} placeholder="4 to 8 digits" dark />
          <SecretField id="new-pin-again" label="Confirm PIN" value={pinAgain} onChange={setPinAgain} placeholder="Repeat the PIN" dark />
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <button type="button" onClick={() => void onSetPin()} disabled={loading} className="h-12 w-full rounded-2xl bg-teal-400 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {loading ? "Saving…" : "Set PIN"}
          </button>
        </div>
      ) : null}

      {stage === "request-owner" ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-300">
            The answers did not match. Ask the owner to reset your PIN. You will get a temporary password that works for 6 hours, then you set a new PIN.
          </p>
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <button type="button" disabled={loading} onClick={() => void onRequest()} className="h-12 w-full rounded-2xl bg-teal-400 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {loading ? "Sending…" : "Request owner reset"}
          </button>
        </div>
      ) : null}

      {stage === "sent" ? (
        <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {recoveryToken
            ? "Your new PIN is saved. Sign in with your username and that PIN. Your old password still works."
            : "Request sent. The owner can share a temporary password. Sign in with it within 6 hours and set a new PIN."}
        </p>
      ) : null}

      <button type="button" className="w-full text-center text-sm text-teal-300/90 hover:text-teal-200" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  );
}
