"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores";
import { ApiError } from "@/services/api/client";
import { pinStatus, savePinSetup } from "@/services/api/auth";
import { STAFF_PIN_QUESTIONS } from "@/features/auth/pin-questions";
import { SecretField } from "@/features/auth/secret-field";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "apg.pin-setup.dismissed";

export function StaffPinGate() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [enabled, setEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(true);
  const [hasAnswers, setHasAnswers] = useState(true);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const mustSetPin = Boolean(user?.mustSetPin);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void pinStatus()
      .then((status) => {
        if (cancelled) return;
        setEnabled(Boolean(status.enabled));
        setHasPin(Boolean(status.hasPin));
        setHasAnswers(Boolean(status.hasSecurityAnswers));
        if (status.mustSetPin || user.mustSetPin) setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.mustSetPin]);

  if (!user || !enabled) return null;
  const needsSetup = mustSetPin || !hasPin || !hasAnswers;
  if (!needsSetup) return null;

  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(DISMISS_KEY) === user.id;
  } catch {
    dismissed = false;
  }
  if (!mustSetPin && !open && dismissed) return null;

  const showForm = mustSetPin || open;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setError("PIN must be 4 to 8 digits.");
      return;
    }
    if (pin.trim() !== pinAgain.trim()) {
      setError("PINs do not match.");
      return;
    }
    if (!hasAnswers) {
      const missing = STAFF_PIN_QUESTIONS.some((q) => !String(answers[q.key] || "").trim());
      if (missing) {
        setError("Answer all five questions.");
        return;
      }
    }
    setSaving(true);
    try {
      const result = await savePinSetup({
        pin: pin.trim(),
        answers: hasAnswers ? undefined : answers,
      });
      if (result.user) setUser({ ...user, ...result.user, mustSetPin: false, hasPin: true, hasSecurityAnswers: true });
      else setUser({ ...user, mustSetPin: false, hasPin: true, hasSecurityAnswers: true });
      setHasPin(true);
      setHasAnswers(true);
      setOpen(false);
      toast.success("Login PIN saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save PIN");
    } finally {
      setSaving(false);
    }
  };

  if (!showForm) {
    return (
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2">
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-white px-4 py-3 shadow-lg dark:border-teal-500/30 dark:bg-slate-950">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Set a login PIN and your five answers so you can reset it yourself later.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  sessionStorage.setItem(DISMISS_KEY, user.id);
                } catch {
                  // ignore
                }
                setOpen(false);
                setEnabled(false);
              }}
            >
              Later
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Set PIN
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {mustSetPin ? "Set a new login PIN" : "Set your login PIN"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {mustSetPin
            ? "This temporary password only opens the app so you can choose a PIN."
            : "Your current password keeps working. The PIN is another way to sign in."}
        </p>
        <div className="mt-4 space-y-3">
          <SecretField id="setup-pin" label="PIN" value={pin} onChange={setPin} placeholder="4 to 8 digits" />
          <SecretField id="setup-pin-again" label="Confirm PIN" value={pinAgain} onChange={setPinAgain} />
          {!hasAnswers ? (
            STAFF_PIN_QUESTIONS.map((q) => (
              <label key={q.key} className="block text-sm text-slate-700 dark:text-slate-200">
                {q.label}
                <input
                  value={answers[q.key] || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  placeholder={q.placeholder}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-white/10 dark:bg-black/20"
                />
              </label>
            ))
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          {!mustSetPin ? (
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save PIN"}
          </Button>
        </div>
      </form>
    </div>
  );
}
