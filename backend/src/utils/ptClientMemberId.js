/**
 * Resolve PT client member code from PATCH request.
 * Member codes may contain "/" (e.g. APG-531/26) — never rely on path params alone
 * because proxies decode %2F into extra path segments.
 */
export function resolvePtClientMemberId({ bodyMemberId, pathParam, pathSuffix }) {
  const fromBody = String(bodyMemberId ?? '').trim();
  if (fromBody) return fromBody;

  const suffix = String(pathSuffix ?? '').trim();
  if (suffix) {
    try {
      return decodeURIComponent(suffix.replace(/^\/+/, ''));
    } catch {
      return suffix.replace(/^\/+/, '');
    }
  }

  const fromParam = String(pathParam ?? '').trim();
  if (!fromParam) return '';
  try {
    return decodeURIComponent(fromParam);
  } catch {
    return fromParam;
  }
}
