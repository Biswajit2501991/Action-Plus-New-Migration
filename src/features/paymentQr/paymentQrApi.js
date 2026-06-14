/**
 * @param {(path: string, init?: object) => Promise<any>} backendJson
 * @param {{ gymCodeId?: string, activeOnly?: boolean, includeInactive?: boolean }} options
 */
export async function fetchPaymentQrList(backendJson, options = {}) {
  const params = new URLSearchParams();
  const branchId = String(options.gymCodeId || '').trim();
  if (branchId) params.set('gymCodeId', branchId);
  if (options.activeOnly === false) params.set('activeOnly', 'false');
  if (options.includeInactive) params.set('includeInactive', 'true');
  const qs = params.toString();
  const path = `/payment-qr${qs ? `?${qs}` : ''}`;
  const res = await backendJson(path);
  return {
    gymCodeId: res?.gymCodeId || branchId || null,
    items: Array.isArray(res?.items) ? res.items : [],
  };
}

export async function createPaymentQrApi(backendJson, payload) {
  return backendJson('/payment-qr', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePaymentQrApi(backendJson, id, payload) {
  const safeId = String(id || '').trim();
  if (!safeId) throw new Error('payment-qr-id-required');
  return backendJson(`/payment-qr/${encodeURIComponent(safeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function uploadPaymentQrImageApi(backendJson, id, imageDataUrl, gymCodeId) {
  const safeId = String(id || '').trim();
  if (!safeId || !imageDataUrl) throw new Error('payment-qr-image-args-required');
  return backendJson(`/payment-qr/${encodeURIComponent(safeId)}/image`, {
    method: 'POST',
    body: JSON.stringify({
      image: imageDataUrl,
      gymCodeId: String(gymCodeId || '').trim() || undefined,
    }),
  });
}

export function validatePaymentQrDraft({ qrName, gymCodeId, imageDataUrl, requireImage = true }) {
  const name = String(qrName || '').trim();
  if (!name) return 'QR name is required.';
  if (name.length > 80) return 'QR name must be 80 characters or fewer.';
  if (!String(gymCodeId || '').trim()) return 'Gym branch is required.';
  if (requireImage && !String(imageDataUrl || '').trim()) return 'QR image is required.';
  return '';
}
