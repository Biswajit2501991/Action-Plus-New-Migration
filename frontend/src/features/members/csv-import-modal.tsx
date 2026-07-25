"use client";

import { Button } from "@/components/ui/button";
import { ClassicalModal } from "@/components/ui/classical-modal";
import type { CsvImportPreparedRow } from "@/lib/domain/csv-import";

type Props = {
  open: boolean;
  fileName: string;
  rows: CsvImportPreparedRow[];
  summary: { added: number; updated: number; skipped: number };
  saving?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function CsvImportModal({
  open,
  fileName,
  rows,
  summary,
  saving,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  const preview = rows.slice(0, 40);

  return (
    <ClassicalModal
      open={open}
      title="Import CSV"
      description={`${fileName} · Add ${summary.added}, Update ${summary.updated}, Skip ${summary.skipped}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void onConfirm()}
            disabled={saving || summary.added + summary.updated === 0}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            Apply import
          </Button>
        </>
      }
    >
      <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Row</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Member</th>
              <th className="px-3 py-2 font-semibold">Mobile</th>
              <th className="px-3 py-2 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.rowNo} className="border-t border-slate-100 dark:border-white/5">
                <td className="px-3 py-1.5 tabular-nums">{r.rowNo}</td>
                <td className="px-3 py-1.5 capitalize">{r.action}</td>
                <td className="px-3 py-1.5">
                  {r.member?.name || "—"}
                  {r.member?.memberId ? (
                    <span className="ml-1 text-slate-400">({r.member.memberId})</span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{r.member?.mobile || "—"}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > preview.length ? (
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-white/5">
            Showing first {preview.length} of {rows.length} rows.
          </p>
        ) : null}
      </div>
    </ClassicalModal>
  );
}
