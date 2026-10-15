# Mageus identity and Dollareus application boundary

## Product decision

Dollareus is the private commerce and business-operations application inside the Mageus ecosystem. It is not a second, unrelated account system that merchants must register for separately.

A person creates and manages their primary account through Mageus. That same identity must be accepted by Dollareus, subject to authorization. A valid Mageus account is necessary to sign in, but it does not automatically grant access to every organization, store, order, customer record, or administrative capability.

Dollareus remains a separately deployable, separately versioned commerce engine and system of record. It is semi-independent in implementation, but not independent in identity, product strategy, or first-party user experience.

## Product surfaces: private workspace vs public storefronts

"Private application" applies to the merchant/operator workspace and its management APIs. It does **not** mean all Dollareus URLs or commerce data must become private.

- Private: merchant workspace, organization settings, products and menus in draft, inventory, POS operations, customers, orders, staff administration, private media, and management APIs.
- Public by deliberate publication: SEO storefronts, published catalogs and menus, public business profiles, public QR destinations, and explicitly shared product/service pages.
- Public customer access must not require a Mageus account merely to browse a published business page. Account creation may be required for future features only when the workflow genuinely needs an identity.

## Identity and sign-in architecture

### Target

- Mageus is the first-party identity authority for people using the Mageus ecosystem.
- Dollareus is an OAuth/OIDC relying party and commerce resource server for the Mageus application.
- The Dollareus login and registration entry points redirect to Mageus sign-in/registration and return through a registered callback. Dollareus must not create a separate password credential for a person who already has a Mageus identity.
- Use Authorization Code flow with PKCE, strict redirect URI allowlists, state and nonce validation, short-lived audience-specific access tokens, rotation/revocation for refresh credentials, and secure HttpOnly, Secure, appropriately SameSite cookies where browser sessions are needed.
- Validate issuer, audience, signature, expiry, nonce/state, and required claims on the server. Never trust a user ID, organization ID, role, store ID, or permissions supplied only by browser state.
- Link identities by an immutable provider subject (issuer + sub), not by email alone. Email can change and must not be used as an automatic account-merging key.
- The browser must not receive client secrets or long-lived service credentials. Mageus-to-Dollareus server integration uses a separately authorized, narrowly scoped service identity.

### Current repository assessment (2026-10-16)

The current Mageus frontend is **not yet a verified OIDC identity provider**:

- The login form calls the existing Mageus API's `/token/loguser` endpoint; registration calls `/create/account`.
- The frontend stores the returned JWT in browser `localStorage` under `token` and decodes claims client-side. The HTTP interceptor forwards that token to Mageus API requests.
- The Angular guards check login state in the browser. They are not an OIDC authorization server and do not, by themselves, protect API resources.
- The reviewed routes and services do not establish a standards-compliant OIDC discovery document, authorization endpoint, token endpoint, JWKS/signing-key publication, PKCE callback flow, or issuer/audience contract.
- Dollareus currently has its own server-managed session records and HttpOnly `dollareus_session` cookie, plus a legacy bearer-token compatibility path for sessions. Its auth endpoints and identity store therefore remain separate today.

These findings mean that the desired shared login is a **real identity-provider phase**, not just a frontend redirect. Before wiring the applications together, choose one of two deliberate options: (1) add a standards-compliant OIDC provider to the Mageus backend, or (2) introduce a shared identity provider used by both Mageus and Dollareus. Keep the existing sign-in routes functional until the new flow is verified.

Do not copy Mageus passwords, share browser local storage across domains, trust unsigned user IDs, or accept arbitrary bearer tokens. Do not simply remove Dollareus password authentication or expose protected routes until provider discovery, callback/state/nonce/PKCE validation, server-side session creation and revocation, account linking, migration, and recovery behavior are implemented and verified end to end.

## Authorization and tenant isolation

Authentication answers "who is this person?" Authorization separately answers "what may this person do here?"

- Every private Dollareus API request must validate a trusted session/token and then enforce active organization membership and the action's required role/scope.
- A Mageus login alone must not grant access to any organization's business data.
- Organization and store identifiers in request paths must be checked against server-side membership. Never rely on frontend route guards as the security boundary.
- Keep organization data isolated in the database and enforce permissions in the API, including background jobs and file/media retrieval.
- Record security-sensitive changes and integration access in audit events. Support session revocation and removal of organization membership without deleting the person's Mageus identity.
- Future marketplace roles (seller, staff, operator, buyer) must be scoped to the relevant organization or transaction rather than treated as global privileges.

## Commerce ownership and integration

- Dollareus remains the source of truth for organizations, stores, catalog items, variants, prices, inventory, menus, operating configuration, POS records, and future order/fulfilment workflows.
- Mageus owns its publishing, articles, communities, discovery, and social experiences. It may display authorized Dollareus commerce projections and link to or embed products, but must not create a competing catalog database.
- Use versioned APIs and narrowly scoped server-side integration credentials. Revoke integrations cleanly and attribute writes/orders to their originating channel.
- Public APIs expose only intentionally published fields. Private object-storage keys, drafts, internal notes, customer records, and management data must never appear in public projections.

## Migration plan

1. Inventory the current Mageus sign-in/session/token implementation and Dollareus first-party auth endpoints, cookie/session behavior, user identifiers, and membership checks.
2. Select and document the authoritative Mageus identity issuer and stable subject format. Specify local, staging, and production issuer/audience values.
3. Implement OIDC Authorization Code + PKCE, callback/state/nonce validation, secure session creation, logout/revocation, and protected callback error handling.
4. Add a safe account-linking/migration path for existing Dollareus users. Resolve collisions explicitly; do not auto-merge by email alone.
5. Replace Dollareus public registration with a Mageus redirect once the shared sign-in flow is verified. Keep a temporary, controlled migration path only if needed.
6. Audit every private API and media route for server-side identity, organization membership, and role checks. Keep published storefront routes public.
7. Test cross-domain login/logout, expired/revoked sessions, unverified accounts, callback replay/state mismatch, unauthorized organizations, staff roles, account collisions, SSR behavior, and direct API requests.
8. Only then consider the identity integration complete. Keep Dollareus deployable separately, with explicit API contracts and its own commerce data ownership.

## Acceptance criteria

- A person can register or sign in once through Mageus and enter Dollareus without creating a second password account.
- Dollareus rejects untrusted, expired, wrong-issuer, wrong-audience, or revoked credentials.
- Signing in through Mageus does not grant access to a business unless server-side membership and role checks allow it.
- Removing a user's organization access immediately prevents further protected access while leaving the Mageus identity intact.
- Published Dollareus storefronts, catalogs, menus, and QR entry points remain accessible according to their publication settings.
- Mageus and Dollareus can be deployed independently without duplicating canonical commerce records.
- There is a documented, tested migration path for existing Dollareus credentials and sessions.
