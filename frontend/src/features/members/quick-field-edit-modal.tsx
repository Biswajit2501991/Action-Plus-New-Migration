"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";

export type QuickFieldType = "text" | "tel" | "number" | "date" | "month" | "email" | "select";

export type QuickFieldEditState = {
  memberId: string;
  fieldKey: string;
  label: string;
  type: QuickFieldType;
  value: string;
  options?: string[];
};

type Props = {
  edit: QuickFieldEditState | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (nextValue: string) => void | Promise<void>;
};

export function QuickFieldEditModal({ edit, saving, onClose, onSave }: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (edit) setValue(String(edit.value ?? ""));
  }, [edit]);

  if (!edit) return null;

  const isSelect = edit.type === "select";
  const inputType =
    edit.type === "month"
      ? "month"
      : edit.type === "date"
        ? "date"
        : edit.type === "number"
          ? "text"
          : edit.type === "email"
            ? "email"
            : edit.type === "tel"
              ? "tel"
              : "text";

  return (
    <ClassicalModal
      open
      title={`Update ${edit.label}`}
      description={
        edit.type === "month"
          ? "Updates Paid for Month for this member."
          : "This will update only this field for the selected member."
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => void onSave(value)}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {saving ? "Saving…" : "Update"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label>{edit.label}</Label>
        {isSelect ? (
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            {(edit.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt || "—"}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            type={inputType}
            inputMode={edit.type === "number" || edit.type === "tel" ? "numeric" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>
    </ClassicalModal>
  );
}
