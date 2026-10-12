ALTER TABLE orders ADD CONSTRAINT orders_id_organization_unique UNIQUE (id, organization_id);
ALTER TABLE order_items ADD CONSTRAINT order_items_id_organization_unique UNIQUE (id, organization_id);

ALTER TABLE inventory_movements ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX inventory_movements_org_idempotency_unique
  ON inventory_movements (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE inventory_reservations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id text NOT NULL,
  order_item_id text NOT NULL,
  location_id text NOT NULL,
  variant_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  status text NOT NULL CHECK (status IN ('reserved', 'released', 'consumed')),
  created_by text,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (order_id, organization_id) REFERENCES orders(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (order_item_id, organization_id) REFERENCES order_items(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id, organization_id) REFERENCES inventory_locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, organization_id) REFERENCES product_variants(id, organization_id) ON DELETE RESTRICT,
  CHECK ((status = 'reserved' AND released_at IS NULL AND consumed_at IS NULL)
      OR (status = 'released' AND released_at IS NOT NULL AND consumed_at IS NULL)
      OR (status = 'consumed' AND consumed_at IS NOT NULL AND released_at IS NULL))
);
CREATE UNIQUE INDEX inventory_reservations_one_active_line_idx
  ON inventory_reservations (order_item_id, location_id)
  WHERE status = 'reserved';
CREATE INDEX inventory_reservations_order_idx
  ON inventory_reservations (organization_id, order_id, status);
CREATE INDEX inventory_reservations_expiry_work_idx
  ON inventory_reservations (status, updated_at) WHERE status = 'reserved';
