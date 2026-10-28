BEGIN;
CREATE TABLE IF NOT EXISTS atlas.provider_keys (
 fingerprint text PRIMARY KEY,
 disabled boolean NOT NULL DEFAULT false,
 retry_after bigint NOT NULL DEFAULT 0,
 last_error text,
 updated_at bigint NOT NULL
);
INSERT INTO atlas.migrations(version) VALUES('008_provider_keys') ON CONFLICT DO NOTHING;
COMMIT;
