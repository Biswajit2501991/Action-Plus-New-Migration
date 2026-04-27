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

## GitHub Pages (HTTPS Hosting)

This repo includes:

- `.github/workflows/deploy-pages.yml` (GitHub Actions deploy workflow)
- `.nojekyll` (prevents Jekyll processing issues on static projects)

To host and share over HTTPS:

1. Push the project to a GitHub repo on `main`.
2. Open GitHub repo -> `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Wait for the workflow to complete in the `Actions` tab.

Your app URL will be:

- `https://<your-username>.github.io/<your-repo>/`

Note: this app stores data in browser `localStorage`, so data is per browser/device and not shared in real time across users.
