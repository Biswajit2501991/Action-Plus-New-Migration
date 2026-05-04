# Backend Phase 1 Scaffold

This folder contains the Phase 1 implementation pack for multi-tenant onboarding:

- SQL migrations (`migrations/`)
- permission seed script (`seeds/`)
- OpenAPI skeleton (`openapi/openapi.yaml`)
- backend scaffold + first auth/tenant middleware (`src/`)

## Suggested stack

- Node.js 20+
- SQLite 3 (local file DB via `better-sqlite3`)
- Express (or Fastify/Nest, if preferred)

## Next steps

1. Set `DATABASE_PATH` (optional). Default is `backend/data/app.db`
2. Run `npm install`
3. Run `npm run db:migrate`
4. Run `npm run db:seed`
5. Start backend with `npm run dev`

## Notes

- All business data must be scoped by `tenant_id`.
- Auth token should carry `tenantId`, `userId`, and permission/role claims.
- `resolveTenant` middleware should be executed before business handlers.
