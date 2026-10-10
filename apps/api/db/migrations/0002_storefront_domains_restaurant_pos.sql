-- Dollareus migration 0002: hosted storefront domains, restaurant domain and POS.
-- This migration extends the PostgreSQL schema. It does not move the current
-- Firestore-backed API to PostgreSQL; that requires a separate data-access cutover.

CREATE TABLE IF NOT EXISTS store_domains (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  hostname text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('platform_subdomain', 'custom')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verification_required', 'verified', 'active', 'disabled', 'failed')),
  verification_token text NOT NULL,
  verified_at timestamptz,
  activated_at timestamptz,
  is_primary boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (hostname),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX IF NOT EXISTS store_domains_store_idx ON store_domains(organization_id, store_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS store_domains_one_primary_per_store
  ON store_domains(organization_id, store_id) WHERE is_primary = true AND status = 'active';
CREATE INDEX IF NOT EXISTS store_domains_verification_idx ON store_domains(status, last_checked_at);

CREATE TABLE IF NOT EXISTS store_frontends (
  store_id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  default_experience text NOT NULL DEFAULT 'commerce' CHECK (default_experience IN ('commerce', 'menu', 'catalog', 'services')),
  enabled_experiences text[] NOT NULL DEFAULT ARRAY['commerce']::text[],
  published boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(theme) = 'object'),
  logo_media_id text,
  cover_media_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  CHECK (default_experience = ANY(enabled_experiences))
);

CREATE TABLE IF NOT EXISTS restaurant_menus (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '',
  service_periods text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  UNIQUE (store_id, slug),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX IF NOT EXISTS restaurant_menus_public_idx ON restaurant_menus(store_id, status, position);

CREATE TABLE IF NOT EXISTS restaurant_menu_items (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  menu_id text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '',
  price_amount_minor bigint NOT NULL CHECK (price_amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  category_id text,
  allergens text[] NOT NULL DEFAULT '{}',
  dietary_labels text[] NOT NULL DEFAULT '{}',
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable', 'limited')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (menu_id, organization_id, store_id) REFERENCES restaurant_menus(id, organization_id, store_id) ON DELETE CASCADE,
  UNIQUE (menu_id, slug),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX IF NOT EXISTS restaurant_menu_items_public_idx ON restaurant_menu_items(menu_id, status, position);
CREATE INDEX IF NOT EXISTS restaurant_menu_items_store_idx ON restaurant_menu_items(store_id, status);

CREATE TABLE IF NOT EXISTS pos_sessions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  terminal_type text NOT NULL CHECK (terminal_type IN ('retail', 'restaurant', 'service', 'general')),
  location_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by text NOT NULL,
  closed_by text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE CASCADE,
  CHECK ((status = 'open' AND closed_at IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL)),
  UNIQUE (id, organization_id, store_id)
);
CREATE INDEX IF NOT EXISTS pos_sessions_store_recent_idx ON pos_sessions(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_orders (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id text NOT NULL,
  session_id text NOT NULL,
  order_number bigint NOT NULL CHECK (order_number > 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  channel text NOT NULL DEFAULT 'pos' CHECK (channel IN ('pos', 'qr')),
  fulfillment text NOT NULL DEFAULT 'counter' CHECK (fulfillment IN ('counter', 'takeaway', 'dine_in', 'delivery', 'service')),
  table_label text,
  customer_note text,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_by text NOT NULL,
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(status_history) = 'array'),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, organization_id, store_id) REFERENCES pos_sessions(id, organization_id, store_id) ON DELETE RESTRICT,
  UNIQUE (store_id, order_number),
  UNIQUE (store_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS pos_orders_store_recent_idx ON pos_orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_orders_store_status_idx ON pos_orders(store_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_order_lines (
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
  metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_order_lines_order_idx ON pos_order_lines(order_id);

CREATE TABLE IF NOT EXISTS store_domain_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  domain_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'verification_started', 'verified', 'activated', 'disabled', 'verification_failed')),
  actor_user_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (domain_id, organization_id, store_id) REFERENCES store_domains(id, organization_id, store_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS store_domain_events_domain_idx ON store_domain_events(domain_id, created_at DESC);
