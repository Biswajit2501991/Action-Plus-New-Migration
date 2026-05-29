export const DEFAULT_GYM_DISPLAY_NAME = 'Action Plus Gym';
export const DEFAULT_LOGO_PATH = './assets/action-plus-logo.png';

export function resolveClientBranchBranding(row = {}) {
  const displayName = String(row.displayName || row.display_name || '').trim()
    || (row.branchName || row.name ? `Action Plus ${row.branchName || row.name}` : '')
    || DEFAULT_GYM_DISPLAY_NAME;
  const logoRaw = String(row.logoUrl || row.logo_url || '').trim();
  return {
    gymCodeId: String(row.gymCodeId || row.id || '').trim() || null,
    displayName,
    logoUrl: logoRaw || DEFAULT_LOGO_PATH,
    usesDefaultLogo: !logoRaw,
  };
}

export function defaultClientBranding() {
  return resolveClientBranchBranding({});
}
