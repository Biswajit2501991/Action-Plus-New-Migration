import React from 'react';
import { createApiClient } from './services/apiClient.js';
import AddMemberWizardModule from './components/AddMemberWizardModule.jsx';
import AppHeaderModule from './components/AppHeaderModule.jsx';
import EditMemberModalModule from './components/EditMemberModalModule.jsx';
import MemberListModule from './components/MemberListModule.jsx';
import WhatsAppSmsPageModule from './components/WhatsAppSmsPageModule.jsx';
import { useComposer } from './hooks/useComposer.js';
import { useMemberFilters } from './hooks/useMemberFilters.js';
import { useMembersData } from './hooks/useMembersData.js';

export default function App() {
  const apiMode = 'local';
  const api = React.useMemo(() => createApiClient(apiMode), [apiMode]);
  const { health, members, persistMembers } = useMembersData(api);
  const {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    planFilter,
    setPlanFilter,
    setPage,
    grouped,
    paged
  } = useMemberFilters(members);
  const [warn, setWarn] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [editId, setEditId] = React.useState('');
  const { composer, openComposer, onComposerChange, sendWhatsApp } = useComposer(members, setWarn);

  const onCreateMember = async (nextMember) => {
    const next = [nextMember, ...members];
    await persistMembers(next);
    setToast('Member created.');
  };

  const onSaveEdit = async (updatedMember) => {
    const next = members.map((m) => (m.memberId === editId ? { ...updatedMember } : m));
    await persistMembers(next);
    setToast('Member updated.');
    setEditId('');
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <AppHeaderModule apiMode={apiMode} health={health} toast={toast} warn={warn} />

      <AddMemberWizardModule members={members} onCreate={onCreateMember} onWarn={setWarn} />

      <MemberListModule
        query={query}
        statusFilter={statusFilter}
        planFilter={planFilter}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
        onPlanFilterChange={setPlanFilter}
        grouped={grouped}
        paged={paged}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
        onEdit={setEditId}
        onCompose={openComposer}
      />

      <WhatsAppSmsPageModule
        composer={composer}
        onComposerChange={onComposerChange}
        onSendWhatsApp={sendWhatsApp}
      />
      <EditMemberModalModule
        member={members.find((m) => m.memberId === editId) || null}
        members={members}
        onClose={() => setEditId('')}
        onSave={onSaveEdit}
        onWarn={setWarn}
      />
    </div>
  );
}
