"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ClassicalModalProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  testId?: string;
  /** Extra node in the header (e.g. count badge). */
  headerAside?: React.ReactNode;
};

const SIZE = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

/** Upmarket modal — cool stone surface, ink typography, hairline chrome. */
export function ClassicalModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  testId,
  headerAside,
}: ClassicalModalProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="classical-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "classical-modal-panel relative w-full overflow-hidden rounded-[1.35rem]",
          "border border-slate-200/90 bg-white",
          "shadow-[0_36px_100px_-42px_rgba(15,23,42,0.72),0_0_0_1px_rgba(255,255,255,0.4)_inset]",
          "dark:border-white/10 dark:bg-[#0f141c] dark:shadow-[0_36px_100px_-42px_rgba(0,0,0,0.85)]",
          SIZE[size],
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-100/80 to-transparent dark:from-white/[0.04]" />
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/30" />

        <div className="relative flex items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4 sm:px-6 sm:py-5 dark:border-white/10">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Action Plus
            </p>
            <h2
              id={titleId}
              className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem] dark:text-slate-50"
            >
              {title}
            </h2>
            {description ? (
              <div className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {description}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/5 dark:hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative max-h-[min(68vh,36rem)] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        {footer ? (
          <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-slate-100/60 px-5 py-3.5 sm:px-6 dark:border-white/10 dark:from-black/20 dark:to-black/35">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
