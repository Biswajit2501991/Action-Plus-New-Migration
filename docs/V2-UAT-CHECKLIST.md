# V2 UAT checklist — owner / manager / restricted / mobile More

Use this before cutting over production. Mark each row after real account testing.

## Environments
- [ ] V2 running via `scripts/start-v2-prod.sh` (or `frontend` `npm run build && npm start`)
- [ ] `scripts/smoke-v2.sh` passes against UI `:3055` and API `:4000`
- [ ] Tunnel hostname points at `:3055` for the beta domain

## Owner account
- [ ] Login / logout punches attendance
- [ ] Late note auto-popup (flag on) with X close
- [ ] Header **Alerts** bell: leave Approve/Reject, password reset Approve/Reject, visitor Mark as called
- [ ] Leave Tracker page approve/reject still works
- [ ] Staff: create / edit / block / delete
- [ ] Role templates: add / edit / delete / create staff from template
- [ ] Members: add / edit / hold / deactivate / delete
- [ ] Payments: add / edit / delete (owner-only delete)
- [ ] Paid-for-month month picker updates membership month
- [ ] Visitors: add form, edit, mark called, delete
- [ ] Finance → Payment QR: create, edit, upload image, active/inactive
- [ ] Undo / Redo header controls restore recent list state
- [ ] WhatsApp custom templates CRUD
- [ ] Settings feature flags + gym codes / shifts
- [ ] Logs export + clear
- [ ] Backend health cards

## Manager / branch owner
- [ ] Sees only assigned branch data
- [ ] Password-reset approve/reject for branch staff
- [ ] Cannot delete payments (owner-only) — verify error toast
- [ ] Cannot manage role templates (or read-only create staff from templates)
- [ ] Can manage members, finance expenses, leave approve

## Restricted staff
- [ ] Sections honor access map (hidden nav items)
- [ ] Cannot open Staff / Backend / Settings if denied
- [ ] Members: view-only when edit denied
- [ ] Dashboard search stays on Dashboard
- [ ] Submit own late note when flag + permission on

## Mobile More paths
- [ ] Bottom tabs: Home / Members / PT / Staff / Leave
- [ ] More → Finance, Attendance, WhatsApp, Settings, Logs
- [ ] Members expand permission hides phone until expanded
- [ ] Staff list is read-oriented; edits on desktop if required
- [ ] Password-reset bell usable on mobile header
- [ ] Late note popup on mobile login

## Regression spot-checks
- [ ] Branch switch refreshes members/finance
- [ ] Day/Night theme persists and matches controls
- [ ] Command palette (⌘K) opens
- [ ] No console errors on main flows

## Sign-off
| Role | Tester | Date | Pass? |
|------|--------|------|-------|
| Owner |  |  |  |
| Manager |  |  |  |
| Restricted |  |  |  |
| Mobile |  |  |  |
