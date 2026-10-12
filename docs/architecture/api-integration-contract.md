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
- API credentials must be scoped to the organization, stored hashed, revocable, and never shown again after issuance. Credential-management actions require an interactive merchant session. Do not expose broad administrative permissions to a publishing integration merely because it can read products.

## Future publishing integration

A typical third-party blog/CMS integration should be able to:
1. Obtain a merchant-authorized, read-only credential for selected commerce data.
2. Read published product/catalog/menu data and save canonical IDs alongside its own article content.
3. Refresh price/availability from Dollareus when rendering or synchronizing content.
4. Subscribe to product/availability webhooks when webhook delivery is implemented; verify signatures and handle duplicate/retried events idempotently.
5. Disconnect by revoking the credential without deleting editorial content or commerce records.

Write access must be opt-in and limited to the minimum resources/actions needed. Reading catalog data must not grant inventory adjustment, payment/refund, credential management, or organization administration.

## Phase 3 release gates

- [ ] Route-by-route authorization and tenant-isolation review, including developer credentials.
- [ ] Stable idempotency semantics and conflicting-payload tests for order, POS, payment, refund, and inventory mutations.
- [ ] Documented pagination, filtering, rate limits, error codes, and compatibility policy.
- [ ] Webhook signing, retries, delivery logs, and replay protection before claiming event-driven integrations.
- [ ] Quota enforcement and usage visibility before offering public developer access.
- [ ] Migration drift check, staging migration, backup/restore rehearsal, and deployment rollback procedure.
- [ ] Browser-level acceptance and live database/object-storage verification before public launch.
