"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  restoreAppSnapshot,
  useHistoryStore,
} from "@/lib/history-stack";

export function HistoryControls() {
  const qc = useQueryClient();
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        disabled={!canUndo}
        title="Undo"
        aria-label="Undo"
        onClick={() => {
          const snap = undo();
          if (!snap) return;
          restoreAppSnapshot(qc, snap);
          toast.message(`Undid: ${snap.label}`);
        }}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        disabled={!canRedo}
        title="Redo"
        aria-label="Redo"
        onClick={() => {
          const snap = redo();
          if (!snap) return;
          restoreAppSnapshot(qc, snap);
          toast.message(`Redid: ${snap.label}`);
        }}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
