-- Dollareus PostgreSQL schema
-- Fresh-install schema for a new application. No data migration and no column defaults.
-- IDs and timestamps are supplied explicitly by the API. Run only against an empty database.

BEGIN;

CREATE TABLE users (
  id text PRIMARY KEY,
  email text UNIQUE,
  email_verified_at timestamptz,
  display_name text,
  avatar_url text,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (email IS NULL OR (length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email))))
);
CREATE INDEX users_status_created_idx ON users(status, created_at DESC);

CREATE TABLE auth_passwords (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions(user_id, expires_at);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE auth_oauth_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_subject text NOT NULL,
  provider_email text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);
CREATE INDEX auth_oauth_accounts_user_idx ON auth_oauth_accounts(user_id);

CREATE TABLE auth_oauth_states (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook')),
  state_hash text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_oauth_states_expiry_idx ON auth_oauth_states(expires_at);

CREATE TABLE auth_email_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_email_tokens_user_purpose_idx ON auth_email_tokens(user_id, purpose, expires_at);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE organization_memberships (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX organization_memberships_user_idx ON organization_memberships(user_id, status);

CREATE TABLE stores (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_type text NOT NULL CHECK (business_type IN ('retail', 'restaurant', 'freelancer', 'services', 'digital', 'general')),
  status text NOT NULL CHECK (status IN ('setup', 'active', 'paused', 'archived')),
  default_currency char(3) NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  locale text NOT NULL CHECK (locale IN ('en', 'fr', 'ar')),
  time_zone text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);
CREATE INDEX stores_org_updated_idx ON stores(organization_id, updated_at DESC);

CREATE TABLE store_frontends (
  store_id text PRIMARY KEY,
  organization_id text NOT NULL,
  default_experience text NOT NULL CHECK (default_experience IN ('commerce', 'menu', 'catalog', 'services')),
  enabled_experiences text[] NOT NULL,
  published boolean NOT NULL,
  seo_title text,
  seo_description text,
  theme jsonb NOT NULL CHECK (jsonb_typeof(theme) = 'object'),
  logo_media_id text,
  cover_media_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  CHECK (cardinality(enabled_experiences) > 0 AND default_experience = ANY(enabled_experiences))
);

CREATE TABLE store_domains (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  store_id text NOT NULL,
  hostname text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('platform_subdomain', 'custom')),
  status text NOT NULL CHECK (status IN ('pending', 'verification_required', 'verified', 'active', 'disabled', 'failed')),
  verification_token text NOT NULL,
  verified_at timestamptz,
  activated_at timestamptz,
  is_primary boolean NOT NULL,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX store_domains_store_idx ON store_domains(organization_id, store_id, status);
CREATE UNIQUE INDEX store_domains_one_primary_per_store ON store_domains(organization_id, store_id) WHERE is_primary = true AND status = 'active';

CREATE TABLE categories (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  position integer NOT NULL CHECK (position >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (store_id, slug),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX categories_store_status_position_idx ON categories(store_id, status, position);

CREATE TABLE products (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  kind text NOT NULL CHECK (kind IN ('physical', 'digital', 'service', 'food')),
  availability_status text CHECK (availability_status IN ('available', 'unavailable', 'limited', 'preorder')),
  availability_note text,
  attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'object'),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug),
  UNIQUE (id, organization_id)
);
CREATE INDEX products_org_updated_idx ON products(organization_id, updated_at DESC);
CREATE INDEX products_org_status_idx ON products(organization_id, status);

CREATE TABLE product_categories (
  product_id text NOT NULL,
  category_id text NOT NULL,
  organization_id text NOT NULL,
  store_id text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, organization_id, store_id) REFERENCES categories(id, organization_id, store_id) ON DELETE CASCADE
);

CREATE TABLE product_variants (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  sku text,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'object'),
  price_amount_minor bigint NOT NULL CHECK (price_amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  barcode text,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX product_variants_org_sku_unique ON product_variants(organization_id, lower(sku)) WHERE sku IS NOT NULL AND sku <> '';
CREATE INDEX product_variants_product_idx ON product_variants(product_id, status);

CREATE TABLE product_media (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 10485760),
  alt_text text NOT NULL,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  position integer NOT NULL CHECK (position >= 0),
  created_by text,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (product_id, organization_id) REFERENCES products(id, organization_id) ON DELETE CASCADE,
  UNIQUE (storage_provider, storage_key)
);
CREATE INDEX product_media_product_position_idx ON product_media(product_id, position);

CREATE TABLE inventory_locations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  status text NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);

CREATE TABLE inventory_levels (
  organization_id text NOT NULL,
  location_id text NOT NULL,
  variant_id text NOT NULL,
  quantity_on_hand integer NOT NULL,
  quantity_reserved integer NOT NULL,
  reorder_point integer,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (location_id, variant_id),
  FOREIGN KEY (location_id, organization_id) REFERENCES inventory_locations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id, organization_id) REFERENCES product_variants(id, organization_id) ON DELETE CASCADE,
  CHECK (quantity_reserved >= 0 AND quantity_on_hand >= quantity_reserved),
  CHECK (reorder_point IS NULL OR reorder_point >= 0)
);

CREATE TABLE customers (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email text,
  phone text,
  first_name text,
  last_name text,
  display_name text,
  notes text,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (id, organization_id)
);
CREATE INDEX customers_org_created_idx ON customers(organization_id, created_at DESC);

CREATE TABLE customer_addresses (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  customer_id text NOT NULL,
  label text,
  recipient_name text NOT NULL,
  phone text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  region text,
  postal_code text,
  country_code char(2) NOT NULL,
  is_default_billing boolean NOT NULL,
  is_default_shipping boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE carts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  customer_id text,
  session_token_hash text,
  status text NOT NULL CHECK (status IN ('active', 'converted', 'abandoned', 'expired')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id)
);

