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

## Daily Startup (One Command)

From project root, run:

- `npm run prod:start`

What it does:

- verifies/install dependencies when missing
- runs DB migrate + seed safely
- starts frontend + backend + Cloudflare tunnel
- opens the app locally for quick verification

Optional (recommended): set `APG_CAFFEINATE=1` in `.env` to reduce sleep interruptions on macOS.

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
