import { randomUUID } from 'node:crypto';

export function buildStaffUser(overrides: Record<string, unknown> = {}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const id = `e2e-staff-${suffix}`;
  return {
    id,
    name: `E2E Staff ${suffix}`,
    email: `e2e.${suffix}@example.com`,
    sections: ['Dashboard', 'Members', 'Settings', 'Logs'],
    access: {},
    blocked: false,
    blockedReason: '',
    blockedAt: '',
    updatedBy: 'owner',
    photo: null,
    testProfile: true,
    sandboxId: randomUUID(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
