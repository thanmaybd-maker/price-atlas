BEGIN;
ALTER TABLE atlas.listings ADD COLUMN IF NOT EXISTS catalog_interval_minutes integer NOT NULL DEFAULT 1440;
CREATE TABLE IF NOT EXISTS atlas.catalog_expansion (
 id text PRIMARY KEY,
 enabled boolean NOT NULL DEFAULT false,
 target integer NOT NULL DEFAULT 2500,
 lease_until bigint NOT NULL DEFAULT 0,
 blocked_until bigint NOT NULL DEFAULT 0,
 last_error text,
 updated_at bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS atlas.catalog_pages (
 path text PRIMARY KEY,
 priority integer NOT NULL,
 next_page integer NOT NULL DEFAULT 1,
 exhausted boolean NOT NULL DEFAULT false,
 updated_at bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS atlas.catalog_frontier (
 id text PRIMARY KEY,
 url text NOT NULL,
 name text NOT NULL,
 priority integer NOT NULL,
 state text NOT NULL DEFAULT 'pending',
 available_at bigint NOT NULL DEFAULT 0,
 lease_until bigint NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 product_id text,
 updated_at bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS catalog_frontier_due ON atlas.catalog_frontier(state,available_at,priority);
INSERT INTO atlas.migrations(version) VALUES('009_catalog_expansion') ON CONFLICT DO NOTHING;
COMMIT;
