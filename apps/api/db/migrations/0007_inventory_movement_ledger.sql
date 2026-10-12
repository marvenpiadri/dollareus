CREATE TABLE inventory_movements (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id text NOT NULL,
  variant_id text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('adjustment', 'sale', 'return', 'transfer_in', 'transfer_out', 'reservation_release')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  quantity_after integer NOT NULL CHECK (quantity_after >= 0),
  reference_type text,
  reference_id text,
  note text,
  actor_user_id text,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (location_id, organization_id) REFERENCES inventory_locations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, organization_id) REFERENCES product_variants(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX inventory_movements_org_recent_idx ON inventory_movements(organization_id, created_at DESC);
CREATE INDEX inventory_movements_location_variant_idx ON inventory_movements(location_id, variant_id, created_at DESC);
CREATE INDEX inventory_movements_reference_idx ON inventory_movements(reference_type, reference_id) WHERE reference_id IS NOT NULL;