CREATE TABLE cart_items (
  id text PRIMARY KEY,
  cart_id text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE orders (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id text,
  customer_id text,
  order_number bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded')),
  payment_status text NOT NULL CHECK (payment_status IN ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed')),
  fulfillment_status text NOT NULL CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'returned')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  shipping_minor bigint NOT NULL CHECK (shipping_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  customer_email text,
  billing_address_snapshot jsonb,
  shipping_address_snapshot jsonb,
  notes text,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  idempotency_key text,
  placed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id),
  FOREIGN KEY (customer_id, organization_id) REFERENCES customers(id, organization_id),
  UNIQUE (organization_id, order_number),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX orders_org_created_idx ON orders(organization_id, created_at DESC);
CREATE INDEX orders_org_status_idx ON orders(organization_id, status, created_at DESC);

CREATE TABLE order_items (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id text,
  variant_id text,
  sku_snapshot text,
  product_name_snapshot text NOT NULL,
  variant_title_snapshot text NOT NULL,
  options_snapshot jsonb NOT NULL CHECK (jsonb_typeof(options_snapshot) = 'object'),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_at timestamptz NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE payments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_payment_id text,
  status text NOT NULL CHECK (status IN ('pending', 'requires_action', 'authorized', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text,
  provider_payload jsonb NOT NULL CHECK (jsonb_typeof(provider_payload) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (provider, provider_payment_id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX payments_order_idx ON payments(order_id, created_at DESC);

CREATE TABLE fulfillments (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  carrier text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX fulfillments_order_idx ON fulfillments(order_id, created_at DESC);

CREATE TABLE restaurant_menus (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text,
  service_periods text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (store_id, slug),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX restaurant_menus_public_idx ON restaurant_menus(store_id, status, position);

CREATE TABLE restaurant_menu_items (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  store_id text NOT NULL,
  menu_id text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text,
  price_amount_minor bigint NOT NULL CHECK (price_amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  category_id text,
  allergens text[] NOT NULL,
  dietary_labels text[] NOT NULL,
  availability text NOT NULL CHECK (availability IN ('available', 'unavailable', 'limited')),
  position integer NOT NULL CHECK (position >= 0),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (menu_id, organization_id, store_id) REFERENCES restaurant_menus(id, organization_id, store_id) ON DELETE CASCADE,
  UNIQUE (menu_id, slug),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX restaurant_menu_items_public_idx ON restaurant_menu_items(menu_id, status, position);
CREATE INDEX restaurant_menu_items_store_idx ON restaurant_menu_items(store_id, status);

CREATE TABLE pos_sessions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  terminal_type text NOT NULL CHECK (terminal_type IN ('retail', 'restaurant', 'service', 'general')),
  location_id text,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  opened_by text NOT NULL,
  closed_by text,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  CHECK ((status = 'open' AND closed_at IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL)),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX pos_sessions_store_recent_idx ON pos_sessions(store_id, created_at DESC);

CREATE TABLE pos_orders (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id text NOT NULL,
  session_id text NOT NULL,
  order_number bigint NOT NULL CHECK (order_number > 0),
  status text NOT NULL CHECK (status IN ('confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  channel text NOT NULL CHECK (channel IN ('pos', 'qr')),
  fulfillment text NOT NULL CHECK (fulfillment IN ('counter', 'takeaway', 'dine_in', 'delivery', 'service')),
  table_label text,
  customer_note text,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_by text NOT NULL,
  status_history jsonb NOT NULL CHECK (jsonb_typeof(status_history) = 'array'),
  idempotency_key text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, organization_id, store_id) REFERENCES pos_sessions(id, organization_id, store_id) ON DELETE RESTRICT,
  UNIQUE (store_id, order_number),
  UNIQUE (store_id, idempotency_key)
);
CREATE INDEX pos_orders_store_recent_idx ON pos_orders(store_id, created_at DESC);
CREATE INDEX pos_orders_store_status_idx ON pos_orders(store_id, status, created_at DESC);

CREATE TABLE pos_order_lines (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES pos_orders(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('product', 'menu_item', 'service')),
  source_item_id text NOT NULL,
  source_variant_id text,
  source_menu_id text,
  name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  metadata_snapshot jsonb NOT NULL CHECK (jsonb_typeof(metadata_snapshot) = 'object'),
  created_at timestamptz NOT NULL
);
CREATE INDEX pos_order_lines_order_idx ON pos_order_lines(order_id);

CREATE TABLE entry_points (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('direct-link', 'qr', 'embed')),
  target_path text NOT NULL CHECK (target_path IN ('/', '/menu', '/catalog', '/services')),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  branding jsonb NOT NULL CHECK (jsonb_typeof(branding) = 'object'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id, store_id)
);
ALTER TABLE entry_points ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX entry_points_store_idx ON entry_points(store_id, status, created_at DESC);

CREATE TABLE store_domain_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  domain_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'verification_started', 'verified', 'activated', 'disabled', 'verification_failed')),
  actor_user_id text,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (domain_id, organization_id, store_id) REFERENCES store_domains(id, organization_id, store_id) ON DELETE CASCADE
);
CREATE INDEX store_domain_events_domain_idx ON store_domain_events(domain_id, created_at DESC);

CREATE TABLE refunds (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id text NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text,
  idempotency_key text,
  status text NOT NULL CHECK (status IN ('recorded', 'cancelled')),
  recorded_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX refunds_order_idx ON refunds(organization_id, order_id, created_at DESC);
CREATE INDEX refunds_payment_idx ON refunds(payment_id, status);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL
);
CREATE INDEX audit_events_org_created_idx ON audit_events(organization_id, created_at DESC);

COMMIT;
