-- Public identity is separate from a store's display name and location label.
-- Handles identify the business/owner namespace; location slugs identify individual branches.
ALTER TABLE stores ADD COLUMN public_handle text;
ALTER TABLE stores ADD COLUMN location_slug text;
ALTER TABLE stores ADD COLUMN wifi_ssid text;
ALTER TABLE stores ADD COLUMN wifi_password text;
ALTER TABLE stores ADD COLUMN wifi_security text NOT NULL DEFAULT 'WPA2' CHECK (wifi_security IN ('none', 'WEP', 'WPA', 'WPA2', 'WPA3'));

UPDATE stores s
SET public_handle = COALESCE(
  (SELECT o.slug FROM organizations o WHERE o.id = s.organization_id),
  s.slug
),
location_slug = s.slug
WHERE public_handle IS NULL OR location_slug IS NULL;

ALTER TABLE stores ALTER COLUMN public_handle SET NOT NULL;
ALTER TABLE stores ALTER COLUMN location_slug SET NOT NULL;
ALTER TABLE stores ADD CONSTRAINT stores_public_handle_format CHECK (public_handle ~ '^[a-z0-9]+([_-][a-z0-9]+)*$');
ALTER TABLE stores ADD CONSTRAINT stores_location_slug_format CHECK (location_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE INDEX stores_public_identity_idx ON stores (public_handle, location_slug);
CREATE INDEX stores_public_handle_idx ON stores (public_handle);

CREATE UNIQUE INDEX stores_public_path_unique ON stores (public_handle, location_slug);
