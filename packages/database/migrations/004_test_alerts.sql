BEGIN;
CREATE TABLE IF NOT EXISTS atlas.test_alerts(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES atlas.users(id) ON DELETE CASCADE, channel text NOT NULL CHECK(channel IN ('email','telegram')), data jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','suppressed','review')), provider_id text, created_at bigint NOT NULL);
REVOKE ALL ON atlas.test_alerts FROM PUBLIC;
INSERT INTO atlas.migrations(version) VALUES('004_test_alerts') ON CONFLICT DO NOTHING;
COMMIT;
