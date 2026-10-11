# Restaurant Phase 2 — Menu management API

This document describes the authenticated menu-management requests available to the merchant workspace. All writes are organization-scoped and require an active organization membership with an owner, admin, or manager role. Send the authenticated session/token expected by the API and JSON content type.

Base path: `/api/v1`

Every successful response uses `{ "data": ..., "requestId": "..." }`. Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.

## Menus

### List menus for a store
`GET /organizations/{organizationId}/stores/{storeId}/menus`

Returns menus ordered by position, with `itemCount`. Draft and archived menus are included for the merchant.

### Create a menu
`POST /organizations/{organizationId}/menus`

```json
{
  "storeId": "store_123",
  "slug": "dinner",
  "name": "Dinner",
  "description": "Evening menu",
  "servicePeriods": ["dinner"],
  "status": "draft",
  "position": 0
}
```

`description` is optional/null; `position` is optional and defaults to zero. Slugs must be lowercase letters/numbers separated by single hyphens. Store currency is used for all dishes.

### Edit menu details
`PATCH /organizations/{organizationId}/menus/{menuId}`

Send one or more of `slug`, `name`, `description`, `servicePeriods`, `position`. Example:

```json
{ "name": "Dinner & Grill", "servicePeriods": ["dinner", "weekend"] }
```

### Publish, unpublish, or archive
`PATCH /organizations/{organizationId}/menus/{menuId}/status`

```json
{ "status": "active" }
```

Use `draft` to unpublish and `archived` to retire a menu. Only active menus are returned by the public menu projection.

### Reorder all menus in a store
`PUT /organizations/{organizationId}/stores/{storeId}/menus/reorder`

```json
{ "menuIds": ["menu_dinner", "menu_breakfast", "menu_drinks"] }
```

The list must contain every current menu ID for that store exactly once. Position is assigned from zero in the submitted order. If the list is stale or incomplete, the API returns `409 MENU_ORDER_STALE`; reload and retry.

## Menu items (dishes)

### List all items, including drafts
`GET /organizations/{organizationId}/menus/{menuId}/items`

### Create a dish
`POST /organizations/{organizationId}/menus/{menuId}/items`

```json
{
  "slug": "chicken-tajine",
  "name": "Chicken Tajine",
  "description": "Preserved lemon and olives",
  "priceAmountMinor": 8500,
  "currency": "MAD",
  "status": "draft",
  "categoryId": "category_123",
  "allergens": [],
  "dietaryLabels": [],
  "availability": "available",
  "position": 0,
  "modifierGroups": [
    {
      "id": "extras",
      "name": "Extras",
      "required": false,
      "minSelections": 0,
      "maxSelections": 2,
      "options": [
        { "id": "extra-olives", "name": "Extra olives", "priceDeltaMinor": 500 },
        { "id": "extra-bread", "name": "Extra bread", "priceDeltaMinor": 300 }
      ]
    }
  ]
}
```

Amounts use integer minor currency units (MAD 8500 = MAD 85.00). Currency must match the store. A category must belong to the same store and organization. Modifier group IDs and option IDs must be unique; min/max constraints must be consistent; each group accepts 1–30 options.

### Edit a dish, change availability, or reorder its position
`PATCH /organizations/{organizationId}/menus/{menuId}/items/{itemId}`

Supported fields: `status`, `availability`, `position`, `categoryId` (nullable), `slug`, `name`, `description` (nullable), `priceAmountMinor`, `allergens`, `dietaryLabels`, `modifierGroups`, `metadata`. Example:

```json
{ "availability": "unavailable" }
```

Set `status: "draft"` to remove a dish from the public menu without deleting its merchant record. Set availability to `unavailable` to temporarily hide it; `limited` remains visible with a limited-availability label.

### Reorder all dishes in a menu
`PUT /organizations/{organizationId}/menus/{menuId}/items/reorder`

```json
{ "itemIds": ["item_tajine", "item_couscous", "item_salad"] }
```

The list must contain every current item ID in the menu exactly once, including draft and archived items. Updates run in a database transaction. If the list is stale or incomplete, the API returns `409 MENU_ITEM_ORDER_STALE`; reload and retry.

## Expected validation and authorization behavior

- `400 VALIDATION_ERROR`: malformed payload, invalid modifier constraints, or duplicate IDs in a reorder request.
- `401 AUTH_REQUIRED`: no valid authenticated identity.
- `403 ORGANIZATION_ACCESS_DENIED` / `403 ORGANIZATION_ROLE_FORBIDDEN`: inactive membership or role lacks menu-management permission.
- `404 STORE_NOT_FOUND`, `MENU_NOT_FOUND`, `MENU_ITEM_NOT_FOUND`, or `CATEGORY_NOT_FOUND`: referenced resource is not available within the requested organization/store scope.
- `409 MENU_SLUG_TAKEN` / `MENU_ITEM_SLUG_TAKEN`: duplicate slug in its scope.
- `409 MENU_ORDER_STALE` / `MENU_ITEM_ORDER_STALE`: submitted full ordering does not match current resources.

The public menu remains a read-only projection. Merchant writes must never make draft/archived menus or dishes public. No payment provider or customer checkout is enabled by these endpoints.
