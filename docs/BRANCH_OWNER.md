# Branch Owner role

## Enable

Set in backend environment:

```bash
BRANCH_OWNER_ENABLED=true
```

Run migration: `backend/migrations/supabase_branch_owner_role.sql`

Restart API after deploy.

## Hierarchy

| Role | `staff_role` | Scope |
|------|----------------|--------|
| Master Owner | `master_owner` (login `owner`) | All branches |
| Branch Owner | `branch_owner` | Assigned branches only (`staff_branch_assignments`) |
| Staff | `staff` | Single home branch |

## Master-only (unchanged)

- Gym code create/delete
- Settings bulk / role templates
- Backups, storage, process control, test purge
- Creating other Branch Owners (assign `staff_role` + branches via Master Staff UI)
- Deleting lookup values added by Master Owner

## Branch Owner capabilities

- Members: add/edit/delete within assigned branches (with `deleteMembers` permission)
- Staff: add/edit/delete within assigned branches (cannot promote to `branch_owner`)
- Templates: WhatsApp/Support per assigned branch (branch picker when multiple)
- Settings lookups: **add** new values; **delete** only rows they added (`created_by_role = branch_owner`)

## JWT claims (when enabled)

- `staffRole`
- `allowedBranchIds[]`
- `activeBranchId` / `gymCodeId` (active branch for writes)

## API

- `PATCH /api/auth/active-branch` — switch active branch (body: `{ gymCodeId }`), returns new token
- `GET /api/users` — scoped list for Branch Owner
- `PUT /api/users/bulk` — scoped writes; cannot assign `branch_owner`

## Promote a Branch Owner (Master)

1. Staff Management → edit user
2. Set `staffRole` to `branch_owner` in persisted user payload (UI field when added) or DB:
   - `staff_users.staff_role = 'branch_owner'`
   - Rows in `staff_branch_assignments` for each branch
3. Grant sections/access (templates, members, staff, etc.)

Until UI exposes role picker, Master can set via Supabase or extended Staff form in a follow-up.
