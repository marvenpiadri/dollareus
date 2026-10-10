-- Dollareus commerce schema, migration 0001.
-- IDs are text so Firebase Auth UIDs and existing opaque IDs can be preserved.
-- Money is stored in integer minor units; do not use floating-point currency values.

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  default_currency char(3) NOT NULL DEFAULT 'USD' CHECK (default_currency ~ '^[A-Z]{3}$'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON organization_memberships(user_id, status);

CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS stores_org_status_idx ON stores(organization_id, status);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  kind text NOT NULL CHECK (kind IN ('physical', 'digital', 'service', 'food')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS products_org_updated_idx ON products(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS products_org_status_idx ON products(organization_id, status);
CREATE INDEX IF NOT EXISTS products_metadata_gin_idx ON products USING gin(metadata);

CREATE TABLE IF NOT EXISTS product_variants (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  sku text,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  options jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  price_amount_minor bigint NOT NULL CHECK (price_amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  barcode text,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_org_sku_unique
  ON product_variants(organization_id, lower(sku)) WHERE sku IS NOT NULL AND sku <> '';
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id, status);

CREATE TABLE IF NOT EXISTS product_media (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  storage_provider text NOT NULL DEFAULT 'neon-object-storage',
  storage_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 10485760),
  alt_text text NOT NULL DEFAULT '',
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected', 'deleted')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE CASCADE,
  UNIQUE (storage_provider, storage_key)
);
CREATE INDEX IF NOT EXISTS product_media_gallery_idx ON product_media(product_id, position) WHERE status = 'ready';

CREATE TABLE IF NOT EXISTS inventory_locations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS inventory_locations_org_idx ON inventory_locations(organization_id, status);

CREATE TABLE IF NOT EXISTS inventory_levels (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_on_hand bigint NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved bigint NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand),
  reorder_point bigint CHECK (reorder_point IS NULL OR reorder_point >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, variant_id)
);
CREATE INDEX IF NOT EXISTS inventory_levels_variant_idx ON inventory_levels(variant_id);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text,
  phone text,
  first_name text,
  last_name text,
  accepts_marketing boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS customers_org_created_idx ON customers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_email_idx ON customers(organization_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  recipient_name text NOT NULL,
  company text,
  phone text,
  address_line1 text NOT NULL,
  address_line2 text,
  locality text NOT NULL,
  region text,
  postal_code text,
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  is_default_shipping boolean NOT NULL DEFAULT false,
  is_default_billing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS carts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text,
  customer_id text,
  session_token_hash text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'abandoned', 'expired')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id),
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id),
  UNIQUE (session_token_hash)
);
CREATE INDEX IF NOT EXISTS carts_org_status_updated_idx ON carts(organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cart_items (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);
CREATE INDEX IF NOT EXISTS cart_items_variant_idx ON cart_items(variant_id);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id text,
  customer_id text,
  order_number bigint GENERATED BY DEFAULT AS IDENTITY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed')),
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'returned')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  shipping_minor bigint NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  total_minor bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  customer_email text,
  billing_address_snapshot jsonb,
  shipping_address_snapshot jsonb,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  idempotency_key text,
  placed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id),
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id),
  UNIQUE (organization_id, order_number),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS orders_org_created_idx ON orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_org_status_idx ON orders(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id text,
  variant_id text,
  sku_snapshot text,
  product_name_snapshot text NOT NULL,
  variant_title_snapshot text NOT NULL DEFAULT '',
  options_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON order_items(variant_id);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requires_action', 'authorized', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fulfillments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  carrier text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fulfillments_order_idx ON fulfillments(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_created_idx ON audit_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
