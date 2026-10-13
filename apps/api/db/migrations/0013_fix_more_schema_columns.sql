-- Add missing columns to product_categories and order_items expected by API queries.
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku_snapshot text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_title_snapshot text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS options_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
