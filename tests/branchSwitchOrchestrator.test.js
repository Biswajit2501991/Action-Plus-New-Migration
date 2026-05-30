import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invalidateAllBranchBrandingExcept, setBranchBrandingCache, peekBranchBranding } from '../src/features/branding/branchBrandingCache.js';

describe('branchBrandingCache', () => {
  beforeEach(() => {
    invalidateAllBranchBrandingExcept('');
  });

  it('invalidateAllExcept keeps active branch branding', () => {
    setBranchBrandingCache('adra', { displayName: 'Action Plus Adra', logoUrl: '/adra.png' });
    setBranchBrandingCache('raja', { displayName: 'Action Plus Raja', logoUrl: '/raja.png' });
    invalidateAllBranchBrandingExcept('adra');
    expect(peekBranchBranding('adra')?.displayName).toBe('Action Plus Adra');
    expect(peekBranchBranding('raja')).toBeNull();
  });
});

describe('orchestrateBranchSwitch', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetActiveBranchStore } = await import('../src/features/branding/activeBranchStore.js');
    resetActiveBranchStore();
  });

  it('flushes visitors before cache invalidation and branch PATCH', async () => {
    const syncVisitorsBeforeSwitch = vi.fn().mockResolvedValue(undefined);
    const { orchestrateBranchSwitch } = await import('../src/features/tenant/branchSwitchOrchestrator.js');
    const order = [];
    const backendJson = vi.fn().mockImplementation(async (path) => {
      order.push(path);
      return {
        token: 'jwt-adra',
        allowedBranchIds: ['raja', 'adra'],
        assignedBranchIds: ['raja', 'adra'],
      };
    });
    syncVisitorsBeforeSwitch.mockImplementation(async () => { order.push('flush-visitors'); });

    await orchestrateBranchSwitch({
      branchId: 'adra',
      user: { id: 'staff1', gymCodeId: 'raja', activeBranchId: 'raja', allowedBranchIds: ['raja', 'adra'] },
      gymCodes: [{ id: 'adra', code: 'AP01', name: 'Adra' }],
      gymCodeById: new Map([['adra', { id: 'adra', code: 'AP01', name: 'Adra' }]]),
      dataSyncMode: 'backend',
      backendJson,
      syncVisitorsBeforeSwitch,
      writeAuthSession: vi.fn(),
      setBranchBranding: vi.fn(),
      cacheHandlers: { setVisitors: vi.fn() },
      hydrateFromBackend: vi.fn().mockResolvedValue(undefined),
    });

    expect(syncVisitorsBeforeSwitch).toHaveBeenCalledTimes(1);
    expect(order.indexOf('flush-visitors')).toBeLessThan(order.indexOf('/auth/active-branch'));
  });

  it('patches active branch, refreshes branding, and hydrates with skip overwrite', async () => {
    const { orchestrateBranchSwitch } = await import('../src/features/tenant/branchSwitchOrchestrator.js');
    const hydrateFromBackend = vi.fn().mockResolvedValue(undefined);
    const backendJson = vi.fn().mockResolvedValue({
      token: 'jwt-adra',
      allowedBranchIds: ['raja', 'adra'],
      assignedBranchIds: ['raja', 'adra'],
    });
    const writeAuthSession = vi.fn();
    const setBranchBranding = vi.fn();

    const { nextUser } = await orchestrateBranchSwitch({
      branchId: 'adra',
      user: { id: 'staff1', gymCodeId: 'raja', activeBranchId: 'raja', allowedBranchIds: ['raja', 'adra'] },
      gymCodes: [{ id: 'adra', code: 'AP01', name: 'Adra' }],
      gymCodeById: new Map([['adra', { id: 'adra', code: 'AP01', name: 'Adra' }]]),
      dataSyncMode: 'backend',
      backendJson,
      writeAuthSession,
      setBranchBranding,
      cacheHandlers: { setMembers: vi.fn(), setVisitors: vi.fn() },
      hydrateFromBackend,
    });

    expect(backendJson).toHaveBeenCalledWith('/auth/active-branch', expect.objectContaining({ method: 'PATCH' }));
    expect(nextUser.activeBranchId).toBe('adra');
    expect(nextUser.gymCodeId).toBe('adra');
    expect(hydrateFromBackend).toHaveBeenCalledWith(expect.objectContaining({
      skipAuthBranchOverwrite: true,
      replaceBranchData: true,
    }));
    expect(setBranchBranding).toHaveBeenCalled();
  });
});
