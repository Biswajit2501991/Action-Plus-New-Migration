import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getSupabase } from '../backend/src/db/supabase/client.js';
import {
  resolveEffectiveTemplateBranchId,
  staffMayWriteWhatsappTemplates,
  assertValidTemplateKey,
} from '../backend/src/services/branchWhatsappTemplates.js';
import {
  resolveMemberTemplateFromCache,
  staffMayEditWhatsappTemplates,
} from '../src/features/whatsapp/branchTemplateAccess.js';

vi.mock('../backend/src/db/supabase/client.js', () => ({
  getSupabase: vi.fn(),
  gymId: () => 'gym-1',
}));

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_STAFF = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_HQ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

vi.mock('../backend/src/services/gymCodesService.js', () => ({
  resolveGymCodeId: vi.fn(async (id) => {
    const raw = String(id || '').trim();
    if (!raw) return null;
    if (raw === 'branch-a') return UUID_A;
    if (raw === 'staff-branch') return UUID_STAFF;
    if (raw === 'hq-uuid') return UUID_HQ;
    return UUID_RE.test(raw) ? raw : null;
  }),
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mockSupabaseHqGymCode(hqId) {
  const maybeSingleHq = vi.fn(async () => ({ data: hqId ? { id: hqId } : null, error: null }));
  const maybeSingleFirst = vi.fn(async () => ({ data: null, error: null }));
  const eqCode = vi.fn(() => ({ maybeSingle: maybeSingleHq }));
  const eqGym = vi.fn(() => ({
    eq: eqCode,
    order: vi.fn(() => ({
      limit: vi.fn(() => ({ maybeSingle: maybeSingleFirst })),
    })),
  }));
  const select = vi.fn(() => ({ eq: eqGym }));
  vi.mocked(getSupabase).mockReturnValue({
    from: vi.fn((table) => (table === 'gym_codes' ? { select } : {})),
  });
}

describe('branchWhatsappTemplates access', () => {
  it('owner without gymCodeId falls back to HQ when available', async () => {
    mockSupabaseHqGymCode(UUID_HQ);
    const id = await resolveEffectiveTemplateBranchId({ userId: 'owner' }, '');
    expect(id).toBe(UUID_HQ);
  });

  it('owner without gymCodeId and no HQ gets 400', async () => {
    mockSupabaseHqGymCode(null);
    await expect(
      resolveEffectiveTemplateBranchId({ userId: 'owner' }, ''),
    ).rejects.toMatchObject({ message: 'gym-code-id-required' });
  });

  it('owner resolves gym code id', async () => {
    const id = await resolveEffectiveTemplateBranchId({ userId: 'owner' }, 'branch-a');
    expect(id).toBe(UUID_A);
  });

  it('staff uses auth gymCodeId and ignores request param', async () => {
    const id = await resolveEffectiveTemplateBranchId(
      { userId: 'deep', gymCodeId: 'staff-branch', roles: ['staff'] },
      'other-branch',
    );
    expect(id).toBe(UUID_STAFF);
  });

  it('staff without branch is blocked', async () => {
    await expect(
      resolveEffectiveTemplateBranchId({ userId: 'deep', roles: ['staff'] }, 'x'),
    ).rejects.toMatchObject({ message: 'branch-scope-missing' });
  });

  it('staffMayWriteWhatsappTemplates respects viewTemplates', () => {
    expect(staffMayWriteWhatsappTemplates({ __owner: true })).toBe(true);
    expect(staffMayWriteWhatsappTemplates({ whatsapp: { viewTemplates: true } })).toBe(true);
    expect(staffMayWriteWhatsappTemplates({ whatsapp: { viewTemplates: false } })).toBe(false);
  });

  it('assertValidTemplateKey rejects invalid keys', () => {
    expect(() => assertValidTemplateKey('Bad Key')).toThrow();
    expect(assertValidTemplateKey('reminder')).toBe('reminder');
  });
});

describe('resolveMemberTemplateFromCache', () => {
  const cache = {
    'branch-a': { reminder: 'Hello A' },
    HQ: { reminder: 'Hello HQ', fine: 'Fine HQ' },
  };

  it('uses member branch template', () => {
    const r = resolveMemberTemplateFromCache(cache, 'HQ', { assignedGymCodeId: 'branch-a' }, 'reminder');
    expect(r?.body).toBe('Hello A');
    expect(r?.usedHqFallback).toBe(false);
  });

  it('falls back to HQ when member has no branch', () => {
    const r = resolveMemberTemplateFromCache(cache, 'HQ', {}, 'reminder');
    expect(r?.body).toBe('Hello HQ');
    expect(r?.usedHqFallback).toBe(true);
  });

  it('falls back to HQ when branch row missing key', () => {
    const r = resolveMemberTemplateFromCache(cache, 'HQ', { assignedGymCodeId: 'branch-a' }, 'fine');
    expect(r?.body).toBe('Fine HQ');
    expect(r?.usedHqFallback).toBe(true);
  });
});

describe('staffMayEditWhatsappTemplates', () => {
  it('owner can edit', () => {
    expect(staffMayEditWhatsappTemplates({ id: 'owner' })).toBe(true);
  });

  it('staff needs viewTemplates', () => {
    expect(staffMayEditWhatsappTemplates({ id: 's1', access: { whatsapp: { viewTemplates: true } } })).toBe(true);
    expect(staffMayEditWhatsappTemplates({ id: 's1', access: { whatsapp: { viewTemplates: false } } })).toBe(false);
  });
});
