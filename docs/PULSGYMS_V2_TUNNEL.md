# PulsGyms V2 UI — Cloudflare Tunnel

## Public URL

**https://www.pulsgyms.com** → Next.js V2 UI (`127.0.0.1:3055`)

**https://www.pulsgyms.com/api/**\* → same Express backend (`127.0.0.1:4000`) via Next rewrite

Legacy UI stays on **https://app.gymactionplus.com** (`127.0.0.1:5501`).

## One-time Cloudflare checklist

In [Cloudflare Zero Trust → Networks → Tunnels](https://one.dash.cloudflare.com/):

1. Open the existing named tunnel (same as `app.gymactionplus.com`).
2. **Public Hostname**
   - Subdomain: `www`
   - Domain: `pulsgyms.com`
   - Service: `http://127.0.0.1:3055`
3. DNS: ensure `www.pulsgyms.com` is a CNAME to this tunnel (Cloudflare usually creates this when you add the public hostname).
4. **Access** (optional): if you protect `www.pulsgyms.com` with Cloudflare Access, allow your staff emails/groups. Action Plus login still runs after Access.

Repo tunnel config is already updated in [`cloudflared.config.yml`](cloudflared.config.yml).

## Backend CORS

Add to `backend/.env` (then restart backend):

```bash
CORS_ALLOWED_ORIGINS=https://app.gymactionplus.com,https://www.pulsgyms.com,http://127.0.0.1:5501,http://127.0.0.1:3055
```

(Not strictly required when the browser only calls `/api` on the same host, but safe if any direct API calls happen.)

## Run

Terminal 1 — existing backend (unchanged):

```bash
npm run start:prod
# or your usual backend start
```

Terminal 2 — V2 UI:

```bash
chmod +x scripts/start-pulsgyms-v2.sh
./scripts/start-pulsgyms-v2.sh
```

Terminal 3 — tunnel (if not already running via autostart):

```bash
npm run dev:tunnel
```

Then open **https://www.pulsgyms.com/login**
