/** Map PT profile PATCH failures to actionable staff-facing messages (legacy + shared). */
export function ptSaveErrorMessage(err, fallback = 'Could not save PT client changes. Try again or contact owner.') {
  const e = err && typeof err === 'object' ? err : {};
  const raw = String(e.message || '').trim();
  const msg = raw.replace(/^backend-403:?/i, '').trim();

  if (msg.includes('edit PT plans')) {
    return 'PT save blocked: Edit PT Plan is off. Ask the owner to enable PT Clients → Edit PT Plan, then log out and back in.';
  }
  if (msg.includes('edit PT workouts')) {
    return 'PT save blocked: Edit PT Workout is off. Ask the owner to enable PT Clients → Edit PT Workout, then log out and back in.';
  }

  if (e.status === 403) {
    const lower = msg.toLowerCase();
    if (lower.includes('assigned to you')) {
      return 'PT save blocked: this client is not assigned to you. Set Assigned Trainer to yourself, match the PT plan (e.g. PT-Name), or ask the owner.';
    }
    if (lower.includes('reassign') || lower.includes('another trainer')) {
      return 'PT save blocked: you cannot assign this client to another trainer. Choose yourself as Assigned Trainer or ask the owner.';
    }
    if (lower.includes('not found or blocked')) {
      return 'PT save blocked: your staff account was not found or is blocked. Contact the owner.';
    }
    if (lower.includes('permission for this action')) {
      return 'PT save blocked: missing PT Clients view access. Ask the owner to grant PT Clients, then log out and back in.';
    }
    if (msg) {
      return `PT save blocked (403): ${msg} If permissions were just updated, log out and back in.`;
    }
    const code = String(e.code || '').trim();
    if (code) {
      return `PT save blocked (403: ${code}). Ask the owner to check your PT access, then log out and back in.`;
    }
    return 'PT save blocked (403): unknown reason. Ask the owner to check your PT access, then log out and back in.';
  }

  if (e.status === 404) {
    return 'PT client member not found on server.';
  }

  return msg || fallback;
}
