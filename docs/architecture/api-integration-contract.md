# Dollareus API and integration contract

Status: architecture baseline for Phase 3. This document defines the boundary future clients—including Mageus—must use; it does not implement a Mageus dependency.

## Product ownership

- **Dollareus owns operational commerce truth:** organizations, stores, products, variants, categories, menus, inventory, orders, payments/refund records, fulfillment, and commerce audit events.
- **Publishing clients own editorial truth:** posts, articles, magazines, collections, feeds, comments, audience relationships, and presentation.
- A publishing client may store a stable Dollareus resource ID and a display snapshot for editorial stability. Live price, stock, order state, and other operational values must be refreshed from the authorized Dollareus API rather than independently treated as authoritative.
- Mageus is one possible API client, not a privileged subsystem. Do not add Mageus-specific columns, database joins, runtime dependencies, or authorization exceptions to Dollareus before a separately reviewed integration contract exists.

## Database and deployment boundary

- Keep the Dollareus operational schema owned and migrated by Dollareus.
- Do not make Mageus depend on Dollareus tables, or Dollareus depend on Mageus tables. Do not share a mutable application schema.
- Identity may eventually use a dedicated identity provider or explicit federation. Shared login does not imply shared application tables, organization membership, or authorization.
- Integrations cross the boundary through versioned HTTP APIs, scoped credentials, and (when implemented) signed webhooks.

## API conventions

- Versioned public integration routes use the `/api/v1` prefix.
- Organization-scoped routes must verify that the credential/session is authorized for the organization in the URL. Resource queries and mutations must also include the organization boundary; store-specific resources must validate their store belongs to that organization.
- Preserve stable opaque IDs. Do not require clients to derive IDs from slugs or display names.
- Return structured errors with a stable `error.code`, a safe human-readable `error.message`, and `requestId`. Clients should branch on codes, not message text.
- Use server-authoritative pricing and inventory. Client totals are estimates only.
- Mutations that may be retried need idempotency keys. Reusing a key for a different payload must return a conflict, not silently replay a different operation.
- Public storefront routes must expose only intentionally published data. Private merchant/customer data must remain behind authorization.
- API credentials must be scoped to the organization, stored hashed, revocable, and never shown again after issuance. Credential-management actions require an interactive merchant session. Current developer credentials are restricted to `GET /api/v1/organizations/{organizationId}/integrations/catalog`, which returns active products/variants only for active, published stores with catalog/commerce enabled. They cannot read private product-management endpoints or perform mutations. Credentials are subject to a configurable per-credential daily quota (`API_CREDENTIAL_DAILY_LIMIT`, default 10,000 requests per UTC day). Write credentials are deliberately disabled until resource-specific scopes and action-level authorization are implemented.

## Future publishing integration

A third-party blog/CMS integration can use `GET /api/v1/organizations/{organizationId}/integrations/catalog` with a read-only credential to retrieve published product data and save canonical IDs alongside its own editorial content. The endpoint excludes draft products, inactive variants, and unpublished/paused stores. It returns only fields intended for catalog display, not private merchant settings, inventory counts, customer data, or internal product metadata. Signed product/availability webhooks remain future work; until then clients must poll conservatively. Disconnect by revoking the credential without deleting editorial content or commerce records.

Write access is intentionally unavailable. Before enabling it, add resource-specific scopes and test that catalog integrations cannot change inventory, manage payments/refunds, manage credentials, or administer organizations.

## Phase 3 release gates

- [ ] Route-by-route authorization and tenant-isolation review, including developer credentials.
- [x] Conflicting-payload replay tests for order, POS, payment and refund idempotency keys; inventory-return idempotency is covered by API smoke tests. Continue extending idempotency coverage to any new mutating endpoints.
- [x] Documented bounded catalog result limits/filtering, rate limits, error codes, and an initial API compatibility policy in [the developer catalog API guide](../api/developer-catalog.md). Cursor pagination is not implemented.
- [ ] Webhook signing, retries, delivery logs, and replay protection before claiming event-driven integrations.
- [x] Configurable daily per-credential request quota and usage visibility are implemented and covered by API smoke tests. Public developer access still requires documentation, monitoring, abuse review and an explicit launch decision.
- [x] CI applies migrations and checks schema version/checksums for drift. [ ] Staging migration, backup/restore rehearsal, and deployment rollback procedure still require environment access and operational verification.
- [ ] Browser-level acceptance and live database/object-storage verification before public launch.
