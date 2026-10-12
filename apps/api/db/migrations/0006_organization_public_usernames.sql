ALTER TABLE organizations ADD COLUMN public_handle text;
UPDATE organizations SET public_handle = slug;
ALTER TABLE organizations ALTER COLUMN public_handle SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organizations_public_handle_format CHECK (public_handle ~ '^[a-z0-9]+([_-][a-z0-9]+)*$');
CREATE UNIQUE INDEX organizations_public_handle_unique ON organizations (public_handle);

UPDATE stores s
SET public_handle = o.public_handle
FROM organizations o
WHERE o.id = s.organization_id;
