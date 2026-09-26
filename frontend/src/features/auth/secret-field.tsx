"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function SecretField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  dark = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  dark?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "text-xs font-medium",
          dark ? "uppercase tracking-[0.14em] text-slate-400" : "text-slate-600",
        )}
      >
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn(
            "h-11 w-full rounded-xl border px-3 pr-11 text-sm outline-none",
            dark
              ? "border-white/10 bg-black/25 text-white placeholder:text-slate-500 focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/25"
              : "border-slate-200 bg-white text-slate-900 focus:border-slate-400",
          )}
        />
        <button
          type="button"
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5",
            dark ? "text-slate-400 hover:text-teal-200" : "text-slate-500 hover:text-slate-800",
          )}
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide" : "Show"}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
