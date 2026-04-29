# Backend Phase 1 Scaffold

This folder contains the Phase 1 implementation pack for multi-tenant onboarding:

- SQL migrations (`migrations/`)
- permission seed script (`seeds/`)
- OpenAPI skeleton (`openapi/openapi.yaml`)
- backend scaffold + first auth/tenant middleware (`src/`)

## Suggested stack

- Node.js 20+
- PostgreSQL 14+
- Express (or Fastify/Nest, if preferred)

## Next steps

1. Create DB and run `migrations/0001_init_multitenant.sql`
2. Run `seeds/0001_seed_permissions.sql`
3. Implement route handlers using `openapi/openapi.yaml`
4. Wire middleware from `src/middleware/` into your server entry

## Notes

- All business data must be scoped by `tenant_id`.
- Auth token should carry `tenantId`, `userId`, and permission/role claims.
- `resolveTenant` middleware should be executed before business handlers.
