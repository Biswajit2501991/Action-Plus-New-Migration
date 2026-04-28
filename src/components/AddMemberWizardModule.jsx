import React from 'react';
import { checkMemberDuplicates, isValidDob, isValidEmail, isValidPhone } from '../features/members/validation.js';
import { clearAddMemberDraft, loadAddMemberDraft, saveAddMemberDraft } from '../features/forms/addMemberDraft.js';

const INITIAL_FORM = {
  name: '',
  email: '',
  mobile: '',
  plan: '',
  status: 'Active',
};

export default function AddMemberWizardModule({ members, onCreate, onWarn }) {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState(INITIAL_FORM);

  React.useEffect(() => {
    const loaded = loadAddMemberDraft();
    if (loaded?.form) setForm((f) => ({ ...f, ...loaded.form }));
    if (loaded?.step) setStep(Math.max(1, Math.min(3, Number(loaded.step) || 1)));
  }, []);

  React.useEffect(() => {
    saveAddMemberDraft(undefined, { step, form });
  }, [step, form]);

  const req = React.useMemo(() => ({
    name: !String(form.name || '').trim(),
    email: !isValidEmail(form.email),
    mobile: !isValidPhone(form.mobile),
    plan: !String(form.plan || '').trim(),
    status: !String(form.status || '').trim(),
    dob: form.dob ? !isValidDob(form.dob) : false,
  }), [form]);

  const missing = React.useMemo(() => {
    const labels = [];
    if (req.name) labels.push('Name');
    if (req.email) labels.push('Valid Email');
    if (req.mobile) labels.push('Valid Mobile');
    if (req.plan) labels.push('Plan');
    if (req.status) labels.push('Status');
    if (req.dob) labels.push('Valid DOB');
    return labels;
  }, [req]);

  const next = () => {
    if (step === 1 && (req.name || req.email || req.mobile)) return onWarn('Please complete Step 1 fields.');
    if (step === 2 && (req.plan || req.status || req.dob)) return onWarn('Please complete Step 2 fields.');
    setStep((s) => Math.min(3, s + 1));
  };

  const save = async () => {
    onWarn('');
    if (missing.length) return onWarn(`Missing required: ${missing.join(', ')}`);
    const memberId = `APG-${Date.now().toString().slice(-6)}`;
    const dup = checkMemberDuplicates(members, { ...form, memberId });
    if (dup.duplicatePhone) return onWarn('Phone already exists.');
    if (dup.duplicateEmail) return onWarn('Email already exists.');
    if (dup.duplicateMemberId) return onWarn('Member ID conflict, retry.');
    await onCreate({ ...form, memberId, createdAt: new Date().toISOString() });
    setForm(INITIAL_FORM);
    setStep(1);
    clearAddMemberDraft();
  };

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h2>Add Member Wizard (Module)</h2>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${(step / 3) * 100}%`, height: '100%', background: '#2563eb' }} />
      </div>

      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input placeholder="Mobile" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <input placeholder="Plan" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} />
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Hold">Hold</option>
            <option value="Deactivated">Deactivated</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <input type="date" value={form.dob || ''} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} />
        </div>
      )}

      {step === 3 && (
        <div style={{ fontSize: 13 }}>
          <b>Required summary:</b> {missing.length ? missing.join(', ') : 'All required fields complete.'}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {step > 1 && <button onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</button>}
        {step < 3 ? <button onClick={next}>Next</button> : <button onClick={save}>Create</button>}
      </div>
    </section>
  );
}
