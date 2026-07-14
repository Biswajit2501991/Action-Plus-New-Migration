"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { GymCode, Visitor } from "@/types";

const DEFAULT_GENDERS = ["Male", "Female", "Other"];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string) {
  const s = v.trim();
  return /^\d{10}$/.test(s) || /^\+91\d{10}$/.test(s);
}

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
  assignedGymCodeId: string;
  addedAt: string;
  lastCalledAt?: string;
  lastCalledBy?: string;
  convertedAt?: string;
  convertedMemberId?: string;
};

type Props = {
  visitor: Visitor | null;
  saving?: boolean;
  genders?: string[];
  gymCodes?: GymCode[];
  lockBranchId?: string | null;
  canPickBranch?: boolean;
  onClose: () => void;
  onSave: (values: VisitorFormValues) => Promise<void>;
};

function visitorToForm(visitor: Visitor | null, lockBranchId?: string | null): VisitorFormValues {
  return {
    id: String(visitor?.id || ""),
    fullName: String(visitor?.fullName || visitor?.name || ""),
    email: String(visitor?.email || ""),
    dob: String(visitor?.dob || "").slice(0, 10),
    mobile: String(visitor?.mobile || ""),
    gender: String(visitor?.gender || ""),
    callBackRequired: Boolean(visitor?.callBackRequired),
    tentativeJoiningDate: String(visitor?.tentativeJoiningDate || "").slice(0, 10),
    status: String(visitor?.status || "New"),
    assignedGymCodeId: String(
      visitor?.assignedGymCodeId || lockBranchId || "",
    ),
    addedAt: String(visitor?.addedAt || ""),
    lastCalledAt: visitor?.lastCalledAt ? String(visitor.lastCalledAt) : undefined,
    lastCalledBy: visitor?.lastCalledBy ? String(visitor.lastCalledBy) : undefined,
    convertedAt: visitor?.convertedAt ? String(visitor.convertedAt) : undefined,
    convertedMemberId: visitor?.convertedMemberId
      ? String(visitor.convertedMemberId)
      : undefined,
  };
}

export function VisitorFormModal({
  visitor,
  saving = false,
  genders,
  gymCodes = [],
  lockBranchId,
  canPickBranch = true,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState(() => visitorToForm(visitor, lockBranchId));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const genderOptions = genders?.length ? genders : DEFAULT_GENDERS;

  const errors = useMemo(
    () => ({
      fullName: !form.fullName.trim() ? "Full Name is required." : "",
      email: !form.email.trim()
        ? "Email is required."
        : !isValidEmail(form.email)
          ? "Enter a valid email."
          : "",
      dob: !form.dob.trim() ? "Date of Birth is required." : "",
      mobile: !form.mobile.trim()
        ? "Mobile Number is required."
        : !isValidPhone(form.mobile)
          ? "Enter a valid mobile number."
          : "",
      gender: !form.gender.trim() ? "Gender is required." : "",
      assignedGymCodeId:
        canPickBranch && !String(form.assignedGymCodeId || "").trim()
          ? "Gym Branch is required."
          : "",
    }),
    [form, canPickBranch],
  );

  const submit = async () => {
    if (saving) return;
    if (Object.values(errors).some(Boolean)) {
      setTouched({
        fullName: true,
        email: true,
        dob: true,
        mobile: true,
        gender: true,
        assignedGymCodeId: true,
      });
      return;
    }
    await onSave({
      ...form,
      assignedGymCodeId: String(
        form.assignedGymCodeId || lockBranchId || "",
      ).trim(),
    });
  };

  const showErr = (key: keyof typeof errors) => touched[key] && errors[key];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">
            {visitor ? "Edit Visitor" : "Add Visitor"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-accent"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Full Name*</label>
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
            <label className="text-sm font-medium">Email*</label>
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            {showErr("email") ? (
              <p className="mt-1 text-xs text-rose-600">{errors.email}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium">Date of Birth*</label>
            <Input
              className="mt-1"
              type="date"
              value={form.dob}
              onBlur={() => setTouched((p) => ({ ...p, dob: true }))}
              onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
            />
            {showErr("dob") ? (
              <p className="mt-1 text-xs text-rose-600">{errors.dob}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium">Mobile*</label>
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
            <label className="text-sm font-medium">Gender*</label>
            <Select
              className="mt-1"
              value={form.gender}
              onBlur={() => setTouched((p) => ({ ...p, gender: true }))}
              onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
            >
              <option value="">Select</option>
              {genderOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            {showErr("gender") ? (
              <p className="mt-1 text-xs text-rose-600">{errors.gender}</p>
            ) : null}
          </div>
          {canPickBranch ? (
            <div>
              <label className="text-sm font-medium">Gym Branch*</label>
              <Select
                className="mt-1"
                value={form.assignedGymCodeId}
                onBlur={() => setTouched((p) => ({ ...p, assignedGymCodeId: true }))}
                onChange={(e) =>
                  setForm((p) => ({ ...p, assignedGymCodeId: e.target.value }))
                }
              >
                <option value="">Select branch</option>
                {gymCodes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code
                      ? `${g.code}${g.name || g.label ? ` / ${g.name || g.label}` : ""}`
                      : g.name || g.label || g.id}
                  </option>
                ))}
              </Select>
              {showErr("assignedGymCodeId") ? (
                <p className="mt-1 text-xs text-rose-600">{errors.assignedGymCodeId}</p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label className="text-sm font-medium">Call Back</label>
            <div className="mt-2 flex gap-4 rounded-xl border border-border px-3 py-2 text-sm">
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
            <label className="text-sm font-medium">Tentative Joining</label>
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
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save Visitor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
