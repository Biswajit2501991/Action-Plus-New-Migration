"use client";

import { Undo2, Redo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHistoryStore } from "@/stores/history-store";

export function UndoRedoControls() {
  const qc = useQueryClient();
  const past = useHistoryStore((s) => s.past);
  const future = useHistoryStore((s) => s.future);
  const busy = useHistoryStore((s) => s.busy);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["members"] }),
      qc.invalidateQueries({ queryKey: ["users"] }),
      qc.invalidateQueries({ queryKey: ["settings"] }),
      qc.invalidateQueries({ queryKey: ["finance"] }),
    ]);
  };

  return (
    <div className="hidden items-center gap-0.5 sm:flex">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-xl"
        disabled={!past.length || busy}
        title="Undo last saved change (up to 5 steps)"
        aria-label="Undo"
        onClick={async () => {
          try {
            const snap = await undo();
            if (!snap) {
              toast.message("Nothing to roll back.");
              return;
            }
            await refresh();
            toast.success("Undo applied.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Undo failed");
          }
        }}
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-xl"
        disabled={!future.length || busy}
        title="Redo (up to 5 steps)"
        aria-label="Redo"
        onClick={async () => {
          try {
            const snap = await redo();
            if (!snap) {
              toast.message("Nothing to redo.");
              return;
            }
            await refresh();
            toast.success("Redo applied.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Redo failed");
          }
        }}
      >
        <Redo2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
