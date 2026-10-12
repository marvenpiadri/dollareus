ALTER TABLE api_credentials
  ADD COLUMN usage_day date,
  ADD COLUMN daily_request_count integer NOT NULL DEFAULT 0
    CHECK (daily_request_count >= 0);
