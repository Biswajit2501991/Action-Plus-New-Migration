"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WHATSAPP_VARIABLE_KEYS } from "@/lib/domain/whatsapp-templates";
import { smsTypeLabel } from "@/lib/domain/whatsapp";
import type { Member } from "@/types";

export type WhatsAppPreviewState = {
  open: boolean;
  member: Member | null;
  templateKey: string;
  message: string;
};

export function MessagePreviewModal({
  preview,
  sending,
  onClose,
  onSend,
}: {
  preview: WhatsAppPreviewState;
  sending?: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  if (!preview.open || !preview.member) return null;
  const m = preview.member;
  const typeLabel = smsTypeLabel(preview.templateKey);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Message Preview"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl dark:border-border dark:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 pb-4 pt-5 dark:border-border dark:from-emerald-950/40 dark:via-card dark:to-sky-950/30">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl dark:bg-emerald-700/20" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <MessageCircle className="h-3 w-3" />
                WhatsApp · {typeLabel}
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-foreground">
                Message Preview
              </h2>
              <p className="truncate text-sm text-slate-600 dark:text-muted-foreground">
                {m.name || m.memberId}
                {m.mobile ? ` · ${m.mobile}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-2.5 py-1 text-sm text-slate-500 hover:bg-white/80 dark:hover:bg-muted"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-muted-foreground">
            Variables: {WHATSAPP_VARIABLE_KEYS.join(", ")}
          </p>
          <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 shadow-inner dark:border-border dark:bg-muted/40 dark:text-foreground">
            {preview.message || "—"}
          </div>
          {!m.mobile ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              Mobile number is missing — WhatsApp cannot open until a number is saved.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-border dark:bg-muted/20">
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={onSend}
            disabled={sending || !m.mobile || !preview.message}
          >
            {sending ? "Opening…" : "Send via WhatsApp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
