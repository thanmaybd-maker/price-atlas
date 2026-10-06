BEGIN;
CREATE TABLE IF NOT EXISTS atlas.collection_budget(day text PRIMARY KEY, requests integer NOT NULL DEFAULT 0 CHECK(requests>=0));
REVOKE ALL ON atlas.collection_budget FROM PUBLIC;
INSERT INTO atlas.migrations(version) VALUES('003_collection_budget') ON CONFLICT DO NOTHING;
COMMIT;
