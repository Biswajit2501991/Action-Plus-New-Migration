# Action Plus Gym App - Tester Checklist (One Page)

Use this checklist for functional UAT on the hosted app.

## 1) Access and Login

- [ ] Open the shared HTTPS URL.
- [ ] Login works for `owner / owner`.
- [ ] Login works for `manager / manager`.
- [ ] Blocked staff cannot login (shows message).
- [ ] Logout works and returns to login page.

## 2) Dashboard

- [ ] Status cards (Active/Hold/Deactivated/Cancelled) show correct counts.
- [ ] Search only applies when Search button is clicked.
- [ ] Overdue list updates automatically when `Payment By` changes:
  - [ ] if due date < today -> appears in overdue
  - [ ] if due date >= today -> removed from overdue
- [ ] `View Details` from overdue opens the correct member list view.

## 3) Members Board

- [ ] Member groups render: Active, Hold, Deactivated, Cancelled.
- [ ] Row details are visible and readable (not white-on-white).
- [ ] Edit Member saves correctly.
- [ ] Hold logic works:
  - [ ] Hold Duration set -> Status becomes Hold
  - [ ] Status Hold requires Hold Duration
- [ ] Form Number is editable only by owner.
- [ ] Pagination works (10 rows per page).
- [ ] Bulk actions (Activate/Hold/Deactivate) work for selected rows.

## 4) Finance

- [ ] Finance values auto-sync from Members (no manual transaction dependency).
- [ ] Revenue Trend and Plan Popularity update after member amount/plan edits.
- [ ] Transaction rows expand and show latest logs for that member.

## 5) Staff and Role Access

- [ ] Owner can add/edit/delete staff (except self-protection rules).
- [ ] Owner cannot edit/delete own owner row.
- [ ] Block/Unblock staff works.
- [ ] Role templates can be:
  - [ ] created
  - [ ] edited
  - [ ] deleted
  - [ ] applied to staff section access

## 6) WhatsApp SMS

- [ ] Sections are visible inside WhatsApp SMS:
  - [ ] Reminder
  - [ ] Month-Based Reminder
  - [ ] Fine SMS
  - [ ] Deactivate SMS
  - [ ] Hold SMS
  - [ ] Success SMS
- [ ] Each SMS template shows compact preview and can Expand/Collapse.
- [ ] Each template can be edited.
- [ ] `Send Now` opens WhatsApp URL with populated placeholders.
- [ ] Search section lists members by selected SMS condition and allows Send.
- [ ] Status-trigger SMS events are logged and visible in recent activity.

## 7) Logs (Audit Command Center)

- [ ] Logs table loads with filters (user/action/entity/time range/search).
- [ ] Expand row shows before/after JSON.
- [ ] Owner can clear logs.
- [ ] Export CSV downloads correctly.
- [ ] Undo/Redo actions appear in logs (`history.undo`, `history.redo`).

## 8) Undo/Redo (Global)

- [ ] Back/Forward arrows visible in sidebar.
- [ ] Undo works up to 5 steps.
- [ ] Redo works up to 5 steps.
- [ ] Buttons enable/disable correctly based on available steps.

## 9) Visual and Layout

- [ ] Light theme only (no dark mode behavior).
- [ ] Sidebar remains stable; logout stays pinned in bottom box.
- [ ] No overlapping text or unreadable content on main pages.

## 10) Data Safety and Edge Cases

- [ ] Large image upload warns/handles correctly.
- [ ] App does not crash on member update.
- [ ] Storage-full warning appears when local storage limit is hit.
- [ ] Backup export/import works and restores data.

## Final Sign-off

- Tester Name: ______________________
- Date: _____________________________
- Browser/Device: ___________________
- Result:
  - [ ] PASS
  - [ ] PASS with minor issues
  - [ ] FAIL (blocking issues)
- Notes / Defects:
  - _______________________________________________
  - _______________________________________________
  - _______________________________________________
