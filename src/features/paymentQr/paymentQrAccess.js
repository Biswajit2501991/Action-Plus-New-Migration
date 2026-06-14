export function canViewPaymentQr(user) {
  const normalize = window.__APG_MODULES?.normalizeAccess;
  if (!user) return false;
  if (String(user.id || '').trim().toLowerCase() === 'owner') return true;
  if (String(user.role || '').trim().toLowerCase() === 'owner') return true;
  if (String(user.staffRole || '').trim().toLowerCase() === 'master_owner') return true;
  const access = typeof normalize === 'function' ? normalize(user.access) : user.access;
  return access?.paymentQr?.viewPaymentQr !== false;
}

export function canManagePaymentSettings(user) {
  if (!user) return false;
  if (String(user.id || '').trim().toLowerCase() === 'owner') return true;
  if (String(user.role || '').trim().toLowerCase() === 'owner') return true;
  if (String(user.staffRole || '').trim().toLowerCase() === 'master_owner') return true;
  const normalize = window.__APG_MODULES?.normalizeAccess;
  const access = typeof normalize === 'function' ? normalize(user.access) : user.access;
  return access?.paymentQr?.managePaymentSettings === true;
}

export function sortPaymentQrItems(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const orderA = Number(a?.displayOrder || 0);
    const orderB = Number(b?.displayOrder || 0);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.qrName || '').localeCompare(String(b?.qrName || ''));
  });
}

export function activePaymentQrItems(items = []) {
  return sortPaymentQrItems(items).filter((item) => item && item.isActive !== false);
}
