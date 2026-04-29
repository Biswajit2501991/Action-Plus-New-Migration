import React from 'react';
import { createApiClient } from './services/apiClient.js';
import AddMemberWizardModule from './components/AddMemberWizardModule.jsx';
import AppHeaderModule from './components/AppHeaderModule.jsx';
import EditMemberModalModule from './components/EditMemberModalModule.jsx';
import LeaveTrackerPageModule from './components/LeaveTrackerPageModule.jsx';
import MemberListModule from './components/MemberListModule.jsx';
import WhatsAppSmsPageModule from './components/WhatsAppSmsPageModule.jsx';
import { DEFAULT_ACCESS, sectionsWithRoleDefaults } from './features/access/permissions.js';
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
  const [users, setUsers] = React.useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('apg.users') || '[]');
      return Array.isArray(raw) ? raw.map((u) => sectionsWithRoleDefaults(u)) : [];
    } catch {
      return [];
    }
  });
  const [settings, setSettings] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('apg.settings') || '{}') || {};
    } catch {
      return {};
    }
  });
  const { composer, openComposer, onComposerChange, sendWhatsApp } = useComposer(members, setWarn);
  const currentUser = React.useMemo(() => {
    const owner = users.find((u) => u.id === 'owner');
    return owner ? { ...owner, access: owner.access || { ...DEFAULT_ACCESS } } : { id: 'owner', name: 'Owner', access: { ...DEFAULT_ACCESS } };
  }, [users]);

  React.useEffect(() => {
    localStorage.setItem('apg.users', JSON.stringify(users || []));
  }, [users]);

  React.useEffect(() => {
    localStorage.setItem('apg.settings', JSON.stringify(settings || {}));
  }, [settings]);

  const updateSetting = React.useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

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
      <LeaveTrackerPageModule
        users={users}
        settings={settings}
        updateSetting={updateSetting}
        currentUser={currentUser}
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
