"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type State = "form" | "saving" | "done" | "error";

const PLAN_OPTIONS = ["Basic", "Personal Training"] as const;
const GOAL_OPTIONS = [
  "Weight loss",
  "Recovering from injury or Medical condition?",
] as const;

const fieldClass =
  "box-border block h-11 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2";

/**
 * Live + submit validation:
 * 10 digits | 11 starting with 0 | 12 starting with 91 | +91 + 10 digits (13 chars).
 */
function validateMobile(raw: string): { ok: true; normalized: string } | { ok: false; message: string } {
  const compact = String(raw || "")
    .trim()
    .replace(/[\s-]/g, "");
  if (!compact) return { ok: false, message: "Enter a mobile number." };

  if (compact.startsWith("+")) {
    if (!/^\+91\d{10}$/.test(compact)) {
      return {
        ok: false,
        message: "Use +91 followed by 10 digits (e.g. +919876543210).",
      };
    }
    return { ok: true, normalized: compact.slice(3) };
  }

  if (!/^\d+$/.test(compact)) {
    return { ok: false, message: "Use digits only, or +91 before a 10-digit mobile." };
  }

  if (compact.length === 10) return { ok: true, normalized: compact };
  if (compact.length === 11) {
    if (!compact.startsWith("0")) {
      return { ok: false, message: "11-digit numbers must start with 0 (e.g. 09876543210)." };
    }
    return { ok: true, normalized: compact.slice(1) };
  }
  if (compact.length === 12) {
    if (!compact.startsWith("91")) {
      return { ok: false, message: "12-digit numbers must start with 91 (e.g. 919876543210)." };
    }
    return { ok: true, normalized: compact.slice(2) };
  }
  if (compact.length === 13) {
    return {
      ok: false,
      message: "For 13 characters use +91 before the 10-digit mobile (e.g. +919876543210).",
    };
  }
  if (compact.length > 13) {
    return { ok: false, message: "Too long — use 10–12 digits or +91…." };
  }
  return { ok: false, message: "Keep typing a complete mobile number." };
}

function mobileLiveHint(raw: string): string | null {
  const compact = String(raw || "")
    .trim()
    .replace(/[\s-]/g, "");
  if (!compact) return null;
  if (compact.startsWith("+")) {
    if (compact.length >= 3 && !compact.startsWith("+91")) return "Numbers with + must start with +91.";
    if (compact.length > 13) return "Too long — use +91 and 10 digits.";
    if (compact.length === 13) {
      const v = validateMobile(compact);
      return v.ok ? null : v.message;
    }
    return null;
  }
  if (!/^\d+$/.test(compact)) return "Use digits only, or start with +91.";
  if (compact.length > 13) return "Too long — use 10–12 digits or +91….";
  if ([10, 11, 12].includes(compact.length)) {
    const v = validateMobile(compact);
    return v.ok ? null : v.message;
  }
  if (compact.length === 13) {
    return "For 13 characters use +91 before the 10-digit mobile.";
  }
  return null;
}

export default function PublicVisitorIntakePage() {
  const params = useParams();
  const gymCode = String(params?.gymCode || "").trim();

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileTouched, setMobileTouched] = useState(false);
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [interestPlan, setInterestPlan] = useState("");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<State>("form");
  const [message, setMessage] = useState("");

  const title = useMemo(() => (gymCode ? `Visit · ${gymCode}` : "Visitor intake"), [gymCode]);
  const mobileHint = useMemo(() => mobileLiveHint(mobile), [mobile]);
  const showMobileError = Boolean(mobileHint && (mobileTouched || state === "error"));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gymCode) {
      setState("error");
      setMessage("Missing gym code in the link.");
      return;
    }
    setMobileTouched(true);
    const mobileCheck = validateMobile(mobile);
    if (!mobileCheck.ok) {
      setState("error");
      setMessage(mobileCheck.message);
      return;
    }
    if (!interestPlan) {
      setState("error");
      setMessage("Select a plan: Basic or Personal Training.");
      return;
    }
    if (!goal) {
      setState("error");
      setMessage("Select a goal from the list.");
      return;
    }

    setState("saving");
    setMessage("");
    try {
      const res = await fetch(`/api/public/visitors/${encodeURIComponent(gymCode)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          mobile,
          gender: gender || undefined,
          email: email || undefined,
          dob: dob || undefined,
          interestPlan,
          goal,
          notes: notes || undefined,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setState("error");
        setMessage(data.message || data.error || "Could not save. Please try again.");
        return;
      }
      setState("done");
      setMessage(data.message || "Thanks — front desk will contact you.");
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/80">
          Action Plus
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">Fill your details for the front desk.</p>

        {state === "done" ? (
          <div className="mt-8 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 text-sm text-teal-100">
            {message}
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Full name *</span>
              <input
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={fieldClass}
                autoComplete="name"
              />
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Mobile *</span>
              <input
                required
                inputMode="tel"
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  if (state === "error") setState("form");
                }}
                onBlur={() => setMobileTouched(true)}
                className={fieldClass}
                autoComplete="tel"
                placeholder="10 digits, or 0… / 91… / +91…"
                aria-invalid={showMobileError}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                10 digits · 11 with 0 · 12 with 91 · or +91 + 10 digits
              </span>
              {showMobileError ? (
                <span className="mt-1 block text-[11px] text-rose-300">{mobileHint}</span>
              ) : null}
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Plan *</span>
              <select
                required
                value={interestPlan}
                onChange={(e) => setInterestPlan(e.target.value)}
                className={fieldClass}
              >
                <option value="">Select plan</option>
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Goal *</span>
              <select
                required
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className={fieldClass}
              >
                <option value="">Select goal</option>
                {GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={fieldClass}
              >
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Email (optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                autoComplete="email"
              />
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Date of birth (optional)</span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={`${fieldClass} appearance-none`}
              />
            </label>
            <label className="block w-full text-sm">
              <span className="mb-1 block text-slate-300">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="box-border block w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
              />
            </label>
            {/* honeypot */}
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden="true"
            />
            {state === "error" && message ? (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={state === "saving"}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-teal-400 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
            >
              {state === "saving" ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
