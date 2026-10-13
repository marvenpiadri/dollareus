-- Add unit_amount_minor and total_minor to order_items if missing.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_amount_minor bigint;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_minor bigint;
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'order_items'
      AND column_name = 'price_amount_minor'
  ) THEN
    EXECUTE 'UPDATE order_items SET unit_amount_minor = price_amount_minor WHERE unit_amount_minor IS NULL';
    EXECUTE 'UPDATE order_items SET total_minor = price_amount_minor * quantity WHERE total_minor IS NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'order_items'
      AND column_name = 'amount_minor'
  ) THEN
    EXECUTE 'UPDATE order_items SET unit_amount_minor = amount_minor WHERE unit_amount_minor IS NULL';
    EXECUTE 'UPDATE order_items SET total_minor = amount_minor * quantity WHERE total_minor IS NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'order_items'
      AND column_name = 'unit_amount_minor'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'order_items'
      AND column_name = 'quantity'
  ) THEN
    EXECUTE 'UPDATE order_items SET total_minor = unit_amount_minor * quantity WHERE total_minor IS NULL';
  END IF;
END
$migration$;
