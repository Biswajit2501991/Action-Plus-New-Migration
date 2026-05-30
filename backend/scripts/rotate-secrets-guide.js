/**
 * Step-by-step secret rotation (manual steps in Supabase dashboard).
 * Usage: cd backend && npm run security:rotate-guide
 */
import crypto from 'node:crypto';

const jwt = crypto.randomBytes(48).toString('base64');

console.log(`
=== Action Plus Gym — Secret rotation checklist ===

1) Supabase service_role (do in browser, not in chat)
   • https://supabase.com/dashboard → your project → Project Settings → API
   • Under "Project API keys", click Regenerate for service_role
   • Copy the new key into backend/.env as SUPABASE_SERVICE_ROLE_KEY=
   • Restart backend

2) JWT_SECRET (invalidates all logged-in sessions)
   • Put this in backend/.env (or run: npm run security:new-jwt-secret for another value):

   JWT_SECRET=${jwt}

   • Restart backend; all staff log in again

3) Process control (production)
   • In backend/.env for machines exposed via Cloudflare:

   PROCESS_CONTROL_ENABLED=false

   • Never put PROCESS_CONTROL_TOKEN in app.env.js or the browser.
   • Backend tab uses /__apg_supervisor; the frontend proxy injects the token server-side.
   • Optional on the Mac only (supervisor + local proxy):

   APG_SUPERVISOR_TOKEN=<long random string>
   PROCESS_CONTROL_TOKEN=<same value if supervisor auth is required>

4) CORS (already in code defaults; optional explicit .env)

   CORS_ALLOWED_ORIGINS=https://app.gymactionplus.com,http://127.0.0.1:5501

5) Verify
   cd backend && npm run security:check-env
   Restart: npm run dev:all:tunnel  (or autostart)

Never commit backend/.env or paste keys in chat/email.
`);
