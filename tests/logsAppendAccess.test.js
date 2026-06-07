import { describe, it, expect } from 'vitest';
import { Access, isAccessAllowed, normalizeAccess } from '../backend/src/auth/accessControl.js';

describe('audit log append access', () => {
  const staffNoLogsView = normalizeAccess({
    members: { editMembers: true },
    logs: { viewLogs: false, exportLogs: false, clearLogs: false },
  });

  it('allows POST append for staff without viewLogs', () => {
    expect(isAccessAllowed(staffNoLogsView, Access.logsAppend)).toBe(true);
  });

  it('still blocks reading logs without viewLogs', () => {
    expect(isAccessAllowed(staffNoLogsView, Access.logsRead)).toBe(false);
  });

  it('still blocks bulk log write without viewLogs', () => {
    expect(isAccessAllowed(staffNoLogsView, Access.logsWrite)).toBe(false);
  });
});
