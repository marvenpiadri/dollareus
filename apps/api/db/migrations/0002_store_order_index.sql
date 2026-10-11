-- Store-scoped merchant order history should not scan all organization orders.
CREATE INDEX orders_store_created_idx ON orders(store_id, created_at DESC);
