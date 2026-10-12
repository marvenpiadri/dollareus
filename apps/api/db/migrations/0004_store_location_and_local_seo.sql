ALTER TABLE stores ADD COLUMN location_name text;
ALTER TABLE stores ADD COLUMN address_line text;
ALTER TABLE stores ADD COLUMN city text;
ALTER TABLE stores ADD COLUMN country_code char(2) CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
ALTER TABLE stores ADD COLUMN phone text;
ALTER TABLE stores ADD COLUMN website_url text;
ALTER TABLE stores ADD COLUMN google_maps_url text;
