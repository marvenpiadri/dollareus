-- Enforce tenant consistency for transactional records at the database boundary.
-- Keep these constraints even when API handlers already validate organization ownership.

ALTER TABLE orders
  ADD CONSTRAINT orders_id_organization_unique UNIQUE (id, organization_id);

ALTER TABLE payments
  ADD CONSTRAINT payments_id_organization_order_unique UNIQUE (id, organization_id, order_id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_tenant_fk
  FOREIGN KEY (order_id, organization_id)
  REFERENCES orders (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE payments
  ADD CONSTRAINT payments_order_tenant_fk
  FOREIGN KEY (order_id, organization_id)
  REFERENCES orders (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE fulfillments
  ADD CONSTRAINT fulfillments_order_tenant_fk
  FOREIGN KEY (order_id, organization_id)
  REFERENCES orders (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE refunds
  ADD CONSTRAINT refunds_order_tenant_fk
  FOREIGN KEY (order_id, organization_id)
  REFERENCES orders (id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE refunds
  ADD CONSTRAINT refunds_payment_order_tenant_fk
  FOREIGN KEY (payment_id, organization_id, order_id)
  REFERENCES payments (id, organization_id, order_id)
  ON DELETE RESTRICT;
