import type { Visitor } from '@/features/visitors/visitors.types';

export function normalizeVisitorMobile(mobile: string): string {
  const s = String(mobile || '').trim().replace(/\s/g, '');
  if (s.startsWith('+91')) return s.slice(3);
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function visitorContactKey(v: Pick<Visitor, 'mobile' | 'email'>): string {
  return `${normalizeVisitorMobile(v.mobile)}|${String(v.email || '').trim().toLowerCase()}`;
}

/** One row per id; one row per mobile+email (keeps newest addedAt). */
export function dedupeVisitors(list: Visitor[]): Visitor[] {
  const byId = new Map<string, Visitor>();
  for (const row of list) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || String(row.addedAt || '') >= String(prev.addedAt || '')) {
      byId.set(id, row);
    }
  }

  const byContact = new Map<string, Visitor>();
  for (const row of byId.values()) {
    const key = visitorContactKey(row);
    if (!key.replace('|', '').length) {
      byContact.set(row.id, row);
      continue;
    }
    const prev = byContact.get(key);
    if (!prev || String(row.addedAt || '') >= String(prev.addedAt || '')) {
      byContact.set(key, row);
    }
  }

  return Array.from(byContact.values());
}

export function findVisitorByContact(
  list: Visitor[],
  candidate: Pick<Visitor, 'mobile' | 'email'>,
  excludeId = '',
): Visitor | undefined {
  const key = visitorContactKey(candidate);
  if (!key.replace('|', '').length) return undefined;
  return list.find((v) => v.id !== excludeId && visitorContactKey(v) === key);
}
