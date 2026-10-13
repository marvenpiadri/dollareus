-- Fix schema discrepancies: add missing columns required by API queries.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price_amount_minor bigint;
UPDATE product_variants SET price_amount_minor = amount_minor WHERE price_amount_minor IS NULL;
ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
