# Action Plus Gym Manager (v1.0)

This project is a simple client‑side application for managing gym memberships.  It is built with React (UMD) and Tailwind CSS and does **not** require any build or bundling step.  To run the app locally just open the `index.html` file in a modern web browser.

## Features

* Login screen with multiple demo accounts (`owner/owner`, `manager/manager`, `trainer/trainer` and `reception/reception`) to simulate different staff roles.
* Dashboard with search bar and summary tiles for each member status (Active, Hold, Deactivated, Cancelled).
* Members list view grouped by status with expandable rows showing member details, payment history and quick actions (edit, status change, etc.).
* Add Member wizard to capture personal details, membership plan and upload a profile photo.
* Edit Member modal to update existing member information.
* Settings page for editing dropdown values (plans, payment methods, hold durations, genders and staff members).
* Audit logs page to view an immutable history of actions taken in the app.
* Theme toggle (light/dark/system) persisted in localStorage.
* Data is stored in the browser’s `localStorage` under `apg.*` keys so that it persists across sessions.

## Running the App

1. Unzip the downloaded archive.
2. Navigate into the extracted folder.
3. Double click or open `index.html` in your browser.  Ensure you have an internet connection so the CDN‑hosted scripts (React, Tailwind and Babel) can load.
4. Sign in using one of the demo credentials shown on the login page.

That’s it!  You can now manage gym members, explore the dashboard, adjust settings and view logs.  All data will persist locally in your browser.

## Quick Start (Full Local Stack)

For new users who want frontend + local SQLite backend:

1. Install Node.js 20+.
2. In project root, install dependencies:
   - `npm install`
   - `cd backend && npm install && cd ..`
3. Create env files:
   - `cp .env.example .env`
   - `cp backend/.env.example backend/.env`
4. Initialize local database:
   - `cd backend`
   - `mkdir -p data`
   - `npm run db:migrate`
   - `npm run db:seed`
   - `cd ..`
5. Start both services together:
   - `npm run dev:all`
6. Open the app:
   - `http://127.0.0.1:5500/index.html` (or your `FRONTEND_PORT` from `.env`)

Tip: In the app header, check the `Backend Sync` badge. `Connected` means SQLite sync is active.

## Environment Switching (Local vs Prod)

Use separate env files so endpoints do not need manual edits:

1. Create env files from templates:
   - `cp .env.local.example .env.local`
   - `cp .env.prod.example .env.prod`
2. Start local mode:
   - `npm run start:local`
3. Start production-origin mode:
   - `npm run start:prod`

Notes:
- The scripts now respect `ENV_FILE` automatically.
- `start:local` uses `.env.local`; `start:prod` uses `.env.prod`.
- Tunnel variant for local mode: `npm run start:local:tunnel`.
- Local mode is permanently isolated to `5501/4001/4011` with `backend/data/app.local.db` to avoid clashing with production runtime.

### Quick Troubleshooting

- **Port already in use**: change `FRONTEND_PORT` or `BACKEND_PORT` in `.env`, then restart `npm run dev:all`.
- **Backend not connected**: confirm backend is running on `http://localhost:4000/api/health` and `API_BASE_URL` in `.env` matches it.

## Desktop-style Launch (Double Click)

On macOS, you can double-click `start.command` from the project folder. It will:

1. Install missing dependencies (`npm install` in root and `backend/`).
2. Run DB migration + seed.
3. Start backend + frontend.
4. Open the app in your browser automatically.

Notes:
- Keep the terminal window open while using the app.
- Internet is needed on first run (to download npm packages).
- If app icon does not update in Finder after icon changes, run one-time: `npm run icon:refresh`

### Restore Database from Backup

From `backend/`:

- Restore latest backup:
  - `npm run db:restore`
- Restore specific backup file:
  - `npm run db:restore -- app-apg_members-2026-05-04T10-12-00-000Z.db`

## Notes

* This project uses Tailwind via its CDN script rather than a compiled CSS build.  If you want to customise the look beyond the default classes, add styles to `styles.css`.
* The app is designed as a proof‑of‑concept MVP.  Feel free to extend the code by adding features like data export/import, scheduled WhatsApp reminders or integration with a backend API.

## Improvement Work Added

- Safer persistence and storage diagnostics (with user-facing storage warnings).
- Staff administration hardening (block/unblock metadata, password visibility control, photo support).
- Backup export/import workflow in Settings.
- Member workflow upgrades:
  - bulk status actions
  - saved filter presets
  - member activity timeline in row details
- Migration scaffold for modular architecture:
  - `src/main.jsx`
  - `src/App.jsx`
  - `src/services/apiClient.js`
- Draft backend API contract:
  - `docs/backend-api-contract.md`

## Tests (Scaffold)

Utility tests were added in `tests/utils.test.js` with source utilities in `src/lib/`.

Run:

```bash
npm install
npm test
```

