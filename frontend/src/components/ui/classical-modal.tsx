"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ClassicalModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  testId?: string;
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
}: ClassicalModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="classical-modal-title"
      data-testid={testId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_28px_90px_-40px_rgba(15,23,42,0.65)] dark:border-white/10 dark:bg-[#0f141c]",
          SIZE[size],
        )}
      >
        <div className="absolute inset-x-8 top-0 h-px bg-slate-300/80 dark:bg-white/20" />
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Action Plus
            </p>
            <h2
              id="classical-modal-title"
              className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(78vh,720px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/80 px-5 py-3.5 dark:border-white/10 dark:bg-black/25">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
