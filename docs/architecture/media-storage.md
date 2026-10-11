# Product media and image storage

## Storage provider

Dollareus uses Neon S3-compatible object storage for product image bytes. Configure these variables **only in the API server environment**; never place access keys in Angular build variables or commit real values:

- `AWS_ENDPOINT_URL_S3`: Neon-provided S3 endpoint.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: bucket credentials.
- `AWS_REGION`: region associated with the endpoint.
- `AWS_S3_BUCKET`: exact bucket name.

The API signs S3 requests server-side with AWS Signature Version 4. Credentials never leave the server.

## Image limits and product optimization

Every stored/uploaded product image has a hard **4,096 KB (4 MiB)** ceiling enforced by the API. The merchant browser converts supported JPEG, PNG and WebP uploads to WebP before upload and aims for **1 MiB or less** for product originals. It lowers quality and, if needed, reduces dimensions while preserving aspect ratio. The 1 MiB limit is a target; the API's hard limit is 4 MiB. Original files are not sent to the API.

The API checks file size, WebP signature and dimensions (maximum 2400 × 2400), and checks organization membership and product ownership before writing the object and metadata to Neon. Browser optimization is not a security boundary; server-side checks still apply.

## Responsive images

Authenticated image URLs accept a `width` query parameter, for example:

```text
/api/v1/organizations/{organizationId}/products/{productId}/media/{mediaId}/content?width=300
```

Node.js validates the requested width against an allowlist, uses Sharp to resize and encode a WebP variant, and caches the result in the same private object bucket. It does not enlarge images beyond their original dimensions. Variants are keyed by the source object and requested width; repeat requests reuse the stored variant. Unsupported widths return a validation error. The route only transforms an image already selected from Dollareus storage; it never fetches arbitrary user-provided URLs.

## Access and metadata

Objects use keys such as `organizations/{organizationId}/products/{productId}/{assetId}.webp`. The bucket need not be public. Content and resized-variant requests remain authenticated and organization-scoped. The `product_media` table stores storage provider/key, content type, byte size, alt text, dimensions, ordering, creator, and timestamp.

## Operational follow-ups

Set API server environment variables, verify the actual Neon bucket with a real upload/read/resize round-trip, and monitor object-storage and image-processing errors. Production verification remains pending until that real-bucket test succeeds.
