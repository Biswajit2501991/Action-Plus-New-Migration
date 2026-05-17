export function emptyText(value) {
  const s = String(value ?? '').trim();
  return s || '';
}

export function toDate(value, { required = false } = {}) {
  const s = String(value || '').trim();
  if (!s) return required ? '1970-01-01' : null;
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function toTs(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function financeStatusToNumeric(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'paid') return 1;
  if (s === 'pending') return 0;
  if (s === 'posted') return 2;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function financeStatusFromNumeric(n, note = '') {
  const num = Number(n);
  if (num === 1) return 'paid';
  if (num === 0) return 'pending';
  if (num === 2) return 'posted';
  const fromNote = String(note || '').match(/status:(\w+)/i);
  if (fromNote) return fromNote[1].toLowerCase();
  return 'paid';
}

export function chunk(list, size = 80) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function fetchAll(buildQuery) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
