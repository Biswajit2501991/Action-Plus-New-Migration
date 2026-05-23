import crypto from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value) {
  return UUID_RE.test(String(value || '').trim());
}

export function slugifyRoleTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Stable id for staff_role_templates.external_template_id and frontend role.id.
 */
export function stableRoleTemplateId(role) {
  const raw = String(role?.id || role?.externalTemplateId || '').trim();
  if (raw && !isUuidLike(raw)) return raw.slice(0, 64);
  const slug = slugifyRoleTitle(role?.title);
  if (slug) return slug;
  return crypto.randomUUID();
}

function pickBetterRole(a, b) {
  const aSecs = Array.isArray(a?.sections) ? a.sections.length : 0;
  const bSecs = Array.isArray(b?.sections) ? b.sections.length : 0;
  if (bSecs !== aSecs) return bSecs > aSecs ? b : a;
  if (!isUuidLike(a?.id) && isUuidLike(b?.id)) return a;
  if (!isUuidLike(b?.id) && isUuidLike(a?.id)) return b;
  return b;
}

/** Collapse duplicate roles (same title or same stable id). */
export function dedupeRoleTemplates(roles) {
  const list = Array.isArray(roles) ? roles.filter((r) => r && typeof r === 'object') : [];
  const byTitle = new Map();
  for (const role of list) {
    const titleKey = slugifyRoleTitle(role?.title) || stableRoleTemplateId(role);
    const normalized = {
      ...role,
      id: stableRoleTemplateId(role),
    };
    const prev = byTitle.get(titleKey);
    byTitle.set(titleKey, prev ? pickBetterRole(prev, normalized) : normalized);
  }
  return Array.from(byTitle.values());
}

export function roleTemplateRowToApp(row) {
  const external = String(row?.external_template_id || '').trim();
  const stableId = external || stableRoleTemplateId({
    id: row?.id,
    title: row?.title,
  });
  return {
    id: stableId,
    title: row?.title || 'Role',
    subtitle: row?.subtitle || '',
    sections: Array.isArray(row?.sections_json) ? row.sections_json : [],
    color: row?.color_class || null,
  };
}

export function roleTemplateToRow(gid, role, sortOrder) {
  const stableId = stableRoleTemplateId(role);
  return {
    gym_id: gid,
    external_template_id: stableId,
    title: role.title || 'Role',
    subtitle: role.subtitle || null,
    sections_json: Array.isArray(role.sections) ? role.sections : [],
    color_class: role.color || null,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };
}
