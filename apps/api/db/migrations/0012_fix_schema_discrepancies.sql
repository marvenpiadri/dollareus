-- Fix schema discrepancies: add missing columns required by API queries.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price_amount_minor bigint;
DO $migration$
BEGIN
  -- Older installations may still have amount_minor. Fresh schemas already use
  -- price_amount_minor, so only run the backfill when the legacy column exists.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'product_variants'
      AND column_name = 'amount_minor'
  ) THEN
    EXECUTE 'UPDATE product_variants SET price_amount_minor = amount_minor WHERE price_amount_minor IS NULL';
  END IF;
END
$migration$;
ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
