"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import type { Visitor } from "@/types";

const GENDERS = ["Male", "Female", "Other"];

export type VisitorFormValues = {
  id: string;
  fullName: string;
  email: string;
  dob: string;
  mobile: string;
  gender: string;
  callBackRequired: boolean;
  tentativeJoiningDate: string;
  status: string;
  addedAt: string;
  assignedGymCodeId?: string;
};

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string) {
  const s = v.trim();
  return /^\d{10}$/.test(s) || /^\+91\d{10}$/.test(s);
}

function visitorToForm(visitor: Visitor | null, branchId?: string): VisitorFormValues {
  return {
    id: visitor?.id || "",
    fullName: String(visitor?.fullName || visitor?.name || ""),
    email: String(visitor?.email || ""),
    dob: String(visitor?.dob || ""),
    mobile: String(visitor?.mobile || ""),
    gender: String(visitor?.gender || ""),
    callBackRequired: Boolean(visitor?.callBackRequired),
    tentativeJoiningDate: String(visitor?.tentativeJoiningDate || ""),
    status: String(visitor?.status || "New"),
    addedAt: String(visitor?.addedAt || visitor?.visitDate || ""),
    assignedGymCodeId: String(visitor?.assignedGymCodeId || branchId || ""),
  };
}

type Props = {
  open: boolean;
  visitor: Visitor | null;
  branchId?: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: VisitorFormValues) => void | Promise<void>;
};

export function VisitorFormModal({
  open,
  visitor,
  branchId,
  saving,
  onClose,
  onSave,
}: Props) {
  const initial = useMemo(() => visitorToForm(visitor, branchId), [visitor, branchId]);
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setForm(visitorToForm(visitor, branchId));
      setTouched({});
    }
  }, [open, visitor, branchId]);

  const errors = useMemo(
    () => ({
      fullName: !form.fullName.trim() ? "Full name is required." : "",
      email: !form.email.trim()
        ? "Email is required."
        : !isValidEmail(form.email)
          ? "Enter a valid email."
          : "",
      dob: !form.dob.trim() ? "Date of birth is required." : "",
      mobile: !form.mobile.trim()
        ? "Mobile is required."
        : !isValidPhone(form.mobile)
          ? "Enter a valid 10-digit mobile."
          : "",
      gender: !form.gender.trim() ? "Gender is required." : "",
    }),
    [form],
  );

  const showErr = (key: keyof typeof errors) => touched[key] && errors[key];

  const submit = async () => {
    if (Object.values(errors).some(Boolean)) {
      setTouched({ fullName: true, email: true, dob: true, mobile: true, gender: true });
      return;
    }
    await onSave(form);
  };

  return (
    <ClassicalModal
      open={open}
      title={visitor ? "Edit visitor" : "Add visitor"}
      description="Capture enquiry details for follow-up and conversion."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {saving ? "Saving…" : "Save visitor"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Full name*</Label>
          <Input
            className="mt-1"
            value={form.fullName}
            onBlur={() => setTouched((p) => ({ ...p, fullName: true }))}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
          />
          {showErr("fullName") ? (
            <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>
          ) : null}
        </div>
        <div>
          <Label>Email*</Label>
          <Input
            className="mt-1"
            type="email"
            value={form.email}
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          {showErr("email") ? <p className="mt-1 text-xs text-rose-600">{errors.email}</p> : null}
        </div>
        <div>
          <Label>Date of birth*</Label>
          <Input
            className="mt-1"
            type="date"
            value={form.dob}
            onBlur={() => setTouched((p) => ({ ...p, dob: true }))}
            onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
          />
          {showErr("dob") ? <p className="mt-1 text-xs text-rose-600">{errors.dob}</p> : null}
        </div>
        <div>
          <Label>Mobile*</Label>
          <Input
            className="mt-1"
            value={form.mobile}
            onBlur={() => setTouched((p) => ({ ...p, mobile: true }))}
            onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
          />
          {showErr("mobile") ? (
            <p className="mt-1 text-xs text-rose-600">{errors.mobile}</p>
          ) : null}
        </div>
        <div>
          <Label>Gender*</Label>
          <Select
            className="mt-1"
            value={form.gender}
            onBlur={() => setTouched((p) => ({ ...p, gender: true }))}
            onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
          >
            <option value="">Select</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          {showErr("gender") ? (
            <p className="mt-1 text-xs text-rose-600">{errors.gender}</p>
          ) : null}
        </div>
        <div>
          <Label>Call back required</Label>
          <div className="mt-2 flex gap-4 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-white/10">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={form.callBackRequired}
                onChange={() => setForm((p) => ({ ...p, callBackRequired: true }))}
              />
              Yes
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={!form.callBackRequired}
                onChange={() => setForm((p) => ({ ...p, callBackRequired: false }))}
              />
              No
            </label>
          </div>
        </div>
        <div>
          <Label>Tentative joining</Label>
          <Input
            className="mt-1"
            type="date"
            value={form.tentativeJoiningDate}
            onChange={(e) =>
              setForm((p) => ({ ...p, tentativeJoiningDate: e.target.value }))
            }
          />
        </div>
      </div>
    </ClassicalModal>
  );
}
