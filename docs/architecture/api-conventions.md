# API conventions

Dollareus is API-first: its merchant dashboard and Mageus integration should use the same public contracts, with permissions scoped to each client.

## Resource conventions
- Prefix HTTP endpoints with `/api/v1`.
- Use plural nouns: `/stores`, `/products`, `/orders`, `/media/uploads`.
- Use JSON request and response bodies with explicit schemas.
- Return stable IDs, timestamps, and a request ID.
- Use cursor pagination: `?limit=50&cursor=...`.
- Use a consistent error shape: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- Validate all untrusted input on the server.

## Security
- Browser clients never receive service-account credentials or payment secrets.
- Determine organization membership from verified identity and server-side records, not client-submitted organization IDs.
- Apply least-privilege scopes to Mageus and third-party integrations.
- Rate-limit public storefront, login, upload-intent, QR redirect, and checkout endpoints.
- Audit permission changes, refunds, inventory adjustments, and invoice finalization.

## Reliability
- Accept idempotency keys for checkout, order creation, and provider webhooks.
- Treat payment-provider and fulfillment callbacks as untrusted, verify signatures, and make handlers idempotent.
- Use reliable events/outbox patterns when changes need to reach other systems.
- Document compatibility and version breaking changes.

## Commerce correctness
- Represent money in integer minor units with an ISO currency code.
- Keep tax calculation behind a country-aware interface; never hardcode one universal tax rate.
- Snapshot item descriptions and prices on order lines.
- Represent inventory as locations, reservations, and append-only movements rather than only a mutable count.
