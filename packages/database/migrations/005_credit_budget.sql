BEGIN;
ALTER TABLE atlas.collection_budget ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0 CHECK(credits>=0);
INSERT INTO atlas.migrations(version) VALUES('005_credit_budget') ON CONFLICT DO NOTHING;
COMMIT;
