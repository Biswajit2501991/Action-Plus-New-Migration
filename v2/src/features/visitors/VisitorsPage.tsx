import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiErrorPanel } from '@/components/ui/ApiErrorPanel';
import { SortHeader } from '@/components/ui/SortHeader';
import { VisitorFormModal } from '@/features/visitors/VisitorFormModal';
import { VisitorRow } from '@/features/visitors/VisitorRow';
import type { Visitor, VisitorFormValues } from '@/features/visitors/visitors.types';
import { useMarkVisitorCalled, useSaveVisitorsBulk, useVisitors, visitorsQueryKey } from '@/hooks/useVisitors';
import { useTableSort } from '@/hooks/useTableSort';
import { createVisitorId } from '@/lib/visitor-id';
import { dedupeVisitors, findVisitorByContact } from '@/lib/visitors-dedupe';

type SortField = 'id' | 'fullName' | 'mobile' | 'email' | 'gender' | 'addedAt' | 'status';

export function VisitorsPage() {
  const qc = useQueryClient();
  const { data: visitors = [], isLoading, isError, error } = useVisitors();
  const saveBulk = useSaveVisitorsBulk();
  const markCalled = useMarkVisitorCalled();

  const [searchParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState('');
  const [modalVisitor, setModalVisitor] = useState<Visitor | null | 'new'>(null);
  const [toast, setToast] = useState('');
  const saveLock = useRef(false);

  useEffect(() => {
    const focus = searchParams.get('focus')?.trim();
    if (focus) setExpandedId(focus);
  }, [searchParams]);

  const accessor = useCallback((row: Visitor, field: SortField) => {
    const v = row[field];
    if (field === 'addedAt') return row.addedAt || '';
    return String(v ?? '');
  }, []);

  const { sortedRows, toggleSort, sortIndicator } = useTableSort<Visitor, SortField>(
    visitors,
    'visitors-main',
    { field: 'addedAt', direction: 'desc' },
    accessor,
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  const persistList = async (next: Visitor[], successMsg: string) => {
    const cleaned = dedupeVisitors(next);
    try {
      await saveBulk.mutateAsync(cleaned);
      showToast(successMsg);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save.');
      throw e;
    }
  };

  const handleSave = async (form: VisitorFormValues) => {
    if (saveBulk.isPending || saveLock.current) return;
    saveLock.current = true;
    const nowIso = new Date().toISOString();
    const current = dedupeVisitors(qc.getQueryData<Visitor[]>(visitorsQueryKey) ?? visitors);
    let id = form.id.trim();
    const row: Visitor = {
      id,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      dob: form.dob,
      gender: form.gender,
      callBackRequired: form.callBackRequired,
      tentativeJoiningDate: form.tentativeJoiningDate,
      status: form.status || 'New',
      addedAt: form.addedAt || nowIso,
      lastCalledAt: '',
      lastCalledBy: '',
    };
    if (!id) {
      const dup = findVisitorByContact(current, row);
      if (dup) {
        saveLock.current = false;
        showToast('A visitor with this mobile and email already exists.');
        return;
      }
      id = createVisitorId(current.map((v) => v.id));
    }
    row.id = id;

    const exists = current.some((v) => v.id === id);
    const next = exists ? current.map((v) => (v.id === id ? { ...v, ...row } : v)) : [row, ...current];
    try {
      await persistList(next, exists ? 'Visitor updated.' : 'Visitor saved.');
      setModalVisitor(null);
    } finally {
      saveLock.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this visitor?')) return;
    const current = qc.getQueryData<Visitor[]>(visitorsQueryKey) ?? visitors;
    const next = current.filter((v) => v.id !== id);
    await persistList(next, 'Visitor deleted.');
  };

  const handleMarkCalled = async (id: string) => {
    try {
      await markCalled.mutateAsync(id);
      showToast('Visitor marked as called.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  if (isLoading) {
    return <p className="p-8 text-slate-500">Loading visitors…</p>;
  }

  if (isError) {
    return (
      <div className="p-8">
        <ApiErrorPanel error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-8">
      {toast && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{toast}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Visitors</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{visitors.length} records</span>
          <button
            type="button"
            onClick={() => setModalVisitor('new')}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add Visitor
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full table-fixed text-sm">
          <thead>
            <tr className="bg-blue-50 text-blue-700">
              <th className="w-28 px-3 py-2 text-left">
                <SortHeader label="ID" field="id" indicator={sortIndicator('id')} onSort={toggleSort} />
              </th>
              <th className="w-36 px-3 py-2 text-left">
                <SortHeader label="Name" field="fullName" indicator={sortIndicator('fullName')} onSort={toggleSort} />
              </th>
              <th className="w-32 px-3 py-2 text-left">
                <SortHeader label="Mobile" field="mobile" indicator={sortIndicator('mobile')} onSort={toggleSort} />
              </th>
              <th className="w-44 px-3 py-2 text-left">
                <SortHeader label="Email" field="email" indicator={sortIndicator('email')} onSort={toggleSort} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Gender" field="gender" indicator={sortIndicator('gender')} onSort={toggleSort} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Added" field="addedAt" indicator={sortIndicator('addedAt')} onSort={toggleSort} />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Status" field="status" indicator={sortIndicator('status')} onSort={toggleSort} />
              </th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((v) => (
              <VisitorRow
                key={v.id}
                visitor={v}
                expanded={expandedId === v.id}
                onToggle={() => setExpandedId((prev) => (prev === v.id ? '' : v.id))}
                onEdit={() => setModalVisitor(v)}
                onDelete={() => handleDelete(v.id)}
                onMarkCalled={() => handleMarkCalled(v.id)}
                marking={markCalled.isPending && markCalled.variables === v.id}
              />
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No visitor records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalVisitor !== null && (
        <VisitorFormModal
          visitor={modalVisitor === 'new' ? null : modalVisitor}
          saving={saveBulk.isPending}
          onClose={() => setModalVisitor(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
