import { randomUUID } from 'node:crypto';
import { appendAuditLogEntry } from '../../db/dataStore.js';

/**
 * @param {{
 *   action: string,
 *   actorId: string,
 *   staffId: string,
 *   staffName?: string,
 *   meta?: object,
 * }} params
 */
export async function logPasswordResetAudit({
  action,
  actorId,
  staffId,
  staffName = '',
  meta = {},
}) {
  const entry = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    actor: String(actorId || 'system').trim() || 'system',
    action: String(action || '').trim(),
    entityType: 'user',
    entityId: String(staffId || '').trim(),
    before: null,
    after: {
      staffId: String(staffId || '').trim(),
      staffName: String(staffName || '').trim(),
      ...meta,
    },
  };
  await appendAuditLogEntry(null, entry);
}
