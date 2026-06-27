# Production Deployment Source of Truth

This project uses **Cloudflare-routed hosting** as the production source of truth for:

- `https://app.gymactionplus.com/`

## Important Rule

- Production is **not** deployed from GitHub Pages.
- Production updates happen only through the Cloudflare-backed origin path.

## Branch and Merge Safety

- Develop on feature branches (`feature/*`, `fix/*`, `hotfix/*`).
- Open Pull Request into `main`.
- CI must pass (`Run tests`).
- Merge after review.
- Branch protection on `main` is required.

## Release Process (Cloudflare Source)

1. Implement and validate locally.
2. Push feature branch and open PR.
3. Wait for CI pass and approval.
4. Merge into `main`.
5. Run your Cloudflare/origin release step (the process that serves `app.gymactionplus.com`).
6. Verify production:
   - Open `https://app.gymactionplus.com/`
   - Smoke test login, dashboard, member updates, and settings.

## Daily Startup

**Background (recommended — safe to close terminal):**

```bash
npm run prod:daemon
```

**Foreground (terminal must stay open):**

```bash
npm run prod:start
```

What `prod:daemon` does:

- registers/uses macOS **launchd** (`com.actionplus.gym.autostart`)
- starts frontend + backend + Cloudflare tunnel + health watchdog
- survives terminal close, login/reboot (with `autostart:install`), sleep/network recovery

One-time install (login + reboot auto-start):

```bash
npm run autostart:install
```

Status: `npm run autostart:status`

Optional (recommended): set `APG_CAFFEINATE=1` in `.env.prod` to reduce sleep interruptions on macOS.

## 24/7 auto-recovery (sleep + network)

With `npm run autostart:install`, the stack runs under **launchd** (`KeepAlive`) and a **watchdog** (`scripts/watchdog-autorestart.sh`):

| Event | Behaviour |
|-------|-----------|
| Login / reboot | launchd starts app + tunnel + watchdog |
| Process crash | launchd `KeepAlive` restarts autostart script |
| Laptop wakes from sleep | Watchdog detects time gap → health check → auto-restart if unhealthy |
| Network drops | Watchdog waits; when connectivity returns → auto-restart if unhealthy |
| Health fails 2× (30s interval) | Kills stale processes + `launchctl kickstart` relaunch |

Check: `npm run autostart:status`  
Logs: `logs/watchdog.log`

**Note:** If the Mac is fully powered off or the lid is closed for extended sleep with no network, remote users cannot reach the app until the Mac wakes and recovery completes (~1 minute).

## Daily Health Check

- `npm run prod:health`

## Stop Production Session

- Press `Ctrl + C` in the terminal running `npm run prod:start`.

## Hotfix Process

1. Create `hotfix/<issue>` from `main`.
2. Keep fix minimal and targeted.
3. PR to `main`, pass CI, get approval.
4. Merge and run Cloudflare/origin release step.
5. Verify in production immediately.

## Rollback Guideline

- Keep previous known-good release/tag.
- If regression occurs, redeploy previous known-good origin build.
- Validate critical paths after rollback.
