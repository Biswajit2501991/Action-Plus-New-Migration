# Action Plus Gym Manager V2 Frontend

Modern Next.js 15 + React 19 frontend that talks to the existing Express backend without schema or endpoint changes.

## Develop

From repo root (backend already running on port 4000):

```bash
npm run install:frontend
npm run dev:frontend
```

Open **http://127.0.0.1:3055** (port `3055` — not `3000`, to avoid clashing with other local apps).

Requires **Node.js 18.18+** (Homebrew Node is preferred: `/opt/homebrew/bin/node`). System Node 18.16.1 will refuse to start Next.js 15.

API calls to `/api/*` are rewritten to `API_PROXY_TARGET` (default `http://127.0.0.1:4000`).

## Build

```bash
npm run build:frontend
npm run start:frontend
```

Production/start also binds to **3055**.

## Notes

- Auth session key remains `apg.auth.session` for compatibility with the legacy app.
- Marketing and Inventory nav items are present but marked Coming Soon until backend APIs exist.
- Domain rules for permissions and finance KPIs are ported from `src/features/*`.
