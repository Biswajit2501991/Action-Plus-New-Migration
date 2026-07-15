"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type State = "form" | "saving" | "done" | "error";

export default function PublicVisitorIntakePage() {
  const params = useParams();
  const gymCode = String(params?.gymCode || "").trim();

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<State>("form");
  const [message, setMessage] = useState("");

  const title = useMemo(() => (gymCode ? `Visit · ${gymCode}` : "Visitor intake"), [gymCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gymCode) {
      setState("error");
      setMessage("Missing gym code in the link.");
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
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Full name *</span>
              <input
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Mobile *</span>
              <input
                required
                inputMode="numeric"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
                autoComplete="tel"
                placeholder="10-digit mobile"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
              >
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Email (optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Date of birth (optional)</span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-teal-400/40 focus:ring-2"
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
