ALTER TABLE stores DROP CONSTRAINT stores_business_type_check;
ALTER TABLE stores ADD CONSTRAINT stores_business_type_check
  CHECK (business_type IN ('retail', 'restaurant', 'cafe', 'freelancer', 'services', 'digital', 'general'));
