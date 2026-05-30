import { describe, expect, it } from 'vitest';
import {
  isMasterOwnerAuthPayload,
  isSupervisorMutationPath,
} from '../scripts/supervisor-proxy-auth.mjs';

describe('supervisor-proxy-auth', () => {
  it('detects supervisor mutation paths', () => {
    expect(isSupervisorMutationPath('/__apg_supervisor/backend/restart')).toBe(true);
    expect(isSupervisorMutationPath('/__apg_supervisor/backend/stop')).toBe(true);
    expect(isSupervisorMutationPath('/__apg_supervisor/health')).toBe(false);
  });

  it('accepts master owner auth payloads only', () => {
    expect(isMasterOwnerAuthPayload({ user: { id: 'owner' } })).toBe(true);
    expect(isMasterOwnerAuthPayload({ user: { id: 'deep', staffRole: 'master_owner' } })).toBe(true);
    expect(isMasterOwnerAuthPayload({ user: { id: 'deep', staffRole: 'staff' } })).toBe(false);
  });
});
