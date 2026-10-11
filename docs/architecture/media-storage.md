# Product media and image storage

## Storage provider

Dollareus uses Neon S3-compatible object storage for product image bytes. Configure the following variables **only in the API server environment**; never place access keys in Angular build variables or commit real values:

- `AWS_ENDPOINT_URL_S3`: Neon-provided S3 endpoint.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: credentials generated for the bucket.
- `AWS_REGION`: region associated with the endpoint.
- `AWS_S3_BUCKET`: exact bucket name.

The API signs S3 requests server-side with AWS Signature Version 4. Credentials never leave the server. The bucket name is required in addition to the endpoint and access keys.

## Browser-first image optimization

The merchant browser decodes selected images, scales them to configurable maximum width and height, and re-encodes them as WebP before upload. It attempts quality levels from 0.82 down to 0.55 to stay under the 5 MiB optimized-upload cap. Original files are not sent to the API. The server validates the WebP signature and dimensions (maximum 2400 × 2400), checks organization membership and product ownership, writes the object to Neon storage, and records only metadata and a storage key in PostgreSQL.

Browser compression reduces upload bandwidth, but it is not a security boundary: server-side size/type/dimension checks still apply. Image decoding occurs locally and can use memory; the merchant UI rejects oversized originals before decoding.

## Access and keys

Objects use keys such as `organizations/{organizationId}/products/{productId}/{assetId}.webp`. The bucket need not be public. Authenticated content requests are proxied through the API, which signs the object-store request. Public storefront delivery should be added as a separate policy for deliberately published assets; a storage key is not authorization.

## Metadata

The `product_media` table stores storage provider/key, content type, byte size, alt text, dimensions, ordering, creator, and timestamp. Do not put base64 image data in product JSON, database documents, or Git.

## Operational follow-ups

Configure storage quotas and lifecycle rules, monitor storage errors, and test upload/download against the actual Neon bucket. The API integration is not considered production-verified until a real upload and read round-trip succeeds.
