-- Add required public usernames and a first-party five-heart review ledger.
-- Review emails remain private; only verified reviews may be published.
ALTER TABLE users
  ADD COLUMN username text;

DO $$
DECLARE
  u record;
  base_name text;
  candidate text;
  suffix integer;
BEGIN
  FOR u IN
    SELECT id, COALESCE(NULLIF(split_part(email, '@', 1), ''), 'user-' || left(replace(id, '-', ''), 8)) AS seed
    FROM users
    WHERE username IS NULL
    ORDER BY created_at, id
  LOOP
    base_name := lower(regexp_replace(u.seed, '[^a-zA-Z0-9_-]+', '-', 'g'));
    base_name := trim(both '-_' from base_name);
    IF length(base_name) < 3 THEN
      base_name := 'user-' || left(replace(u.id, '-', ''), 8);
    END IF;
    base_name := left(base_name, 30);
    candidate := base_name;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := left(base_name, 30 - length(suffix::text) - 1) || '-' || suffix::text;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = u.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL,
  ADD CONSTRAINT users_username_format_check
    CHECK (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$');

CREATE UNIQUE INDEX users_username_unique_idx ON users (username);

CREATE TABLE store_reviews (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NOT NULL CHECK (length(btrim(review_text)) BETWEEN 3 AND 5000),
  reviewer_email text NOT NULL CHECK (length(reviewer_email) BETWEEN 3 AND 254 AND reviewer_email = lower(btrim(reviewer_email))),
  email_verified_at timestamptz,
  status text NOT NULL CHECK (status IN ('pending_verification', 'published', 'hidden', 'rejected')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz
);
CREATE UNIQUE INDEX store_reviews_one_email_per_store_idx
  ON store_reviews (store_id, reviewer_email);
CREATE INDEX store_reviews_public_rating_idx
  ON store_reviews (store_id, status, published_at DESC);
CREATE INDEX store_reviews_moderation_idx
  ON store_reviews (status, created_at);

CREATE TABLE store_review_verification_tokens (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES store_reviews(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX store_review_verification_expiry_idx
  ON store_review_verification_tokens (expires_at);

