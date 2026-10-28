BEGIN;
CREATE TABLE IF NOT EXISTS atlas.provider_cursor(id text PRIMARY KEY,fingerprint text NOT NULL,updated_at bigint NOT NULL);
INSERT INTO atlas.migrations(version) VALUES('010_provider_cursor') ON CONFLICT DO NOTHING;
COMMIT;
