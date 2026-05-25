/**
 * User-facing message for POST /api/leave-requests failures.
 * @param {Error & { status?: number; apiError?: string }} err
 */
export function leaveSubmitErrorMessage(err) {
  const code = String(err?.apiError || '').trim();
  const status = Number(err?.status || 0);
  if (status === 409 || code === 'leave-overlap') {
    return 'You already applied leave for these dates.';
  }
  if (code === 'invalid-userId') {
    return 'Staff account not found. Check the username with your owner.';
  }
  if (code === 'date-range-required' || code === 'invalid-dates') {
    return 'Please enter valid start and end dates.';
  }
  if (code === 'end-before-start') {
    return 'End date cannot be before start date.';
  }
  const detail = String(err?.message || '').trim();
  if (detail && !detail.startsWith('backend-')) {
    return `Could not submit leave: ${detail}`;
  }
  return 'Could not submit leave request. Please try again.';
}