If `npm` fails due to local Node/ICU mismatch, update or reinstall Node on your machine and run again.

## Production Hosting

Production for this project is Cloudflare-routed at:

- `https://app.gymactionplus.com/`

GitHub Pages is not used as the production deployment source.
See `PROD_DEPLOYMENT.md` for the authoritative release and rollback process.

### Daily Production Startup (One Command)

From project root:

- `npm run prod:start`

Health check:

- `npm run prod:health`

### Isolated Local Development (Different Ports)

Use this when production is running on your machine and you still want to test changes locally.

1. Keep production as-is (`npm run prod:start`).
2. Start isolated local stack in another terminal:
   - `npm run dev:all:isolated`
3. Open isolated local app:
   - `http://127.0.0.1:5501/index.html`

Defaults are stored in `.env.local`:

- Frontend: `5501`
- Backend: `4001`
- Supervisor: `4011`
- Local isolated DB: `backend/data/app.local.db`

## Cloudflare Tunnel (Share Local App Securely)

Use this when app runs on your local machine (for example in Australia) and members access from anywhere (for example India).

### 1) Install cloudflared (macOS)

- `brew install cloudflared`

### 2) Project setup

From project root:

- `cp .env.example .env` (if not created already)
- Optional: set `CF_TUNNEL_URL` if your frontend runs on a different host/port
- Keep `API_BASE_URL=/api` so remote tunnel users can reach your local backend through the frontend proxy

### 3) Start app + tunnel

- `npm run dev:all:tunnel`

This keeps existing app startup unchanged and adds tunnel in parallel.

### 4) Tunnel modes

- **Temporary URL (fast test):** leave `CF_TUNNEL_TOKEN` empty, run `npm run dev:tunnel` or `npm run dev:all:tunnel`.
- **Named tunnel (recommended):** put Cloudflare tunnel token in `.env`:
  - `CF_TUNNEL_TOKEN=<your-token>`
  - Then run `npm run dev:all:tunnel`

### 5) Cloudflare Access (login protection)

In Cloudflare Zero Trust dashboard:

1. Create an Access application for your tunnel hostname.
2. Add policy to allow only your members (email OTP / Google / allowed domains).
3. Share only the protected URL.

### Notes

- If your local machine sleeps or internet disconnects, remote users cannot access.
- Keep backend bound locally; expose frontend only for safer setup.

### Auto-start on macOS Login/Reboot

To automatically start app + tunnel after login:

1. Install launch agent:
   - `npm run autostart:install`
2. Optional — keep the Mac awake while the tunnel runs (recommended for `app.gymactionplus.com`):
   - Add `APG_CAFFEINATE=1` to `.env` (uses `caffeinate` on macOS; works on battery or AC)
3. Check logs if needed:
   - `~/Library/Logs/com.actionplus.gym/autostart.out.log`
   - `~/Library/Logs/com.actionplus.gym/autostart.err.log`
   - `logs/health-check.log` (single post-boot `OK/FAIL` line)
   - `logs/watchdog.log` (continuous health + auto-restart events)
4. Remove auto-start later:
   - `npm run autostart:uninstall`

If `npm run autostart:install` fails with `Bootstrap failed: 5: Input/output error`, the launch agent was likely disabled in a prior uninstall. Re-run install (the script re-enables it), or run manually:

```bash
launchctl enable "gui/$(id -u)/com.actionplus.gym.autostart"
npm run autostart:install
```

Stop any manually started prod stack (`npm run prod:start`) before installing autostart, so ports `5501` / `4010` are free.

This uses `launchd` with label `com.actionplus.gym.autostart` and runs `npm run dev:all:tunnel` plus the health watchdog (`scripts/watchdog-autorestart.sh`). The local supervisor (`scripts/apg-supervisor.mjs`) auto-restarts the backend if it crashes.
You can also run health check manually with `npm run health:check`.
You can run the watchdog manually with `npm run watchdog:start`.

## Safe Production Workflow (Recommended)

Use this flow to avoid direct production breakage:

1. Create a branch from `main` (`feature/*`, `fix/*`, `hotfix/*`).
2. Implement and test locally.
3. Open a Pull Request to `main`.
4. Wait for CI (`.github/workflows/ci.yml`) to pass.
5. Merge PR to `main`.
6. Run the Cloudflare/origin release step defined in `PROD_DEPLOYMENT.md`.

### Required GitHub Settings

In repository settings, protect `main` with:

- Require a pull request before merging.
- Require status checks to pass before merging:
  - `Run tests`
- Block direct pushes to `main`.
- (Optional) Require at least 1 approval.

### Emergency Hotfix Flow

When production is down:

1. Branch from `main` as `hotfix/<issue>`.
2. Apply the smallest possible fix.
3. Open PR to `main` and pass CI.
4. Merge, then run the Cloudflare/origin release step.
