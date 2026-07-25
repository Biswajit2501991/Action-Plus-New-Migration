# Production cutover — V2 on app.gymactionplus.com

**Date:** 2026-07-15  
**Status:** Live — `https://app.gymactionplus.com` → Next.js V2 (`127.0.0.1:3055`)

## Routing

| Hostname | Origin | Role |
|----------|--------|------|
| `app.gymactionplus.com` | `http://127.0.0.1:3055` | Production V2 |
| `www.pulsgyms.com` | `http://127.0.0.1:3055` | Same V2 |
| (local only) | `http://127.0.0.1:5501` | Legacy UI (rollback) |
| API | `http://127.0.0.1:4000` | Express (proxied via V2 `/api`) |

Live tunnel config (used by autostart):

`/Users/biswajit/Projects/Action Plus Gym Management App/cloudflared.config.yml`

Repo copy: [`cloudflared.config.yml`](../cloudflared.config.yml)

## Processes

- **Backend + legacy FE + tunnel:** `com.actionplus.gym.autostart` (Projects app)
- **V2 Next.js keepalive:** `com.actionplus.gym.v2` → `~/Library/Application Support/ActionPlusGym/run-v2-keepalive.sh`

## Start / rebuild V2

```bash
export NEXT_PUBLIC_APP_URL=https://app.gymactionplus.com
./scripts/start-v2-prod.sh
```

## Emergency rollback (legacy UI)

1. Edit live `cloudflared.config.yml` — set `app.gymactionplus.com` service to `http://127.0.0.1:5501`
2. Restart the tunnel process (or `launchctl kickstart -k gui/$(id -u)/com.actionplus.gym.autostart`)
3. Confirm `https://app.gymactionplus.com/` serves legacy `index.html`

## Smoke

```bash
curl -sI https://app.gymactionplus.com/login   # expect x-powered-by: Next.js
curl -s https://app.gymactionplus.com/api/health
```
