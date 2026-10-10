# Local API development

## Start
1. Install Node.js 20.19+ and pnpm 10.
2. Copy `.env.example` to `.env` and configure a Firebase project or local emulators.
3. Install dependencies with `pnpm install`.
4. Start the API with `pnpm api:dev`.
5. Start the Angular dashboard in a second terminal with `pnpm start`.

The health endpoint is `GET http://localhost:3000/api/v1/health`.

## Current routes
- `GET /api/v1/organizations/:organizationId/products` — list organization products for an authenticated active member.
- `POST /api/v1/organizations/:organizationId/products` — validate and create a product. Product slugs are reserved transactionally.
- `POST /api/v1/organizations/:organizationId/products/:productId/media/upload-intents` — issue a short-lived signed upload URL for supported image types.

Protected routes expect `Authorization: Bearer <Firebase ID token>`. The API verifies token revocation and checks the active membership document at `organizations/{organizationId}/members/{uid}`. A membership record must be provisioned before protected routes can be used; organization onboarding is not implemented yet.

## Firestore shape
- `organizations/{organizationId}/members/{uid}`: membership and active status.
- `organizations/{organizationId}/products/{productId}`: product JSON.
- `organizations/{organizationId}/productSlugs/{slug}`: transactionally reserved slug.

The API is the trusted data boundary. Firestore client rules deny direct access by default. Admin SDK calls bypass Firestore rules, so every protected endpoint must verify identity, membership, and resource ownership.

## Media notes
Image bytes are stored in Cloud Storage. Product JSON contains storage keys and metadata only. The signed upload URL is short-lived and bound to the expected content type. Upload completion verification, size enforcement, malware scanning, image processing, and a safe public delivery endpoint remain to be implemented before production use.

## Current limitations
- No organization creation, invitation, or role-management endpoints yet.
- No frontend Firebase sign-in flow or API client yet.
- Product records are stored in Firestore, but no pagination cursor, product update/delete, or slug release workflow exists yet.
- The upload-intent route requires `FIREBASE_STORAGE_BUCKET` to be configured.
- Firebase credentials, project setup, storage lifecycle policies, and production CORS origins must be configured per environment.
