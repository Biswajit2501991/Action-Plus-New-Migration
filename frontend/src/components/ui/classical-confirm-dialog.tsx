"use client";

import { Button } from "@/components/ui/button";
import { ClassicalModal } from "@/components/ui/classical-modal";

type ClassicalConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Optional detail block under the description. */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  /** Rose destructive OK for delete / irreversible actions. */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
};

/** Classic Cancel / OK confirm — uses the upmarket ClassicalModal chrome. */
export function ClassicalConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  confirming,
  destructive,
  onCancel,
  onConfirm,
  testId,
}: ClassicalConfirmDialogProps) {
  return (
    <ClassicalModal
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      size="sm"
      testId={testId}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={confirming}
            className={
              destructive
                ? undefined
                : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            }
          >
            {confirming ? "Please wait…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Please confirm to continue, or cancel to go back.
        </p>
      )}
    </ClassicalModal>
  );
}
