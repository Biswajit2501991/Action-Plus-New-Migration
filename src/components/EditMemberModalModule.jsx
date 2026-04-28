import React from 'react';
import { checkMemberDuplicates, isValidEmail, isValidPhone } from '../features/members/validation.js';

export default function EditMemberModalModule({ member, members, onClose, onSave, onWarn }) {
  const [draft, setDraft] = React.useState(member || null);

  React.useEffect(() => {
    setDraft(member || null);
  }, [member]);

  if (!draft) return null;

  const save = () => {
    onWarn('');
    if (!String(draft.name || '').trim()) return onWarn('Name is required.');
    if (!isValidPhone(draft.mobile)) return onWarn('Valid phone is required.');
    if (String(draft.email || '').trim() && !isValidEmail(draft.email)) return onWarn('Valid email is required.');
    const dup = checkMemberDuplicates(members, draft, draft.memberId);
    if (dup.duplicatePhone) return onWarn('Phone already exists.');
    if (dup.duplicateEmail) return onWarn('Email already exists.');
    if (dup.duplicateMemberId) return onWarn('Member ID already exists.');
    onSave(draft);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ width: 'min(760px, 100%)', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Edit Member (Module)</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          <input value={draft.memberId || ''} onChange={(e) => setDraft((d) => ({ ...d, memberId: e.target.value }))} placeholder="Member ID" />
          <input value={draft.name || ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" />
          <input value={draft.email || ''} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="Email" />
          <input value={draft.mobile || ''} onChange={(e) => setDraft((d) => ({ ...d, mobile: e.target.value }))} placeholder="Mobile" />
          <input value={draft.plan || ''} onChange={(e) => setDraft((d) => ({ ...d, plan: e.target.value }))} placeholder="Plan" />
          <select value={draft.status || 'Active'} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Hold">Hold</option>
            <option value="Deactivated">Deactivated</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
