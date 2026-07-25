import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-primary/10 text-primary",
        variant === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        variant === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        variant === "danger" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
        variant === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <EmptyState
      title={`${feature} is coming soon`}
      description="This module is ready in the navigation, but the existing Action Plus backend does not expose APIs for it yet. The UI will light up automatically when support is added."
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  tone?: "emerald" | "amber" | "rose" | "orange" | "sky" | "teal" | "slate" | "fuchsia";
}) {
  const accents: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    orange: "bg-orange-500",
    sky: "bg-sky-500",
    teal: "bg-teal-500",
    slate: "bg-slate-400 dark:bg-slate-500",
    fuchsia: "bg-fuchsia-500",
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 text-slate-900 shadow-sm dark:border-white/8 dark:from-slate-950/80 dark:to-slate-950 dark:text-slate-50 dark:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)]">
      <div className={cn("h-1 w-full", accents[tone] || accents.slate)} />
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-50">
          {value}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {trend ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">{trend}</span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}
