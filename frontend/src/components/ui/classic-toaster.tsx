"use client";

import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Toaster } from "sonner";

/** Upmarket Sonner toasts — stone surface, ink type, hairline chrome. */
export function ClassicToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      expand={false}
      visibleToasts={4}
      gap={10}
      offset={{ top: "4.75rem", right: "1rem" }}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />,
        error: <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" strokeWidth={2} />,
        info: <Info className="h-4 w-4 text-slate-600 dark:text-slate-300" strokeWidth={2} />,
        warning: <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={2} />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-slate-500" strokeWidth={2} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "classic-toast group pointer-events-auto relative flex w-[min(calc(100vw-2rem),22rem)] items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 pr-11 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.55)] backdrop-blur-sm",
          title: "text-[13px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50",
          description: "mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400",
          content: "flex min-w-0 flex-1 flex-col",
          icon: "mt-0.5 shrink-0",
          closeButton:
            "classic-toast-close absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200/90 bg-white/90 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:hover:text-slate-200",
          actionButton:
            "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200",
          cancelButton:
            "rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          success: "classic-toast-success border-emerald-200/80 bg-gradient-to-b from-emerald-50/95 to-white dark:border-emerald-500/20 dark:from-emerald-950/40 dark:to-[#0f141c]",
          error: "classic-toast-error border-rose-200/80 bg-gradient-to-b from-rose-50/95 to-white dark:border-rose-500/20 dark:from-rose-950/35 dark:to-[#0f141c]",
          info: "classic-toast-info border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white dark:border-white/10 dark:from-white/[0.05] dark:to-[#0f141c]",
          warning: "classic-toast-warning border-amber-200/80 bg-gradient-to-b from-amber-50/95 to-white dark:border-amber-500/20 dark:from-amber-950/35 dark:to-[#0f141c]",
          loading: "classic-toast-info border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white dark:border-white/10 dark:from-white/[0.05] dark:to-[#0f141c]",
        },
      }}
    />
  );
}
