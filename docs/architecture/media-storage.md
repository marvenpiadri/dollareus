# Product media and image storage

## Where images belong
Store image bytes in object storage (Firebase Cloud Storage is a candidate once the adapter and security rules exist). Store only metadata and a stable storage key in the product JSON/document.

```json
{
  "id": "img_01",
  "storageKey": "organizations/org_01/products/prod_01/img_01.webp",
  "alt": "Handmade ceramic bowl",
  "width": 1200,
  "height": 1200,
  "position": 0
}
```

Do not put base64 image data in product JSON, database documents, or Git. Do not make original uploads permanently public by default. See `schemas/product.schema.json` for the canonical JSON shape.

## Suggested object keys
- `organizations/{organizationId}/products/{productId}/{assetId}/original`
- `organizations/{organizationId}/products/{productId}/{assetId}/variants/{width}.webp`
- `organizations/{organizationId}/stores/{storeId}/branding/{assetId}`

Generate IDs on the server. Validate membership, content type, size, dimensions, and actual file signature. Use short-lived upload authorization or authenticated uploads with restrictive storage rules. Never trust a client-provided organization ID without checking membership.

## Upload lifecycle
1. Merchant requests an upload intent for a product they can edit.
2. API validates membership, permissions, and limits.
3. API returns narrowly scoped upload authorization.
4. Client uploads directly to object storage.
5. Server verifies the asset and records metadata.
6. Image processing generates optimized variants and thumbnails.
7. Product JSON stores the storage key and descriptive metadata.
8. Public storefront API exposes only deliberately published assets.

Use optimized WebP/AVIF derivatives where appropriate, preserve alt text and ordering, and configure quotas, lifecycle rules, monitoring, and abuse protection. A storage key is an identifier, not an authorization mechanism.
