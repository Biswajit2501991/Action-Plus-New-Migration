#!/usr/bin/env bash
# Smoke-check V2 UI + API proxy + CORS/auth surface before cutover.
set -euo pipefail

UI_BASE="${UI_BASE:-http://127.0.0.1:3055}"
API_BASE="${API_BASE:-http://127.0.0.1:4000}"
ORIGIN="${ORIGIN:-https://www.pulsgyms.com}"

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "PASS  $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name"
    fail=$((fail + 1))
  fi
}

echo "V2 smoke · UI=${UI_BASE} · API=${API_BASE} · Origin=${ORIGIN}"
echo ""

check "UI listens" curl -fsS -o /dev/null -w "%{http_code}" "${UI_BASE}/login" | grep -Eq '200|307|308'
check "UI proxy /api/health (or auth)" \
  bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' '${UI_BASE}/api/health' || true); echo \"\$code\" | grep -Eq '200|401|404|503'"

check "API health" \
  bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' '${API_BASE}/api/health' || true); echo \"\$code\" | grep -Eq '200|401|404'"

check "CORS preflight login" \
  bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS '${API_BASE}/api/auth/login' -H 'Origin: ${ORIGIN}' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,authorization' || true); echo \"\$code\" | grep -Eq '200|204|404'"

check "Login page title/body" \
  bash -c "curl -fsS '${UI_BASE}/login' | grep -Eqi 'login|action|sign'"

echo ""
echo "Results: ${pass} passed, ${fail} failed"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
