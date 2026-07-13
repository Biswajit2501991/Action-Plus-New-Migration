import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AccentTone =
  | "emerald"
  | "amber"
  | "rose"
  | "orange"
  | "sky"
  | "teal"
  | "slate"
  | "fuchsia";

const TONE: Record<
  AccentTone,
  { shell: string; accent: string; glow: string; label: string; hint: string }
> = {
  emerald: {
    shell:
      "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white text-emerald-950 dark:border-emerald-500/20 dark:from-emerald-950/35 dark:to-slate-950 dark:text-emerald-50",
    accent: "bg-emerald-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_16px_40px_-18px_rgba(16,185,129,0.35)]",
    label: "text-emerald-800/80 dark:text-emerald-200/80",
    hint: "text-emerald-700/70 dark:text-emerald-200/55",
  },
  amber: {
    shell:
      "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white text-amber-950 dark:border-amber-500/20 dark:from-amber-950/35 dark:to-slate-950 dark:text-amber-50",
    accent: "bg-amber-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_16px_40px_-18px_rgba(245,158,11,0.35)]",
    label: "text-amber-800/80 dark:text-amber-200/80",
    hint: "text-amber-700/70 dark:text-amber-200/55",
  },
  rose: {
    shell:
      "border-rose-200/80 bg-gradient-to-br from-rose-50 to-white text-rose-950 dark:border-rose-500/20 dark:from-rose-950/35 dark:to-slate-950 dark:text-rose-50",
    accent: "bg-rose-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(244,63,94,0.12),0_16px_40px_-18px_rgba(244,63,94,0.35)]",
    label: "text-rose-800/80 dark:text-rose-200/80",
    hint: "text-rose-700/70 dark:text-rose-200/55",
  },
  orange: {
    shell:
      "border-orange-200/80 bg-gradient-to-br from-orange-50 to-white text-orange-950 dark:border-orange-500/20 dark:from-orange-950/35 dark:to-slate-950 dark:text-orange-50",
    accent: "bg-orange-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(249,115,22,0.12),0_16px_40px_-18px_rgba(249,115,22,0.3)]",
    label: "text-orange-800/80 dark:text-orange-200/80",
    hint: "text-orange-700/70 dark:text-orange-200/55",
  },
  sky: {
    shell:
      "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white text-sky-950 dark:border-sky-500/20 dark:from-sky-950/35 dark:to-slate-950 dark:text-sky-50",
    accent: "bg-sky-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(14,165,233,0.12),0_16px_40px_-18px_rgba(14,165,233,0.35)]",
    label: "text-sky-800/80 dark:text-sky-200/80",
    hint: "text-sky-700/70 dark:text-sky-200/55",
  },
  teal: {
    shell:
      "border-teal-200/80 bg-gradient-to-br from-teal-50 to-white text-teal-950 dark:border-teal-500/20 dark:from-teal-950/35 dark:to-slate-950 dark:text-teal-50",
    accent: "bg-teal-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(20,184,166,0.12),0_16px_40px_-18px_rgba(20,184,166,0.3)]",
    label: "text-teal-800/80 dark:text-teal-200/80",
    hint: "text-teal-700/70 dark:text-teal-200/55",
  },
  slate: {
    shell:
      "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white text-slate-900 dark:border-white/10 dark:from-slate-900/80 dark:to-slate-950 dark:text-slate-50",
    accent: "bg-slate-400 dark:bg-slate-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(148,163,184,0.1),0_16px_40px_-18px_rgba(15,23,42,0.8)]",
    label: "text-slate-600 dark:text-slate-300/80",
    hint: "text-slate-500 dark:text-slate-400/70",
  },
  fuchsia: {
    shell:
      "border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 to-white text-fuchsia-950 dark:border-fuchsia-500/20 dark:from-fuchsia-950/35 dark:to-slate-950 dark:text-fuchsia-50",
    accent: "bg-fuchsia-500",
    glow: "dark:shadow-[0_0_0_1px_rgba(217,70,239,0.12),0_16px_40px_-18px_rgba(217,70,239,0.3)]",
    label: "text-fuchsia-800/80 dark:text-fuchsia-200/80",
    hint: "text-fuchsia-700/70 dark:text-fuchsia-200/55",
  },
};

type AccentMetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: AccentTone;
  tag?: string;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
};

/** Upmarket metric / status card — glass surface + thin accent bar (light & dark). */
export function AccentMetricCard({
  label,
  value,
  hint,
  tone = "slate",
  tag,
  onClick,
  className,
  children,
}: AccentMetricCardProps) {
  const t = TONE[tone];
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group overflow-hidden rounded-2xl border text-left shadow-sm transition",
        t.shell,
        t.glow,
        onClick && "hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <div className={cn("h-1 w-full", t.accent)} />
      <div className="space-y-2 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.14em]",
              t.label,
            )}
          >
            {label}
          </p>
          {tag ? (
            <span className="rounded-md border border-black/5 bg-black/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-current/60 dark:border-white/10 dark:bg-white/5 dark:text-white/65">
              {tag}
            </span>
          ) : null}
        </div>
        <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
        {hint ? <div className={cn("text-xs", t.hint)}>{hint}</div> : null}
        {children}
      </div>
    </Comp>
  );
}

export function statusAccentTone(
  status: "Active" | "Hold" | "Deactivated" | "Cancelled" | string,
): AccentTone {
  if (status === "Active") return "emerald";
  if (status === "Hold") return "amber";
  if (status === "Deactivated") return "rose";
  if (status === "Cancelled") return "slate";
  return "slate";
}
