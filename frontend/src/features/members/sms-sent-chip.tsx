"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Truncated “Sent … by …” chip; tap/click expands full text (tablet-friendly). */
export function SmsSentChip({
  text,
  className,
  maxWidthClass = "max-w-[240px]",
}: {
  text: string;
  className?: string;
  maxWidthClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  return (
    <button
      type="button"
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-left text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        expanded ? "max-w-full whitespace-normal break-words" : cn(maxWidthClass, "truncate"),
        className,
      )}
      title={expanded ? "Tap to collapse" : text}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setExpanded((v) => !v);
      }}
    >
      {text}
    </button>
  );
}
