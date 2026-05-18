import { useMemo, useState } from 'react';
import type { Visitor, VisitorFormValues } from '@/features/visitors/visitors.types';

const GENDERS = ['Male', 'Female', 'Other'];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string) {
  const s = v.trim();
  return /^\d{10}$/.test(s) || /^\+91\d{10}$/.test(s);
}

type Props = {
  visitor: Visitor | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: VisitorFormValues) => Promise<void>;
};

export function VisitorFormModal({ visitor, saving = false, onClose, onSave }: Props) {
  const [form, setForm] = useState<VisitorFormValues>(() => ({
    id: visitor?.id || '',
    fullName: visitor?.fullName || '',
    email: visitor?.email || '',
    dob: visitor?.dob || '',
    mobile: visitor?.mobile || '',
    gender: visitor?.gender || '',
    callBackRequired: Boolean(visitor?.callBackRequired),
    tentativeJoiningDate: visitor?.tentativeJoiningDate || '',
    status: visitor?.status || 'New',
    addedAt: visitor?.addedAt || '',
  }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(
    () => ({
      fullName: !form.fullName.trim() ? 'Full Name is required.' : '',
      email: !form.email.trim()
        ? 'Gmail Address is required.'
        : !isValidEmail(form.email)
          ? 'Enter a valid email.'
          : '',
      dob: !form.dob.trim() ? 'Date of Birth is required.' : '',
      mobile: !form.mobile.trim()
        ? 'Mobile Number is required.'
        : !isValidPhone(form.mobile)
          ? 'Enter a valid mobile number.'
          : '',
      gender: !form.gender.trim() ? 'Gender is required.' : '',
    }),
    [form],
  );

  const submit = async () => {
    if (saving) return;
    if (Object.values(errors).some(Boolean)) {
      setTouched({ fullName: true, email: true, dob: true, mobile: true, gender: true });
      return;
    }
    await onSave(form);
  };

  const showErr = (key: keyof typeof errors) => touched[key] && errors[key];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-blue-800">{visitor ? 'Edit Visitor' : 'Add Visitor'}</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Full Name*</label>
            <input
              value={form.fullName}
              onBlur={() => setTouched((p) => ({ ...p, fullName: true }))}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {showErr('fullName') && <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Email*</label>
            <input
              type="email"
              value={form.email}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {showErr('email') && <p className="mt-1 text-xs text-rose-600">{errors.email}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Date of Birth*</label>
            <input
              type="date"
              value={form.dob}
              onBlur={() => setTouched((p) => ({ ...p, dob: true }))}
              onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {showErr('dob') && <p className="mt-1 text-xs text-rose-600">{errors.dob}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Mobile*</label>
            <input
              value={form.mobile}
              onBlur={() => setTouched((p) => ({ ...p, mobile: true }))}
              onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {showErr('mobile') && <p className="mt-1 text-xs text-rose-600">{errors.mobile}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Gender*</label>
            <select
              value={form.gender}
              onBlur={() => setTouched((p) => ({ ...p, gender: true }))}
              onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {showErr('gender') && <p className="mt-1 text-xs text-rose-600">{errors.gender}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Call Back</label>
            <div className="mt-2 flex gap-4 rounded-xl border border-slate-300 px-3 py-2 text-sm">
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
            <input
              type="date"
              value={form.tentativeJoiningDate}
              onChange={(e) => setForm((p) => ({ ...p, tentativeJoiningDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Visitor'}
          </button>
        </div>
      </div>
    </div>
  );
}
