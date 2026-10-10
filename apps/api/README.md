# Local API development

## Start
1. Install Node.js 20.19+ and pnpm 10.
2. Copy `.env.example` to `.env` and configure a Firebase project or local emulators.
3. Install dependencies with `pnpm install`.
4. Start the API with `pnpm api:dev`.
5. Start the Angular dashboard in a second terminal with `pnpm start`.

The health endpoint is `GET http://localhost:3000/api/v1/health`.

## Current routes
- `GET /api/v1/organizations/:organizationId/products` — list products for an authenticated active organization member.
- `POST /api/v1/organizations/:organizationId/products` — validate and create a product. Product slugs are reserved transactionally.
- `PATCH /api/v1/organizations/:organizationId/products/:productId` — update supported product fields; slug changes reserve the new slug and release the old slug in the same Firestore transaction.
- `POST /api/v1/organizations/:organizationId/products/:productId/media/upload-intents` — issue a short-lived signed upload policy for supported image types.
- `POST /api/v1/organizations/:organizationId/products/:productId/media/:assetId/complete` — verify uploaded object metadata and attach its storage key to the product.

Product updates accept a non-empty subset of `slug`, `name`, `description`, `status`, `kind`, and `variants`. Image metadata cannot be written through product create/update payloads; images must use the upload workflow. Set `status: "archived"` to retire a product without physically deleting its record.

Protected routes expect `Authorization: Bearer <Firebase ID token>`. The API verifies token revocation and checks the active membership document at `organizations/{organizationId}/members/{uid}`. A membership record must be provisioned before protected routes can be used; organization onboarding is not implemented yet.

## Firestore shape
- `organizations/{organizationId}/members/{uid}`: membership and active status.
- `organizations/{organizationId}/products/{productId}`: product JSON.
- `organizations/{organizationId}/productSlugs/{slug}`: transactionally reserved slug.
- `organizations/{organizationId}/products/{productId}/mediaAssets/{assetId}`: upload state and server-verified object metadata.

The API is the trusted data boundary. Firestore client rules deny direct access by default. Admin SDK calls bypass Firestore rules, so every protected endpoint must verify identity, membership, and resource ownership.

## Media notes
Image bytes are stored in Cloud Storage. Product JSON contains storage keys and metadata only. The signed upload policy is short-lived and bound to the expected content type. Size and declared MIME metadata are checked during completion, but file-signature validation, malware scanning, image processing, and safe public delivery remain to be implemented before production use.

## Current limitations
- No organization creation, invitation, or role-management endpoints yet.
- No frontend Firebase sign-in flow or API client yet; the merchant dashboard still displays demo data.
- Product listing does not yet provide cursor pagination.
- The upload-intent route requires `FIREBASE_STORAGE_BUCKET` to be configured and its signed POST policy should be tested against the configured Cloud Storage environment.
- Firebase credentials, project setup, storage lifecycle policies, and production CORS origins must be configured per environment.
