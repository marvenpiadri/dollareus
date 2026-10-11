# Developer API credentials

Last reviewed: 2026-10-11

Dollareus API credentials let trusted server-side applications access organization-scoped API routes without sharing a merchant's browser session. Use this for approved websites, mobile backends, Mageus integrations, and other authorized clients.

## Credential management

All management endpoints require a signed-in merchant session and an active organization membership with the `owner`, `admin`, or `manager` role.

- `GET /api/v1/organizations/{organizationId}/api-credentials` — list credential metadata and request counts.
- `POST /api/v1/organizations/{organizationId}/api-credentials` — issue a credential.
- `DELETE /api/v1/organizations/{organizationId}/api-credentials/{credentialId}` — revoke an active credential.

Create request:

```json
{
  "name": "Mageus production integration",
  "scopes": ["read"],
  "expiresAt": "2027-01-09T12:00:00.000Z"
}
```

Allowed scopes are `read` and `write`. Expiry is optional; when supplied it must be in the future and no more than 366 days away. The full token is returned only in the creation response. Dollareus stores its SHA-256 hash, not the usable secret. Copy it immediately and keep it in a trusted server-side secret store.

## Calling the API

Send the token in the Authorization header and use only routes under the credential's organization:

```sh
curl "https://YOUR_API_HOST/api/v1/organizations/ORG_ID/products" \
  -H "Authorization: Bearer dlr_live_YOUR_TOKEN"
```

A credential cannot access a different organization. `read` permits GET/HEAD operations; `write` permits mutating methods. The existing endpoint's organization membership, resource ownership, and role checks still apply. API credentials cannot issue, list, or revoke other credentials.

## Metering and revocation

Authenticated API requests are recorded with organization, credential, request ID, method, route template, status code, and timestamp. The merchant workspace shows per-credential request totals and last-used timestamps. Revocation immediately prevents future authentication with that token.

## Not yet included

Request counts are metering, not billing. Quotas, paid plans, usage exports, webhook delivery/signature verification/retries, public OpenAPI specifications, and production load/security testing remain separate launch tasks. Do not treat API credentials as safe for browser bundles or public source code.
