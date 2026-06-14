import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { resolveGymCodeId } from '../gymCodesService.js';
import { memberPhotoStorageEnabled } from '../memberPhoto/storageConstants.js';
import { createMemberPhotoSignedUrl } from '../memberPhoto/MemberPhotoStorageManager.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadActivePaymentQrsForBranch(branchId) {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .select('id, qr_name, qr_image_path, display_order')
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('qr_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadBranchMeta(branchId) {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .select('code, name')
    .eq('gym_id', gid)
    .eq('id', branchId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Public HTML page for members to view branch payment QRs (no auth).
 * @param {string} gymCode e.g. APA
 */
export async function renderPublicPaymentQrHtml(gymCode) {
  const branchId = await resolveGymCodeId(gymCode);
  if (!branchId) {
    const err = new Error('branch-not-found');
    err.status = 404;
    throw err;
  }

  const [branch, rows] = await Promise.all([
    loadBranchMeta(branchId),
    loadActivePaymentQrsForBranch(branchId),
  ]);

  const branchLabel = branch?.name && branch?.code
    ? `${branch.name} (${branch.code})`
    : String(branch?.name || branch?.code || gymCode || '').trim();

  const items = [];
  if (memberPhotoStorageEnabled()) {
    for (const row of rows) {
      const path = String(row?.qr_image_path || '').trim();
      let url = '';
      if (path) {
        url = await createMemberPhotoSignedUrl(path);
      }
      items.push({
        name: String(row?.qr_name || 'Payment QR'),
        url: url || '',
      });
    }
  } else {
    for (const row of rows) {
      items.push({ name: String(row?.qr_name || 'Payment QR'), url: '' });
    }
  }

  const cards = items.length
    ? items.map((item) => `
      <section class="card">
        <h2>${escapeHtml(item.name)}</h2>
        ${item.url
    ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}" />`
    : '<p class="muted">QR image is not available right now.</p>'}
      </section>`).join('')
    : '<p class="muted">No active payment QR codes for this branch.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment QR — ${escapeHtml(branchLabel)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    main { max-width: 420px; margin: 0 auto; padding: 24px 16px 40px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .sub { color: #475569; margin: 0 0 20px; font-size: 0.95rem; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-bottom: 16px; text-align: center; }
    .card h2 { font-size: 1rem; margin: 0 0 12px; }
    img { max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; }
    .muted { color: #64748b; font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>Payment QR</h1>
    <p class="sub">${escapeHtml(branchLabel)}</p>
    ${cards}
  </main>
</body>
</html>`;
}
