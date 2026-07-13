import { cn } from "@/lib/utils";

export function MobileHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5 space-y-1">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700/80 dark:text-teal-300/80">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function MobilePanel({
  children,
  className,
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.35rem] border border-black/5 bg-white/85 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] dark:shadow-[0_16px_48px_-28px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      {accent ? <div className={cn("h-1 w-full", accent)} /> : null}
      {children}
    </section>
  );
}

export function MobileChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-slate-900 text-white dark:bg-teal-400 dark:text-slate-950"
          : "bg-white/70 text-slate-600 ring-1 ring-black/5 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10",
      )}
    >
      {children}
    </button>
  );
}
