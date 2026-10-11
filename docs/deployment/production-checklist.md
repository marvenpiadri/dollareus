# Production deployment checklist

Last reviewed: 2026-10-11

This is a staged rollout checklist, not a claim that production infrastructure is already configured. Start with a private staging deployment and a test organization. Do not accept real payments until the payment and inventory gaps in [launch readiness](../launch-readiness.md) are closed.

## 1. Prepare the database

- [ ] Create a dedicated Neon PostgreSQL database for staging and a separate one for production.
- [ ] Store each environment's `DATABASE_URL` only in the API host's server-side secret settings.
- [ ] Confirm backups/retention are enabled and test a restore before production data is accepted.
- [ ] On a genuinely empty database only, review and run the repository's one-time `pnpm db:setup` command. Do not rerun it blindly against an existing database.
- [ ] Compare the resulting tables/indexes against `apps/api/db/schema.sql` and confirm the deployed API can execute authenticated smoke workflows.

Neon usage charts showing query/connection spikes are supporting evidence of database activity, not a complete health or correctness test.

## 2. Configure API runtime secrets

Use the environment variable names documented in the root `.env.example`. Configure secrets in the hosting provider; never place them in Angular/frontend environment files or commit them.

- [ ] `DATABASE_URL` and, if needed, `DATABASE_POOL_MAX`
- [ ] `NODE_ENV=production`, `PORT`, and `HOST` as required by the host
- [ ] `CORS_ORIGINS` set to the exact production merchant origin(s), with no wildcard
- [ ] `AUTH_EMAIL_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_PUBLIC_URL`
- [ ] Google OAuth credentials and production callback URL, if Google login is enabled
- [ ] Facebook OAuth credentials and production callback URL, if Facebook login is enabled
- [ ] `AUTH_SUCCESS_REDIRECT_URL` for the intended production frontend
- [ ] `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `AWS_S3_BUCKET` if product media is enabled
- [ ] `PUBLIC_STORE_DOMAIN` or `PUBLIC_STOREFRONT_BASE_URL` for public store URLs
- [ ] Rotate any object-storage credentials that were shared outside the secret manager before production use.

Do not enable an OAuth provider until its redirect URI, consent configuration, and test account have been verified. Do not enable product media until a real upload/read/delete-or-cleanup round-trip is verified against the intended bucket.

## 3. Deploy and verify the merchant app and API

- [ ] Deploy the API and merchant frontend to staging; configure the frontend API base URL or a same-origin reverse proxy.
- [ ] Configure SPA history fallback/rewrites for `/app`, `/qr`, `/menu`, and `/{storeSlug}/menu`, plus wildcard subdomain routing if using `PUBLIC_STORE_DOMAIN`.
- [ ] Verify HTTPS, secure session cookies, proxy configuration, request limits, and allowed origins.
- [ ] Run registration, email verification, login/logout, password reset, session expiry/revocation, and enabled OAuth-provider tests.
- [ ] Create a test organization, store, category, product/variant, inventory location, restaurant menu, and menu item.
- [ ] Publish/unpublish the storefront and verify public endpoints expose only published and available data.
- [ ] Open the public restaurant menu from a QR link and confirm active menus, categories, allergens, dietary labels, and modifier choices render without a merchant login. This page is menu browsing only; online customer ordering is not available yet.
- [ ] Exercise the POS with a multi-line ticket containing retail products and restaurant dishes, test required/optional modifier groups and distinct option prices, complete a tracked stock sale, verify insufficient-stock rejection, record a cash/offline payment, and verify canonical order/payment/refund history.
- [ ] Verify refunds are described as manual records unless a real payment provider is integrated; no card charge or money transfer is performed by the current manual-payment workflow.
- [ ] Verify branded QR destinations, custom-domain DNS instructions, public URLs, TLS, and routing from a real browser.
- [ ] Verify product-media upload and responsive image retrieval against live storage.
- [ ] Review API and host logs for authorization failures, errors, sensitive-data leakage, and unexpected database load.

## 4. Pilot gate

Only invite a small number of test merchants after staging checks pass. Keep real payments disabled; use a documented manual payment process and support contact. Before a public commerce launch, close the remaining P0 items in [launch readiness](../launch-readiness.md), including inventory reservation before completion, menu ingredient/BOM stock, stock restoration for cancellations/refunds, payment-provider integration and webhook verification, tax/business rules, authentication security review, domain activation/TLS, and operational recovery.

## 5. POS integration direction

The current POS is an in-app register and order workflow. It can sell active retail products and active restaurant menu items, and can record offline payment details. It is not yet a certified fiscal cash register, card terminal integration, printer/kitchen-display integration, or stock-aware POS. Treat external hardware/payment terminals and third-party delivery systems as separately scoped adapters after the core order/payment/inventory contracts are stable.
