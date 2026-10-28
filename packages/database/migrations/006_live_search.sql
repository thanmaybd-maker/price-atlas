BEGIN;
CREATE TABLE IF NOT EXISTS atlas.search_cache(query_key text PRIMARY KEY, state text NOT NULL CHECK(state IN ('pending','complete')), data jsonb NOT NULL DEFAULT '{}'::jsonb, expires_at bigint NOT NULL);
REVOKE ALL ON atlas.search_cache FROM PUBLIC;
INSERT INTO atlas.migrations(version) VALUES('006_live_search') ON CONFLICT DO NOTHING;
COMMIT;
