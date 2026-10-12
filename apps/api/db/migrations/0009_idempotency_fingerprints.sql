ALTER TABLE orders ADD COLUMN idempotency_fingerprint text;
ALTER TABLE pos_orders ADD COLUMN idempotency_fingerprint text;

ALTER TABLE orders ADD CONSTRAINT orders_idempotency_fingerprint_format_check
  CHECK (idempotency_fingerprint IS NULL OR idempotency_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE pos_orders ADD CONSTRAINT pos_orders_idempotency_fingerprint_format_check
  CHECK (idempotency_fingerprint IS NULL OR idempotency_fingerprint ~ '^[a-f0-9]{64}$');
