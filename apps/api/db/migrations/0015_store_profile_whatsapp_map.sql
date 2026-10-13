ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE stores ADD CONSTRAINT stores_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE stores ADD CONSTRAINT stores_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
