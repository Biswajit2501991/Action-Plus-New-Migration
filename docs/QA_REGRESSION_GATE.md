# QA regression gate (Action Plus Gym)

Use this checklist on every PR that touches app behavior.

## Impact scan

- [ ] Routes / tabs (`activeTab` in `index.html`, v2 routes in `v2/src/App.tsx`)
- [ ] Backend routes (`backend/src/server.js`)
- [ ] Supabase writes (`backend/src/db/supabase/repository.js`)
- [ ] Auth (`staffAuth.js`, `requireApiAuth`, session in `apg.auth.session`)
- [ ] Permissions (`src/features/access/permissions.js`, `staff_user_sections`)
- [ ] Bulk sync debouncers in `index.html` (members, users, visitors)

## Required tests

- [ ] `npm test` (unit)
- [ ] `npm run test:e2e:smoke` when auth/staff/members/sync changed
- [ ] Manual owner login + affected tab

## Staff / users changes

- [ ] `PUT /users/bulk` upsert-only (no orphan delete)
- [ ] Save order: bulk before `admin-set-password` for new users
- [ ] Owner sections = all modules after login

## Data safety

- [ ] `PUT /members/bulk` must not send empty array in production flows
- [ ] No reset path that wipes Supabase without explicit operator intent
