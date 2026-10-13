-- Add unit_amount_minor and total_minor to order_items if missing.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_amount_minor bigint;
UPDATE order_items SET unit_amount_minor = price_amount_minor WHERE unit_amount_minor IS NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_minor bigint;
UPDATE order_items SET total_minor = price_amount_minor * quantity WHERE total_minor IS NULL;
