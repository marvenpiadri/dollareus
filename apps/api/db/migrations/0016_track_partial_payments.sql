-- Keep order-level payment state aligned with recorded offline payments.
-- Existing rows remain valid; partial balances are now represented explicitly.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'authorized', 'paid', 'partially_paid', 'partially_refunded', 'refunded', 'failed'));
