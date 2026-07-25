"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  applyRedo,
  applyUndo,
  useHistoryStore,
} from "@/lib/history-stack";

export function HistoryControls() {
  const qc = useQueryClient();
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      const editing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);
      // Allow app-level undo even from inputs (Production Undo button behaviour).
      if (key === "z" && !e.shiftKey) {
        if (!canUndo) return;
        e.preventDefault();
        const snap = applyUndo(qc);
        if (snap) toast.message(`Undid: ${snap.label}`);
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        if (!canRedo) return;
        e.preventDefault();
        const snap = applyRedo(qc);
        if (snap) toast.message(`Redid: ${snap.label}`);
        return;
      }
      void editing;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, canUndo, canRedo]);

  const btn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold tracking-tight transition duration-150 disabled:cursor-not-allowed disabled:opacity-40";

  const active =
    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.98] dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300";

  const idle =
    "bg-slate-200/80 text-slate-500 dark:bg-white/10 dark:text-slate-400";

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-slate-300/80 bg-slate-100/90 p-1 shadow-sm dark:border-teal-400/25 dark:bg-teal-950/30"
      title="Undo / Redo (⌘Z / ⌘⇧Z)"
    >
      <button
        type="button"
        className={cn(btn, canUndo ? active : idle)}
        disabled={!canUndo}
        aria-label="Undo"
        data-testid="history-undo"
        onClick={() => {
          const snap = applyUndo(qc);
          if (!snap) return;
          toast.message(`Undid: ${snap.label}`);
        }}
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span className="hidden sm:inline">Undo</span>
      </button>
      <button
        type="button"
        className={cn(btn, canRedo ? active : idle)}
        disabled={!canRedo}
        aria-label="Redo"
        data-testid="history-redo"
        onClick={() => {
          const snap = applyRedo(qc);
          if (!snap) return;
          toast.message(`Redid: ${snap.label}`);
        }}
      >
        <Redo2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span className="hidden sm:inline">Redo</span>
      </button>
    </div>
  );
}
