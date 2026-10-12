# Developer catalog API

Status: read-only integration surface. The API is intentionally limited until resource-specific write permissions are implemented.

## Create a credential

A signed-in organization owner, admin, or manager creates a credential from the merchant app's **Developer API access** panel. Tokens are displayed once, stored as SHA-256 hashes, and can be revoked from the same panel. Keep the token on a trusted server; never embed it in browser JavaScript, mobile bundles, source control, or public URLs.

Current credentials are read-only. A write scope is rejected until the API has resource-specific write scopes and action-level permission checks.

## Read the published catalog

`GET /api/v1/organizations/{organizationId}/integrations/catalog`

Headers:

```http
Authorization: Bearer dlr_live_<token>
Accept: application/json
```

Optional query parameters:

| Parameter | Default | Allowed | Description |
| --- | --- | --- | --- |
| `limit` | `50` | 1–100 | Maximum number of products returned |
| `storeId` | all eligible stores | store ID | Restrict results to one store within the credential's organization |

Example:

```bash
curl --get "https://api.example.com/api/v1/organizations/ORG_ID/integrations/catalog" \
  --header "Authorization: Bearer $DOLLAREUS_API_TOKEN" \
  --data-urlencode "limit=50"
```

The endpoint returns products only when the product is active, at least one variant is active, and the owning store is active, published, and has its commerce or catalog experience enabled. It excludes draft/archived products, inactive variants, unpublished/paused stores, stock counts, customer data, internal product metadata, and private merchant settings.

Each product includes stable IDs, store ID/slug/name, product slug/name/description/kind, availability status/note, and active variants with IDs, titles, option pairs, price in minor currency units, and currency. Prices and availability can change; refresh the API data when rendering or synchronizing content. The endpoint does not currently expose inventory quantities or menu data.

The `limit` parameter is a bounded page size, not cursor pagination. Consumers needing more than 100 products should use `storeId` filtering or request a future cursor-pagination feature; do not assume ordering alone is a durable synchronization cursor.

## Limits and error handling

The configurable `API_CREDENTIAL_DAILY_LIMIT` sets the maximum requests per credential per UTC day; the default is 10,000. The existing IP-level API rate limit also applies. A quota response uses HTTP `429`, code `API_CREDENTIAL_DAILY_QUOTA_EXCEEDED`, and a `Retry-After` header.

Errors use a stable code and request ID:

- `401 INVALID_API_CREDENTIAL`: the token is invalid, expired, revoked, or its issuing account is no longer active.
- `403 API_CREDENTIAL_ORGANIZATION_MISMATCH`: the request targets a different organization.
- `403 API_ROUTE_NOT_ALLOWED`: the credential attempted a route other than the published catalog endpoint.
- `403 API_SCOPE_FORBIDDEN`: the credential lacks the required read scope.
- `429 API_CREDENTIAL_DAILY_QUOTA_EXCEEDED`: the daily quota has been reached.
- `503 DATABASE_UNAVAILABLE` or another 5xx code: retry with backoff and include the request ID when contacting support.

Do not branch on human-readable error messages. Treat the catalog response as a snapshot, handle missing/deactivated products gracefully, and use exponential backoff for transient failures.

## Current limitations

- No write API permissions are available to developer credentials.
- Signed webhooks, event delivery/replay protection, billing, self-service developer registration, cursor pagination, and inventory quantity access are not implemented.
- Production staging verification, monitoring, and an external security review are required before advertising this as a public developer platform.
