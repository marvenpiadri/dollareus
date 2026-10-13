# Dollareus authentication standard

## Decision

Better Auth is the target shared authentication framework for Dollareus and Mageus. Dollareus remains the business-management API and Mageus remains the publishing, community, and commerce experience. Both should use Fastify 5 API conventions where they own an API.

Important: the current Dollareus `apps/api/src/auth.ts` contains a custom PostgreSQL-backed authentication/session implementation. Adding Better Auth requires a real migration; the current implementation must not be described as Better Auth.

## Target responsibilities

- Better Auth owns credentials, password verification, sessions, secure cookies, OAuth account linking, and session lifecycle.
- Fastify 5 integrates Better Auth request handling while retaining domain-specific routes, hooks, validation, rate limits, and structured errors.
- PostgreSQL stores authentication data and product-domain data. Authentication tables are migrated explicitly.
- Zod validates domain API input. Server-side authorization remains mandatory for organization membership, resource ownership, API credentials, and business permissions.
- Long-lived organization API credentials are distinct from browser sessions and remain scoped, revocable, auditable, and quota-limited.

## Migration requirements

1. Inspect all current auth routes, OAuth callbacks, session consumers, API credential behavior, database schema, and authorization assumptions.
2. Map existing user IDs and verified emails into Better Auth without silently duplicating accounts or breaking organization memberships, audit events, orders, or ownership references.
3. Decide and document username support and uniqueness rules before schema migration.
4. Preserve organization-scoped developer credentials as a separate machine-to-machine mechanism; do not turn them into user sessions.
5. Introduce Better Auth and the new schema additively. Maintain a rollback plan and an explicit session cutover policy.
6. Update Fastify request identity typing and route authorization to use the Better Auth session user consistently.
7. Remove custom password/session/OAuth code only after equivalent behavior is implemented and verified.
8. Verify production build/typecheck, registration, login, logout, expiry, OAuth state/callback, account linking, CORS/CSRF behavior, organization authorization, and developer API credentials.

## Shared API philosophy

- Fastify 5 owns HTTP lifecycle, plugins, security headers, rate limits, request IDs, and error formatting.
- Zod validates request bodies, query strings, and path parameters.
- PostgreSQL is required for persistent behavior; migrations are explicit and versioned.
- Private routes authenticate and authorize on the server.
- API errors use stable machine-readable codes and safe messages.
- Never log passwords, session tokens, cookies, OAuth secrets, or API credentials.

## Safety

Do not drop legacy auth tables, reset user records, invalidate every session, or apply production migrations until the actual deployed schema and rollback procedure are confirmed. A successful code build does not prove production data migration or browser session behavior.
