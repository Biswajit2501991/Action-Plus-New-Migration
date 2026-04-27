# Backend API Contract (Draft)

## Auth
- `POST /api/auth/login`
  - request: `{ id, password }`
  - response: `{ token, user }`
- `POST /api/auth/logout`

## Members
- `GET /api/members`
- `GET /api/members/:memberId`
- `POST /api/members`
- `PUT /api/members/:memberId`
- `DELETE /api/members/:memberId`
- `PUT /api/members/bulk-status`
  - request: `{ memberIds: string[], status: "Active"|"Hold"|"Deactivated"|"Cancelled", holdDuration?: string }`

## Users / Staff
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `PUT /api/users/:id/block`
  - request: `{ blocked: boolean, reason?: string }`

## Settings
- `GET /api/settings`
- `PUT /api/settings`

## Logs
- `GET /api/logs`
- `POST /api/logs`

## Backup
- `GET /api/backup/export`
- `POST /api/backup/import`

