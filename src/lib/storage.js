export const STORAGE_SOFT_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function estimateStorageBytes(storage) {
  let total = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i) || '';
    const v = storage.getItem(k) || '';
    total += (k.length + v.length) * 2;
  }
  return total;
}

export function safeSetJSON(storage, key, value, limitBytes = STORAGE_SOFT_LIMIT_BYTES) {
  const serialized = JSON.stringify(value);
  const payloadBytes = serialized.length * 2;
  if (payloadBytes > limitBytes) return { ok: false, reason: 'payload-too-large' };
  const existingBytes = (storage.getItem(key) || '').length * 2;
  const nextUsage = estimateStorageBytes(storage) - existingBytes + payloadBytes;
  if (nextUsage > limitBytes) return { ok: false, reason: 'budget-exceeded' };
  storage.setItem(key, serialized);
  return { ok: true, reason: '' };
}

export function safeGetJSON(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
